'use strict';

/* ============================================================
   HEARTLAND 26 — Core Game Engine
   Features:
   - Dynamic Day/Night Cycle & Light Dynamics (pooled point lights, shadows)
   - Toggleable Flashlight (1P & 3P volumetric cone)
   - Extended 81-Block Kansas City Map with Distance Culling
   - Weather System (Clear, Rain, Thunderstorm, Fog, Snow)
   - 1st Person & 3rd Person Camera (On-Foot & Vehicle)
   - Slower, Weightier 1st-Person Walking & Weapon Sway Animation
   - Shooter Movements: Crouch, Tactical Slide, Lean L/R, ADS Aim, Variable Zoom
   - OBB Vehicle & Prop Collisions + Destructible Hydrants/Lamps/Benches
   - Smart NPC Sidewalk/Corner Navigation, Traffic Awareness & Whisker Pathing
   - Full XInput Gamepad Controller Support + Haptic Rumble
   - Customizable Character, Multiplayer Sessions & 45m Proximity Voice Chat
   ============================================================ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const dist2 = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);
const $ = (id) => document.getElementById(id);

const viewportEl = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
else renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.autoClear = false;
renderer.domElement.id = 'game-canvas';
viewportEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.FogExp2(0x070b14, 0.0038);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 620);
camera.rotation.order = 'YXZ';

/* ============================================================
   Dynamic Lighting, Day/Night Cycle & Flashlight
   ============================================================ */
const hemi = new THREE.HemisphereLight(0x51678e, 0x07070a, 0.7);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x24304a, 0.48);
scene.add(ambient);

const sunMoonLight = new THREE.DirectionalLight(0xb9ccff, 1.7);
sunMoonLight.position.set(78, 128, 52);
sunMoonLight.castShadow = true;
sunMoonLight.shadow.mapSize.set(1024, 1024);
sunMoonLight.shadow.camera.left = -95;
sunMoonLight.shadow.camera.right = 95;
sunMoonLight.shadow.camera.top = 95;
sunMoonLight.shadow.camera.bottom = -95;
sunMoonLight.shadow.camera.near = 5;
sunMoonLight.shadow.camera.far = 320;
sunMoonLight.shadow.bias = -0.00045;
sunMoonLight.shadow.normalBias = 0.03;
scene.add(sunMoonLight);
scene.add(sunMoonLight.target);

/* Vehicle Headlights */
const carLight = new THREE.SpotLight(0xfff1cc, 0, 68, 0.42, 0.48, 1.45);
carLight.position.set(0, 2, 0);
carLight.target.position.set(0, 0, -10);
scene.add(carLight);
scene.add(carLight.target);

/* Player Toggleable Flashlight */
const flashLight = new THREE.SpotLight(0xfff7e0, 0, 56, 0.44, 0.52, 1.35);
flashLight.position.set(0, 1.5, 0);
flashLight.target.position.set(0, 1.5, -10);
scene.add(flashLight);
scene.add(flashLight.target);

/* Dynamic Muzzle / Combat Flash Light */
const combatFlashLight = new THREE.PointLight(0xffb85c, 0, 18, 2);
scene.add(combatFlashLight);

/* Pool of 8 Dynamic Local PointLights for nearest streetlamps at night */
const LAMP_LIGHT_POOL_SIZE = 8;
const lampLightPool = [];
for (let i = 0; i < LAMP_LIGHT_POOL_SIZE; i++) {
  const pl = new THREE.PointLight(0xffbe73, 0, 24, 1.8);
  pl.position.set(0, -99, 0);
  scene.add(pl);
  lampLightPool.push(pl);
}

/* ---------- Dynamic Sky, Stars, Sun & Moon ---------- */
const skyUniforms = {
  uTopColor: { value: new THREE.Color(0.004, 0.007, 0.016) },
  uHorizonColor: { value: new THREE.Color(0.05, 0.07, 0.108) },
  uGlowColor: { value: new THREE.Color(0.12, 0.065, 0.04) },
  uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.5).normalize() },
  uSunGlow: { value: 0.2 }
};

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(520, 28, 14),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 uTopColor;',
      'uniform vec3 uHorizonColor;',
      'uniform vec3 uGlowColor;',
      'uniform vec3 uSunDir;',
      'uniform float uSunGlow;',
      'void main(){',
      '  float h = max(vDir.y, 0.0);',
      '  vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.55));',
      '  float glow = pow(1.0 - abs(vDir.y), 14.0);',
      '  col += uGlowColor * glow * 0.75;',
      '  float sunAmt = max(dot(vDir, uSunDir), 0.0);',
      '  col += uGlowColor * pow(sunAmt, 16.0) * uSunGlow;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  })
);
sky.frustumCulled = false;
scene.add(sky);

let starsPoints = null;
{
  const starCount = 1300;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rand(0, Math.PI * 2);
    const y = rand(0.055, 1);
    const r = Math.sqrt(1 - y * y);
    const radius = 475;
    positions[i * 3] = Math.cos(a) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(a) * r * radius;
    const warmth = rand(0, 1);
    colors[i * 3] = lerp(0.58, 0.9, warmth);
    colors[i * 3 + 1] = lerp(0.7, 0.86, warmth);
    colors[i * 3 + 2] = lerp(0.92, 1, warmth);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starsPoints = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.55, vertexColors: true, transparent: true, opacity: 0.85,
    depthWrite: false, sizeAttenuation: true, fog: false, toneMapped: false
  }));
  starsPoints.frustumCulled = false;
  scene.add(starsPoints);
}

function makeCelestialTexture(isSun = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, isSun ? 10 : 14, 64, 64, 64);
  if (isSun) {
    g.addColorStop(0, 'rgba(255,252,235,1)');
    g.addColorStop(0.28, 'rgba(255,220,145,0.92)');
    g.addColorStop(0.55, 'rgba(255,165,65,0.28)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
  } else {
    g.addColorStop(0, 'rgba(242,247,255,1)');
    g.addColorStop(0.24, 'rgba(220,234,255,0.96)');
    g.addColorStop(0.43, 'rgba(160,190,255,0.28)');
    g.addColorStop(1, 'rgba(80,110,200,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return KC.makeCanvasTexture(c, false);
}

const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeCelestialTexture(false), color: 0xffffff, transparent: true, opacity: 0.92,
  depthWrite: false, fog: false, toneMapped: false
}));
moonSprite.scale.set(44, 44, 1);
scene.add(moonSprite);

const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeCelestialTexture(true), color: 0xffe6b0, transparent: true, opacity: 0.95,
  depthWrite: false, fog: false, toneMapped: false
}));
sunSprite.scale.set(62, 62, 1);
scene.add(sunSprite);

/* ---------- Globals ---------- */
const FX_GLOW_TEX = KC.makeGlowTexture(0.4);

let city = null;
let activeVehicle = null;
let nearestCar = null;
let contractMarker = null;
let playerRig = null;
let gameTime = 0;
let menuTime = 0;
let hudTimer = 0;
let minimapTimer = 0;
let areaTimer = 0;
let cullTimer = 0;
let lampSortTimer = 0;

const cars = [];
const helis = [];
const planes = [];
const boats = [];
const peds = [];
const pedBubbles = [];
const cops = [];
const thugs = [];
const keys = Object.create(null);
const pointer = { locked: false, firing: false, aiming: false, sensitivity: 1.0 };
const raycaster = new THREE.Raycaster();

const G = {
  mode: 'menu',
  sound: new SoundEngine(),
  city: null,
  muted: false,
  loadError: null
};

const WEAPONS = [
  { name: '9MM PISTOL', slot: '01', mag: 12, damage: 28, rate: 0.17, spread: 0.012, range: 105, recoil: 0.014, reload: 1.25, sound: 'pistol' },
  { name: 'VECTOR CARBINE', slot: '02', mag: 24, damage: 34, rate: 0.095, spread: 0.0075, range: 165, recoil: 0.009, reload: 1.65, sound: 'rifle' }
];

const ZOOM_LEVELS = [1.25, 2.0, 3.2];

const player = {
  pos: new THREE.Vector3(2, 0, 10),
  vel: new THREE.Vector3(),
  yaw: -2.35,
  pitch: 0,
  eye: 1.64,
  currentEye: 1.64,
  radius: 0.42,
  vy: 0,
  onGround: true,
  bob: 0,
  bobPhase: 0,
  footstep: 0,
  shake: 0,
  recoilPitch: 0,
  recoilYaw: 0,
  carLookYaw: 0,
  carLookPitch: 0,
  /* New Shooter, Camera & 3P Animation state */
  cameraMode: '1p', // '1p' or '3p'
  crouching: false,
  slideTimer: 0,
  slideDir: new THREE.Vector3(),
  lean: 0, // -1 left, 0 center, +1 right
  leanAmount: 0, // smoothed -1..+1
  aiming: false,
  adsBlend: 0,
  zoomIndex: 0,
  flashlightOn: false,
  prevYaw: -2.35,
  turnRate: 0,
  strafeAngle: 0,
  landingImpact: 0
};

/* ============================================================
   Per-Game Day/Night Cycle & Weather Settings
   ============================================================ */
const WORLD_SETTINGS_OPTIONS = {
  dayNightModes: [
    { id: 'DYNAMIC', label: 'DYNAMIC 24H CYCLE', locked: false },
    { id: 'DAWN', label: 'LOCKED: DAWN (06:30)', locked: true, time: 6 * 60 + 30 },
    { id: 'DAY', label: 'LOCKED: MIDDAY (12:30)', locked: true, time: 12 * 60 + 30 },
    { id: 'DUSK', label: 'LOCKED: SUNSET (19:30)', locked: true, time: 19 * 60 + 30 },
    { id: 'NIGHT', label: 'LOCKED: MIDNIGHT (00:00)', locked: true, time: 0 },
    { id: 'CUSTOM_LOCKED', label: 'LOCKED: CUSTOM TIME', locked: true }
  ],
  cycleSpeeds: [
    { id: 'SLOW', label: 'SLOW (12M / DAY)', speed: 2 },
    { id: 'NORMAL', label: 'NORMAL (3M / DAY)', speed: 8 },
    { id: 'FAST', label: 'FAST (80S / DAY)', speed: 18 },
    { id: 'HYPER', label: 'HYPER (24S / DAY)', speed: 60 }
  ],
  weatherModes: [
    { id: 'DYNAMIC', label: 'DYNAMIC WEATHER', locked: false },
    { id: 'CLEAR', label: 'LOCKED: CLEAR SKIES', locked: true, weather: 'CLEAR' },
    { id: 'RAIN', label: 'LOCKED: RAIN', locked: true, weather: 'RAIN' },
    { id: 'STORM', label: 'LOCKED: THUNDERSTORM', locked: true, weather: 'STORM' },
    { id: 'FOG', label: 'LOCKED: DENSE FOG', locked: true, weather: 'FOG' },
    { id: 'SNOW', label: 'LOCKED: MIDWEST SNOW', locked: true, weather: 'SNOW' }
  ],
  weatherFrequencies: [
    { id: 'CALM', label: 'CALM (RARE STORMS)', minT: 110, maxT: 170, pool: ['CLEAR', 'CLEAR', 'RAIN', 'FOG'] },
    { id: 'BALANCED', label: 'BALANCED (STANDARD)', minT: 65, maxT: 115, pool: ['CLEAR', 'RAIN', 'STORM', 'FOG', 'SNOW'] },
    { id: 'EXTREME', label: 'EXTREME (FREQUENT STORMS)', minT: 25, maxT: 48, pool: ['RAIN', 'STORM', 'STORM', 'FOG', 'SNOW'] }
  ]
};

const DEFAULT_WORLD_SETTINGS = {
  dayNightMode: 'DYNAMIC',
  startTimeMinutes: 19 * 60 + 30,
  cycleSpeedPreset: 'FAST',
  weatherMode: 'DYNAMIC',
  weatherFrequency: 'BALANCED'
};

function loadWorldSettings() {
  try {
    const raw = localStorage.getItem('heartland26_world_settings');
    if (raw) return { ...DEFAULT_WORLD_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_WORLD_SETTINGS };
}

function saveWorldSettings(cfg) {
  try {
    localStorage.setItem('heartland26_world_settings', JSON.stringify(cfg));
  } catch (e) {}
}

const worldSettings = loadWorldSettings();

const state = {
  health: 100,
  armor: 50,
  cash: 500,
  wanted: 0,
  evadeTimer: 0,
  policeTimer: 1.5,
  lastPoliceCar: -99,
  weapon: 0,
  ammo: [12, 24],
  fireTimer: 0,
  reloading: false,
  reloadTimer: 0,
  reloadClick: false,
  recoilPitch: 0,
  recoilYaw: 0,
  muzzleTimer: 0,
  hornTimer: 0,
  kills: 0,
  contracts: 0,
  damageTimer: 99,
  damageFlash: 0,
  /* Continuous Day/Night time in minutes (0..1440), starts at 19:30 sunset/dusk so cycle is visible immediately */
  timeMinutes: 19 * 60 + 30,
  daySpeed: 18, // game minutes per real second (full 24h cycle in ~80s, adjustable)
  nightFactor: 0.7, // 0 = bright midday, 1 = deep night
  weather: 'CLEAR', // 'CLEAR', 'RAIN', 'STORM', 'FOG', 'SNOW'
  weatherTimer: 95,
  lightningFlash: 0,
  thunderTimer: 12,
  bestCash: 0,
  firing: false,
  gamepadConnected: false,
   gamepadName: '',
  contract: {
    number: 1,
    reward: 1200,
    stage: 'travel',
    location: 'Kauffman Center',
    marker: null,
    cooldown: 0,
    remaining: 0,
    total: 0
  }
};

/* ============================================================
   Day/Night Cycle & Light Dynamics Engine
   ============================================================ */
const DAY_SKY_TOP = new THREE.Color(0x1f5ca8);
const DAY_SKY_HORIZON = new THREE.Color(0x8ec5fc);
const DUSK_SKY_TOP = new THREE.Color(0x131b38);
const DUSK_SKY_HORIZON = new THREE.Color(0xd96b38);
const NIGHT_SKY_TOP = new THREE.Color(0x010206);
const NIGHT_SKY_HORIZON = new THREE.Color(0x0b101c);

const workColorA = new THREE.Color();
const workColorB = new THREE.Color();

function updateDayNightCycle(dt) {
  state.timeMinutes = (state.timeMinutes + dt * state.daySpeed) % 1440;
  if (state.timeMinutes < 0) state.timeMinutes += 1440;

  const hours = state.timeMinutes / 60;
  /* Sun elevation angle: -1 at midnight (0h), 0 at 6h (dawn), +1 at 12h (noon), 0 at 18h (dusk) */
  const sunAngle = ((hours - 6) / 24) * Math.PI * 2;
  const sunElev = Math.sin(sunAngle);
  const sunAzim = Math.cos(sunAngle);

  const dayFactor = clamp((sunElev + 0.14) / 0.55, 0, 1);
  const nightFactor = 1 - dayFactor;
  const twilight = clamp(1 - Math.abs(sunElev) / 0.32, 0, 1);
  state.nightFactor = nightFactor;

  /* Weather darkening factor */
  const isStorm = state.weather === 'STORM';
  const isRain = state.weather === 'RAIN' || isStorm;
  const isFog = state.weather === 'FOG';
  const isSnow = state.weather === 'SNOW';
  const overcast = isStorm ? 0.58 : (isRain || isFog || isSnow) ? 0.35 : 0;

  /* Sky shader colors */
  workColorA.copy(NIGHT_SKY_TOP).lerp(DAY_SKY_TOP, dayFactor);
  if (twilight > 0) workColorA.lerp(DUSK_SKY_TOP, twilight * 0.65);
  if (overcast > 0) workColorA.lerp(new THREE.Color(0x1c222e), overcast);

  workColorB.copy(NIGHT_SKY_HORIZON).lerp(DAY_SKY_HORIZON, dayFactor);
  if (twilight > 0) workColorB.lerp(DUSK_SKY_HORIZON, twilight * 0.85);
  if (overcast > 0) workColorB.lerp(new THREE.Color(0x363e4d), overcast);

  if (state.lightningFlash > 0.01) {
    workColorA.lerp(new THREE.Color(0xdbe8ff), state.lightningFlash * 0.7);
    workColorB.lerp(new THREE.Color(0xffffff), state.lightningFlash * 0.8);
  }

  skyUniforms.uTopColor.value.copy(workColorA);
  skyUniforms.uHorizonColor.value.copy(workColorB);
  skyUniforms.uGlowColor.value.setRGB(
    lerp(0.12, 0.95, twilight * 0.85 + dayFactor * 0.25),
    lerp(0.07, 0.48, twilight * 0.65 + dayFactor * 0.35),
    lerp(0.05, 0.22, dayFactor)
  );
  skyUniforms.uSunGlow.value = lerp(0.15, 0.85, twilight + dayFactor * 0.35);

  /* Fog color & density */
  scene.background.copy(workColorB);
  scene.fog.color.copy(workColorB);
  const baseFog = isFog ? 0.012 : isStorm ? 0.0068 : isRain ? 0.0052 : isSnow ? 0.0058 : lerp(0.0038, 0.0024, dayFactor);
  scene.fog.density = lerp(scene.fog.density, baseFog, Math.min(1, dt * 3));

  /* Sun & Moon positions */
  const orbitR = 360;
  const sx = -sunAzim * orbitR;
  const sy = sunElev * orbitR;
  const sz = -140;
  sunSprite.position.set(sx, sy, sz);
  sunSprite.material.opacity = clamp((sunElev + 0.08) * 3, 0, 0.95) * (1 - overcast * 0.8);
  skyUniforms.uSunDir.value.set(sx, Math.max(0.05, sy), sz).normalize();

  moonSprite.position.set(-sx * 0.85, Math.max(40, -sy * 0.85), -260);
  moonSprite.material.opacity = clamp(nightFactor * 1.2 - 0.2, 0, 0.92) * (1 - overcast * 0.7);
  if (starsPoints) {
    starsPoints.material.opacity = clamp((nightFactor - 0.35) * 1.5, 0, 0.88) * (1 - overcast * 0.9);
  }

  /* Directional Light & Player-Tracking Shadow Camera */
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  const snapX = Math.round(px / 8) * 8;
  const snapZ = Math.round(pz / 8) * 8;

  const activeDirX = sunElev > -0.05 ? sx * 0.35 : -sx * 0.28;
  const activeDirY = Math.max(65, Math.abs(sy) * 0.45 + 55);
  const activeDirZ = sunElev > -0.05 ? 65 : 52;
  sunMoonLight.position.set(snapX + activeDirX, activeDirY, snapZ + activeDirZ);
  sunMoonLight.target.position.set(snapX, 0, snapZ);
  sunMoonLight.target.updateMatrixWorld();

  const sunCol = new THREE.Color(0xfff1d6);
  const duskCol = new THREE.Color(0xff8e47);
  const moonCol = new THREE.Color(0xaec6ff);
  sunMoonLight.color.copy(moonCol).lerp(sunCol, dayFactor);
  if (twilight > 0) sunMoonLight.color.lerp(duskCol, twilight * 0.75);
  sunMoonLight.intensity = lerp(1.55, 3.1, dayFactor) * (1 - overcast * 0.4) + state.lightningFlash * 4.5;

  hemi.color.copy(new THREE.Color(0x4c6288)).lerp(new THREE.Color(0x9ec8ff), dayFactor);
  hemi.groundColor.copy(new THREE.Color(0x08080c)).lerp(new THREE.Color(0x38343a), dayFactor);
  hemi.intensity = lerp(0.65, 1.35, dayFactor) + state.lightningFlash * 1.5;
  ambient.intensity = lerp(0.45, 0.95, dayFactor);

  /* City Emissive Windows, Streetlamps, Light Pools & Wet Roads */
  if (city) {
    const cityLightsOn = clamp((nightFactor - 0.22) * 1.6 + overcast * 0.5, 0, 1);
    const flicker = 0.97 + Math.sin(gameTime * 19) * 0.03;
    for (const mat of city.facadeMats) {
      mat.emissiveIntensity = cityLightsOn * 1.35 * flicker;
    }
    if (city.lampBulbMat) {
      city.lampBulbMat.color.setHex(cityLightsOn > 0.25 ? 0xffd39a : 0x55524d);
    }
    for (const g of city.lampGlows) {
      g.mat.opacity = g.baseOpacity * cityLightsOn;
    }
    for (const p of city.lightPools) {
      p.mat.opacity = p.baseOpacity * cityLightsOn;
    }
    for (const s of city.signs) {
      if (s.gmat) s.gmat.opacity = s.baseGlow * (0.25 + cityLightsOn * 0.95);
    }
    /* Wet road reflections during rain/storm */
    if (city.materials && city.materials.asphaltMat) {
      const targetRough = isRain ? 0.26 : isSnow ? 0.95 : 0.88;
      const targetMetal = isRain ? 0.45 : 0.06;
      city.materials.asphaltMat.roughness = lerp(city.materials.asphaltMat.roughness, targetRough, dt * 2);
      city.materials.asphaltMat.metalness = lerp(city.materials.asphaltMat.metalness, targetMetal, dt * 2);
    }

    /* Pooled Dynamic PointLights for nearest streetlamps */
    lampSortTimer += dt;
    if (lampSortTimer >= 0.35) {
      lampSortTimer = 0;
      if (cityLightsOn <= 0.08 || !city.streetLamps.length) {
        for (const pl of lampLightPool) pl.intensity = 0;
      } else {
        const lamps = city.streetLamps;
        const nearby = [];
        for (let i = 0; i < lamps.length; i++) {
          const l = lamps[i];
          if (l.broken) continue;
          const d2 = (l.x - px) * (l.x - px) + (l.z - pz) * (l.z - pz);
          if (d2 < 75 * 75) nearby.push({ l, d2 });
        }
        nearby.sort((a, b) => a.d2 - b.d2);
        for (let i = 0; i < LAMP_LIGHT_POOL_SIZE; i++) {
          const pl = lampLightPool[i];
          if (i < nearby.length) {
            const lamp = nearby[i].l;
            pl.position.set(lamp.x, lamp.y - 0.25, lamp.z);
            pl.intensity = 18 * cityLightsOn;
          } else {
            pl.intensity = 0;
          }
        }
      }
    }
  }

  /* Update Flashlight Position & Direction */
  if (player.flashlightOn && G.mode === 'playing' && !activeVehicle) {
    flashLight.intensity = 68;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (player.cameraMode === '3p' && playerRig) {
      const handPos = new THREE.Vector3();
      playerRig.torchGroup.getWorldPosition(handPos);
      flashLight.position.copy(handPos);
      flashLight.target.position.copy(handPos).addScaledVector(dir, 22);
    } else {
      const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      flashLight.position.copy(camera.position).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.14, 0));
      flashLight.target.position.copy(camera.position).addScaledVector(dir, 24);
    }
    flashLight.target.updateMatrixWorld();
  } else {
    flashLight.intensity = 0;
  }

  /* Decay dynamic combat flash light */
  if (combatFlashLight.intensity > 0.05) {
    combatFlashLight.intensity *= Math.exp(-dt * 24);
  } else {
    combatFlashLight.intensity = 0;
  }
}

function toggleFlashlight() {
  if (G.mode !== 'playing') return;
  player.flashlightOn = !player.flashlightOn;
  G.sound.flashlight(player.flashlightOn);
  notify('GEAR', player.flashlightOn ? 'FLASHLIGHT ON [F]' : 'FLASHLIGHT OFF [F]');
  updateHUD();
}

function cycleTimeOfDay() {
  /* Jump +4 hours so player can quickly test Dawn / Midday / Dusk / Night */
  state.timeMinutes = (state.timeMinutes + 240) % 1440;
  worldSettings.startTimeMinutes = Math.round(state.timeMinutes);
  saveWorldSettings(worldSettings);
  updateDayNightCycle(0.01);
  updateClock();
  syncWorldSettingsUI();
  const h = Math.floor(state.timeMinutes / 60);
  const label = h >= 6 && h < 10 ? 'DAWN' : h >= 10 && h < 17 ? 'DAYTIME' : h >= 17 && h < 21 ? 'DUSK' : 'NIGHT';
  notify('TIME', 'CLOCK ADVANCED // ' + formatClock(state.timeMinutes) + ' (' + label + ')');
  G.sound.ui();
}

function getWeatherInterval() {
  const wf = WORLD_SETTINGS_OPTIONS.weatherFrequencies.find((f) => f.id === worldSettings.weatherFrequency) || WORLD_SETTINGS_OPTIONS.weatherFrequencies[1];
  return rand(wf.minT, wf.maxT);
}

function applyWorldSettings(newSettings = null, broadcast = true, isGameStart = false) {
  if (newSettings) {
    Object.assign(worldSettings, newSettings);
  }
  const dnObj = WORLD_SETTINGS_OPTIONS.dayNightModes.find((m) => m.id === worldSettings.dayNightMode) || WORLD_SETTINGS_OPTIONS.dayNightModes[0];
  const spdObj = WORLD_SETTINGS_OPTIONS.cycleSpeeds.find((s) => s.id === worldSettings.cycleSpeedPreset) || WORLD_SETTINGS_OPTIONS.cycleSpeeds[2];
  const wmObj = WORLD_SETTINGS_OPTIONS.weatherModes.find((w) => w.id === worldSettings.weatherMode) || WORLD_SETTINGS_OPTIONS.weatherModes[0];
  const wfObj = WORLD_SETTINGS_OPTIONS.weatherFrequencies.find((f) => f.id === worldSettings.weatherFrequency) || WORLD_SETTINGS_OPTIONS.weatherFrequencies[1];

  if (dnObj.locked) {
    state.daySpeed = 0;
    if (typeof dnObj.time === 'number') {
      state.timeMinutes = dnObj.time;
      worldSettings.startTimeMinutes = dnObj.time;
    } else {
      state.timeMinutes = worldSettings.startTimeMinutes;
    }
  } else {
    state.daySpeed = spdObj.speed;
    if (isGameStart) {
      state.timeMinutes = worldSettings.startTimeMinutes;
    }
  }

  if (wmObj.locked && wmObj.weather) {
    setWeather(wmObj.weather, false);
    state.weatherTimer = 999999;
  } else {
    if (isGameStart) {
      setWeather(wfObj.id === 'EXTREME' ? 'STORM' : 'CLEAR', false);
    }
    state.weatherTimer = getWeatherInterval();
  }

  saveWorldSettings(worldSettings);
  updateDayNightCycle(0);
  updateClock();
  syncWorldSettingsUI();
  if (broadcast && KC.multiplayer && KC.multiplayer.broadcastWorldSettings) {
    KC.multiplayer.broadcastWorldSettings(worldSettings);
  }
}

function syncWorldSettingsUI() {
  const dnObj = WORLD_SETTINGS_OPTIONS.dayNightModes.find((m) => m.id === worldSettings.dayNightMode) || WORLD_SETTINGS_OPTIONS.dayNightModes[0];
  const spdObj = WORLD_SETTINGS_OPTIONS.cycleSpeeds.find((s) => s.id === worldSettings.cycleSpeedPreset) || WORLD_SETTINGS_OPTIONS.cycleSpeeds[2];
  const wmObj = WORLD_SETTINGS_OPTIONS.weatherModes.find((w) => w.id === worldSettings.weatherMode) || WORLD_SETTINGS_OPTIONS.weatherModes[0];
  const wfObj = WORLD_SETTINGS_OPTIONS.weatherFrequencies.find((f) => f.id === worldSettings.weatherFrequency) || WORLD_SETTINGS_OPTIONS.weatherFrequencies[1];

  const setTxt = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  setTxt('world-dn-mode-val', dnObj.label);
  setTxt('world-cycle-speed-val', dnObj.locked ? 'LOCKED (STATIC)' : spdObj.label);
  setTxt('world-weather-mode-val', wmObj.label);
  setTxt('world-weather-freq-val', wmObj.locked ? 'LOCKED (' + wmObj.weather + ')' : wfObj.label);
  setTxt('world-start-time-val', formatClock(worldSettings.startTimeMinutes));
  if ($('world-start-time-slider')) $('world-start-time-slider').value = String(Math.round(worldSettings.startTimeMinutes));

  setTxt('pause-dn-mode-val', dnObj.label);
  setTxt('pause-cycle-speed-val', dnObj.locked ? 'LOCKED (STATIC)' : spdObj.label);
  setTxt('pause-weather-mode-val', wmObj.label);
  setTxt('pause-weather-freq-val', wmObj.locked ? 'LOCKED (' + wmObj.weather + ')' : wfObj.label);
  if ($('tod-slider')) $('tod-slider').value = String(Math.round(state.timeMinutes));
  setTxt('tod-value', formatClock(state.timeMinutes));

  const menuSummary = (dnObj.locked ? dnObj.label : 'DYNAMIC 24H (' + formatClock(worldSettings.startTimeMinutes) + ' · ' + spdObj.id + ')') +
    ' // WEATHER: ' + (wmObj.locked ? wmObj.label : 'DYNAMIC (' + wfObj.id + ')');
  setTxt('menu-world-status', menuSummary);
}

/* ============================================================
   Weather System (Clear, Rain, Storm, Fog, Snow)
   ============================================================ */
const WEATHER_TYPES = ['CLEAR', 'RAIN', 'STORM', 'FOG', 'SNOW'];
const WEATHER_COUNT = 1100;
const weatherPositions = new Float32Array(WEATHER_COUNT * 3);
const weatherVelocities = new Float32Array(WEATHER_COUNT);
for (let i = 0; i < WEATHER_COUNT; i++) {
  weatherPositions[i * 3] = rand(-24, 24);
  weatherPositions[i * 3 + 1] = rand(0, 26);
  weatherPositions[i * 3 + 2] = rand(-24, 24);
  weatherVelocities[i] = rand(0.8, 1.25);
}
const weatherGeo = new THREE.BufferGeometry();
weatherGeo.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3));
const weatherMat = new THREE.PointsMaterial({
  color: 0xaec8ee, size: 0.16, transparent: true, opacity: 0.65,
  depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
});
const weatherParticles = new THREE.Points(weatherGeo, weatherMat);
weatherParticles.frustumCulled = false;
weatherParticles.visible = false;
scene.add(weatherParticles);

function setWeather(type, announce = true) {
  if (!WEATHER_TYPES.includes(type)) type = 'CLEAR';
  state.weather = type;
  const wmObj = WORLD_SETTINGS_OPTIONS.weatherModes.find((w) => w.id === worldSettings.weatherMode);
  state.weatherTimer = (wmObj && wmObj.locked) ? 999999 : getWeatherInterval();
  const rainLevel = type === 'STORM' ? 1.0 : type === 'RAIN' ? 0.6 : 0;
  G.sound.setRainIntensity(rainLevel);
  if (announce && G.mode === 'playing') {
    notify('WEATHER', 'CONDITIONS // ' + type);
  }
  updateHUD();
}

function cycleWeather() {
  const idx = (WEATHER_TYPES.indexOf(state.weather) + 1) % WEATHER_TYPES.length;
  const nextW = WEATHER_TYPES[idx];
  /* If weather was locked in settings, update the lock to the newly chosen weather */
  if (worldSettings.weatherMode !== 'DYNAMIC') {
    worldSettings.weatherMode = nextW;
    saveWorldSettings(worldSettings);
  }
  setWeather(nextW, true);
  syncWorldSettingsUI();
  G.sound.ui();
}

function updateWeather(dt) {
  const wmObj = WORLD_SETTINGS_OPTIONS.weatherModes.find((w) => w.id === worldSettings.weatherMode);
  if (!wmObj || !wmObj.locked) {
    state.weatherTimer -= dt;
    if (state.weatherTimer <= 0) {
      const wfObj = WORLD_SETTINGS_OPTIONS.weatherFrequencies.find((f) => f.id === worldSettings.weatherFrequency) || WORLD_SETTINGS_OPTIONS.weatherFrequencies[1];
      setWeather(KC.pick(wfObj.pool), G.mode === 'playing');
    }
  }

  if (state.lightningFlash > 0) {
    state.lightningFlash = Math.max(0, state.lightningFlash - dt * 3.8);
  }

  if (state.weather === 'STORM') {
    state.thunderTimer -= dt;
    if (state.thunderTimer <= 0) {
      state.thunderTimer = rand(7, 16);
      state.lightningFlash = 1.0;
      player.shake = Math.max(player.shake, 0.25);
      G.sound.thunder();
    }
  }

  const showPrecip = state.weather === 'RAIN' || state.weather === 'STORM' || state.weather === 'SNOW';
  weatherParticles.visible = showPrecip;
  if (!showPrecip) return;

  const isSnow = state.weather === 'SNOW';
  weatherMat.color.setHex(isSnow ? 0xf2f6ff : 0x9ab8e6);
  weatherMat.size = isSnow ? 0.22 : (state.weather === 'STORM' ? 0.19 : 0.14);
  weatherMat.opacity = isSnow ? 0.78 : (state.weather === 'STORM' ? 0.72 : 0.55);

  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  const fallSpeed = isSnow ? 3.8 : (state.weather === 'STORM' ? 24 : 18);
  const windX = isSnow ? Math.sin(gameTime * 0.7) * 1.5 : (state.weather === 'STORM' ? 4.5 : 1.2);

  for (let i = 0; i < WEATHER_COUNT; i++) {
    const i3 = i * 3;
    const v = weatherVelocities[i];
    weatherPositions[i3] += windX * v * dt;
    weatherPositions[i3 + 1] -= fallSpeed * v * dt;
    if (isSnow) weatherPositions[i3 + 2] += Math.cos(gameTime + i) * 0.8 * dt;

    /* Keep particles wrapped inside a 48m box centered around camera for zero wasted particles */
    if (weatherPositions[i3 + 1] < 0.05) {
      weatherPositions[i3 + 1] = cy + rand(12, 24);
      weatherPositions[i3] = cx + rand(-24, 24);
      weatherPositions[i3 + 2] = cz + rand(-24, 24);
    } else {
      if (weatherPositions[i3] - cx > 24) weatherPositions[i3] -= 48;
      else if (weatherPositions[i3] - cx < -24) weatherPositions[i3] += 48;
      if (weatherPositions[i3 + 2] - cz > 24) weatherPositions[i3 + 2] -= 48;
      else if (weatherPositions[i3 + 2] - cz < -24) weatherPositions[i3 + 2] += 48;
    }
  }
  weatherGeo.attributes.position.needsUpdate = true;
}

/* ---------- Particles & Visual Effects ---------- */
const MAX_PARTICLES = 640;
const particlePositions = new Float32Array(MAX_PARTICLES * 3);
const particleColors = new Float32Array(MAX_PARTICLES * 3);
const particleMeta = new Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) {
  particlePositions[i * 3 + 1] = -999;
  particleMeta[i] = { life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, gravity: 0 };
}
const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
const particleSystem = new THREE.Points(particleGeo, new THREE.PointsMaterial({
  size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
  depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
}));
particleSystem.frustumCulled = false;
scene.add(particleSystem);
let particleCursor = 0;
let particlesDirty = false;

function spawnParticles(x, y, z, color, count = 8, speed = 3, life = 0.5, gravity = 9) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const idx = particleCursor++ % MAX_PARTICLES;
    const meta = particleMeta[idx];
    const theta = rand(0, Math.PI * 2);
    const phi = Math.acos(rand(-1, 1));
    const spd = speed * rand(0.25, 1);
    meta.life = life * rand(0.55, 1.25);
    meta.maxLife = meta.life;
    meta.vx = Math.sin(phi) * Math.cos(theta) * spd;
    meta.vy = Math.abs(Math.cos(phi)) * spd * rand(0.7, 1.35);
    meta.vz = Math.sin(phi) * Math.sin(theta) * spd;
    meta.gravity = gravity;
    particlePositions[idx * 3] = x + rand(-0.12, 0.12);
    particlePositions[idx * 3 + 1] = y + rand(-0.12, 0.12);
    particlePositions[idx * 3 + 2] = z + rand(-0.12, 0.12);
    const tint = rand(0.78, 1.22);
    particleColors[idx * 3] = clamp(c.r * tint, 0, 1);
    particleColors[idx * 3 + 1] = clamp(c.g * tint, 0, 1);
    particleColors[idx * 3 + 2] = clamp(c.b * tint, 0, 1);
  }
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
  particlesDirty = true;
}

const effects = [];

function addTracer(from, to, color = 0xffd08a, opacity = 0.8) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  if (length < 0.01) return;
  const geo = new THREE.CylinderGeometry(0.014, 0.014, length, 4, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  scene.add(mesh);
  effects.push({ type: 'tracer', mesh, mat, life: 0.075, t: 0 });
}

function addImpactFlash(point, color = 0xffb13b, scale = 0.5) {
  const mat = new THREE.SpriteMaterial({
    map: FX_GLOW_TEX, color, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(point);
  const s = 1.8 * scale;
  sprite.scale.set(s, s, 1);
  scene.add(sprite);
  effects.push({ type: 'flash', mesh: sprite, mat, life: 0.2, t: 0, baseScale: s });
}

function addShockwave(x, z, color = 0xff5b3a, scale = 2.2) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.12, z);
  const s = scale * 0.4;
  mesh.scale.set(s, s, s);
  scene.add(mesh);
  effects.push({ type: 'shock', mesh, mat, life: 0.5, t: 0, scale });
}

function updateEffects(dt) {
  if (particlesDirty) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const m = particleMeta[i];
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.life <= 0) {
        particlePositions[i * 3 + 1] = -999;
        continue;
      }
      m.vy -= m.gravity * dt;
      particlePositions[i * 3] += m.vx * dt;
      particlePositions[i * 3 + 1] += m.vy * dt;
      particlePositions[i * 3 + 2] += m.vz * dt;
      if (particlePositions[i * 3 + 1] < 0.04) {
        particlePositions[i * 3 + 1] = 0.04;
        m.vy *= -0.22;
        m.vx *= 0.72;
        m.vz *= 0.72;
      }
    }
    particleGeo.attributes.position.needsUpdate = true;
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) if (particleMeta[i].life > 0) { any = true; break; }
    particlesDirty = any;
  }

  /* Update broken hydrant water geysers */
  if (city && city.destructibleProps) {
    for (const p of city.destructibleProps) {
      if (p.broken && p.kind === 'hydrant' && p.geyserTimer > 0) {
        p.geyserTimer -= dt;
        if (Math.random() < 0.75) {
          spawnParticles(p.x, 0.35, p.z, 0x8ad8ff, 3, 5.8, 0.65, 11);
        }
      }
    }
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const k = e.t / e.life;
    if (k >= 1) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mat.dispose();
      effects.splice(i, 1);
      continue;
    }
    if (e.type === 'tracer') {
      e.mat.opacity = (1 - k) * 0.8;
    } else if (e.type === 'flash') {
      e.mat.opacity = (1 - k) * 0.9;
      const s = e.baseScale * (1 + k * 0.8);
      e.mesh.scale.set(s, s, 1);
    } else if (e.type === 'shock') {
      const s = (0.4 + k * 1.5) * e.scale;
      e.mesh.scale.set(s, s, s);
      e.mat.opacity = (1 - k) * 0.55;
    }
  }
}

/* ============================================================
   1st-Person Weapon Viewmodels (Slower Walk Anim + ADS + Lean)
   ============================================================ */
const weaponScene = new THREE.Scene();
const weaponCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 5);
const weaponRoot = new THREE.Group();
weaponRoot.visible = false;
weaponScene.add(weaponRoot);
weaponScene.add(new THREE.AmbientLight(0xc4d4ee, 1.7));
{
  const key = new THREE.DirectionalLight(0xffe2b3, 2.3);
  key.position.set(1, 2, 1.4);
  weaponScene.add(key);
  const rim = new THREE.DirectionalLight(0x6fa8ff, 1.25);
  rim.position.set(-1.2, 0.6, -1);
  weaponScene.add(rim);
}
const weaponGroups = [];

function gunBox(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function gunCylinder(parent, radius, length, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addMuzzleFlash(parent, position) {
  const mat = new THREE.SpriteMaterial({
    map: FX_GLOW_TEX, color: 0xffc96e, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  sprite.scale.set(0.33, 0.33, 1);
  sprite.visible = false;
  parent.add(sprite);
  return sprite;
}

function buildPistolView() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x252a32, roughness: 0.4, metalness: 0.3, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0x77808c, roughness: 0.32, metalness: 0.34, flatShading: true });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.82, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc08a66, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b333e, roughness: 0.9 });
  gunBox(g, 0.155, 0.135, 0.56, steel, 0, 0.045, -0.19);
  gunBox(g, 0.11, 0.045, 0.5, dark, 0, 0.135, -0.2);
  gunBox(g, 0.145, 0.075, 0.11, dark, 0, 0.02, 0.085);
  gunCylinder(g, 0.042, 0.17, steel, 0, 0.045, -0.51);
  gunBox(g, 0.035, 0.04, 0.035, dark, 0, 0.08, -0.485);
  gunBox(g, 0.025, 0.03, 0.025, steel, 0, 0.095, 0.08);
  gunBox(g, 0.12, 0.03, 0.03, dark, 0, 0.1, 0.04);
  gunBox(g, 0.145, 0.3, 0.19, gripMat, 0, -0.17, 0.055, -0.17);
  gunBox(g, 0.055, 0.055, 0.14, dark, 0, -0.06, -0.13);
  gunBox(g, 0.15, 0.13, 0.18, skin, 0.015, -0.21, 0.065, -0.08);
  gunBox(g, 0.11, 0.1, 0.15, skin, -0.05, -0.245, 0.14, -0.32, 0.24, -0.12);
  for (let i = 0; i < 3; i++) {
    gunBox(g, 0.045, 0.034, 0.11, skin, 0.083, -0.135 - i * 0.045, -0.025, 0.03, 0, 0.08);
  }
  gunBox(g, 0.03, 0.075, 0.11, skin, -0.07, -0.165, -0.02, 0.1, 0, -0.2);
  gunBox(g, 0.17, 0.18, 0.4, sleeve, 0.025, -0.32, 0.35, 0.1);
  gunBox(g, 0.15, 0.16, 0.36, sleeve, -0.07, -0.35, 0.38, 0.18, 0.15, 0.05);
  const muzzle = new THREE.Vector3(0, 0.045, -0.6);
  const flash = addMuzzleFlash(g, muzzle);
  g.userData = {
    basePos: new THREE.Vector3(0.34, -0.225, -1.0),
    adsPos: new THREE.Vector3(0.0, -0.102, -0.78),
    baseRot: new THREE.Euler(0.02, 0.2, 0.02),
    adsRot: new THREE.Euler(0.0, 0.0, 0.0),
    flash, muzzle
  };
  g.position.copy(g.userData.basePos);
  g.rotation.copy(g.userData.baseRot);
  g.scale.setScalar(0.55);
  return g;
}

function buildRifleView() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x252b33, roughness: 0.42, metalness: 0.3, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0x7b8490, roughness: 0.34, metalness: 0.32, flatShading: true });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.84, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc08a66, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b333e, roughness: 0.9 });
  gunBox(g, 0.17, 0.17, 0.72, steel, 0, 0.03, -0.3);
  gunBox(g, 0.135, 0.06, 0.62, dark, 0, 0.145, -0.31);
  gunCylinder(g, 0.036, 0.48, dark, 0, 0.04, -0.84);
  gunBox(g, 0.11, 0.06, 0.24, dark, 0, 0.04, -1.07);
  gunBox(g, 0.12, 0.32, 0.2, dark, 0, -0.18, -0.09);
  gunBox(g, 0.15, 0.24, 0.3, dark, 0, -0.16, -0.3);
  gunBox(g, 0.13, 0.28, 0.18, gripMat, 0, -0.21, 0.04, -0.18);
  gunBox(g, 0.19, 0.12, 0.38, dark, 0, 0.12, -0.67);
  gunBox(g, 0.07, 0.08, 0.07, steel, 0, 0.215, -0.55);
  gunBox(g, 0.05, 0.08, 0.05, steel, 0, 0.215, -0.75);
  gunBox(g, 0.18, 0.18, 0.25, skin, 0.006, -0.21, 0.07, -0.1);
  gunBox(g, 0.15, 0.15, 0.24, skin, -0.05, -0.25, 0.18, -0.35, 0.2, -0.18);
  gunBox(g, 0.2, 0.21, 0.55, sleeve, 0.03, -0.35, 0.44, 0.09);
  gunBox(g, 0.18, 0.19, 0.5, sleeve, -0.09, -0.38, 0.48, 0.15, 0.15, 0.06);
  const muzzle = new THREE.Vector3(0, 0.04, -1.2);
  const flash = addMuzzleFlash(g, muzzle);
  g.userData = {
    basePos: new THREE.Vector3(0.36, -0.25, -1.12),
    adsPos: new THREE.Vector3(0.0, -0.145, -0.84),
    baseRot: new THREE.Euler(0.015, 0.17, 0.01),
    adsRot: new THREE.Euler(0.0, 0.0, 0.0),
    flash, muzzle
  };
  g.position.copy(g.userData.basePos);
  g.rotation.copy(g.userData.baseRot);
  g.scale.setScalar(0.52);
  return g;
}

function setupWeapons() {
  if (weaponGroups.length) return;
  weaponGroups.push(buildPistolView(), buildRifleView());
  for (const g of weaponGroups) {
    g.visible = false;
    weaponRoot.add(g);
  }
  setupCarCockpit();
}

/* ============================================================
   1st-Person Vehicle Dashboard & Cockpit Viewmodel
   ============================================================ */
const carCockpitRoot = new THREE.Group();
carCockpitRoot.visible = false;
weaponScene.add(carCockpitRoot);

let carCockpit = null;

function setupCarCockpit() {
  if (carCockpit) return;
  const g = new THREE.Group();

  const mb = KC.sharedMicroBump || null;
  const dashDark = new THREE.MeshStandardMaterial({ color: 0x161820, roughness: 0.72, metalness: 0.18, flatShading: true, bumpMap: mb, bumpScale: 0.015 });
  const dashSlate = new THREE.MeshStandardMaterial({ color: 0x222632, roughness: 0.65, metalness: 0.22, flatShading: true, bumpMap: mb, bumpScale: 0.012 });
  const trimAccent = new THREE.MeshStandardMaterial({ color: 0xffb13b, roughness: 0.35, metalness: 0.65, emissive: 0xff8a1f, emissiveIntensity: 0.25 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b4, roughness: 0.25, metalness: 0.8, flatShading: true });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.58, metalness: 0.15, flatShading: true, bumpMap: mb, bumpScale: 0.018 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0xa32b2b, roughness: 0.3, metalness: 0.58, flatShading: true, bumpMap: mb, bumpScale: 0.008 });
  const policeHoodStripeMat = new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.4, metalness: 0.3, flatShading: true });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x1d2c3f, roughness: 0.12, metalness: 0.9, emissive: 0x0d1828, emissiveIntensity: 0.35 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6a17a, roughness: 0.85, flatShading: true });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xb82028, roughness: 0.85, flatShading: true });
  const needleRedMat = new THREE.MeshBasicMaterial({ color: 0xff4238, toneMapped: false });
  const needleTealMat = new THREE.MeshBasicMaterial({ color: 0x57e6c2, toneMapped: false });

  /* 1. Exterior Painted Car Hood visible out the front windshield (centered on car at x = +0.26) */
  const hoodGroup = new THREE.Group();
  const hoodMain = gunBox(hoodGroup, 1.56, 0.08, 1.25, hoodMat, 0.26, -0.27, -1.55, 0.045, 0, 0);
  const hoodDome = gunBox(hoodGroup, 0.56, 0.045, 1.05, hoodMat, 0.26, -0.235, -1.5, 0.045, 0, 0);
  const policeStripe = gunBox(hoodGroup, 0.64, 0.048, 1.12, policeHoodStripeMat, 0.26, -0.233, -1.52, 0.045, 0, 0);
  policeStripe.visible = false;
  /* Hood side fenders */
  gunBox(hoodGroup, 0.18, 0.06, 1.18, hoodMat, -0.44, -0.25, -1.52, 0.04, 0, -0.08);
  gunBox(hoodGroup, 0.18, 0.06, 1.18, hoodMat, 0.96, -0.25, -1.52, 0.04, 0, 0.08);
  g.add(hoodGroup);

  /* 2. Animated Windshield Wipers at base of windshield */
  const wiperL = new THREE.Group();
  wiperL.position.set(-0.22, -0.215, -0.94);
  gunBox(wiperL, 0.42, 0.014, 0.018, dashDark, 0.19, 0.01, 0, 0, 0, 0.05);
  const wiperR = new THREE.Group();
  wiperR.position.set(0.28, -0.215, -0.94);
  gunBox(wiperR, 0.42, 0.014, 0.018, dashDark, 0.19, 0.01, 0, 0, 0, 0.05);
  g.add(wiperL, wiperR);

  /* 3. Main Dashboard Cowling & Trim */
  gunBox(g, 1.85, 0.24, 0.44, dashDark, 0.24, -0.34, -0.82, -0.1, 0, 0);
  gunBox(g, 1.82, 0.05, 0.36, dashSlate, 0.24, -0.225, -0.84, 0.05, 0, 0);
  /* Glowing accent LED strip across dashboard */
  gunBox(g, 1.72, 0.012, 0.02, trimAccent, 0.24, -0.252, -0.66);

  /* AC Vents (left, center-left, center-right, far-right) */
  for (const vx of [-0.36, 0.17, 0.47, 0.88]) {
    gunBox(g, 0.11, 0.048, 0.03, chromeMat, vx, -0.24, -0.68);
    gunBox(g, 0.095, 0.034, 0.034, dashDark, vx, -0.24, -0.678);
  }

  /* 4. Driver Instrument Cluster Binnacle & Live Canvas Gauge Display (directly in front at x = -0.05) */
  const clusterX = -0.05;
  gunBox(g, 0.38, 0.145, 0.08, dashSlate, clusterX, -0.192, -0.755, -0.06, 0, 0);
  gunBox(g, 0.39, 0.022, 0.14, dashDark, clusterX, -0.118, -0.725, 0.06, 0, 0);

  const gaugeCanvas = document.createElement('canvas');
  gaugeCanvas.width = 512;
  gaugeCanvas.height = 220;
  const gaugeTex = KC.makeCanvasTexture(gaugeCanvas, true);
  const gaugeScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.33, 0.126),
    new THREE.MeshBasicMaterial({ map: gaugeTex, toneMapped: false })
  );
  gaugeScreen.position.set(clusterX, -0.192, -0.705);
  gaugeScreen.rotation.x = -0.06;
  g.add(gaugeScreen);

  /* Physical 3D rotating Tachometer (left) and Speedometer (right) Needles in front of gaugeScreen */
  const tachNeedlePivot = new THREE.Group();
  tachNeedlePivot.position.set(clusterX - 0.10, -0.20, -0.698);
  tachNeedlePivot.rotation.x = -0.06;
  gunBox(tachNeedlePivot, 0.006, 0.036, 0.004, needleTealMat, 0, 0.015, 0);
  g.add(tachNeedlePivot);

  const speedNeedlePivot = new THREE.Group();
  speedNeedlePivot.position.set(clusterX + 0.10, -0.20, -0.698);
  speedNeedlePivot.rotation.x = -0.06;
  gunBox(speedNeedlePivot, 0.006, 0.036, 0.004, needleRedMat, 0, 0.015, 0);
  g.add(speedNeedlePivot);

  /* 5. Center Console & Live Infotainment / Police MDT Screen (to the right at x = +0.32) */
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(0.32, -0.23, -0.69);
  consoleGroup.rotation.y = -0.16;
  gunBox(consoleGroup, 0.29, 0.17, 0.06, dashSlate, 0, 0, 0, -0.12, 0, 0);
  gunBox(consoleGroup, 0.27, 0.15, 0.064, chromeMat, 0, 0, 0.002, -0.12, 0, 0);

  const navCanvas = document.createElement('canvas');
  navCanvas.width = 384;
  navCanvas.height = 220;
  const navTex = KC.makeCanvasTexture(navCanvas, true);
  const navScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.25, 0.132),
    new THREE.MeshBasicMaterial({ map: navTex, toneMapped: false })
  );
  navScreen.position.set(0, 0, 0.035);
  navScreen.rotation.x = -0.12;
  consoleGroup.add(navScreen);

  /* Hazard button & climate knobs below screen */
  const hazardMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false });
  gunBox(consoleGroup, 0.032, 0.022, 0.02, hazardMat, 0, -0.105, 0.03);
  for (const kx of [-0.075, 0.075]) {
    gunCylinder(consoleGroup, 0.016, 0.022, chromeMat, kx, -0.105, 0.03);
  }
  /* Lower gear shifter tunnel & stick */
  gunBox(consoleGroup, 0.22, 0.16, 0.38, dashDark, 0, -0.22, 0.14);
  gunCylinder(consoleGroup, 0.012, 0.11, chromeMat, -0.02, -0.12, 0.14);
  gunBox(consoleGroup, 0.042, 0.036, 0.055, leatherMat, -0.02, -0.08, 0.14);
  g.add(consoleGroup);

  /* 6. Steering Column, 3-Spoke Steering Wheel & Driver Hands */
  const steeringCol = new THREE.Group();
  steeringCol.position.set(clusterX, -0.235, -0.52);
  steeringCol.rotation.x = 0.16;
  const colShaft = gunCylinder(steeringCol, 0.034, 0.16, dashDark, 0, -0.055, -0.06);
  colShaft.rotation.x = Math.PI / 2 - 0.52;
  /* Turn signal & wiper stalks behind wheel */
  gunBox(steeringCol, 0.09, 0.012, 0.014, dashSlate, -0.07, -0.025, -0.03, 0, 0, 0.15);
  gunBox(steeringCol, 0.09, 0.012, 0.014, dashSlate, 0.07, -0.025, -0.03, 0, 0, -0.15);

  const wheelPivot = new THREE.Group();
  steeringCol.add(wheelPivot);

  /* 8-segment low-poly octagonal steering wheel rim */
  const wheelRadius = 0.158;
  const segLen = wheelRadius * 0.84;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rx = Math.cos(a) * wheelRadius;
    const ry = Math.sin(a) * wheelRadius;
    gunBox(wheelPivot, segLen, 0.02, 0.022, leatherMat, rx, ry, 0, 0, 0, a + Math.PI / 2);
  }
  /* 12-o'clock amber racing stripe on top of wheel rim */
  gunBox(wheelPivot, 0.026, 0.023, 0.025, trimAccent, 0, wheelRadius * 0.96, 0);

  /* Steering wheel center hub & 3 spokes (angled slightly down to leave upper gauge window completely open) */
  gunCylinder(wheelPivot, 0.038, 0.03, dashSlate, 0, -0.01, 0);
  gunCylinder(wheelPivot, 0.018, 0.034, trimAccent, 0, -0.01, 0.002);
  gunBox(wheelPivot, 0.12, 0.02, 0.016, chromeMat, -0.088, -0.028, -0.004, 0, 0, 0.22);
  gunBox(wheelPivot, 0.12, 0.02, 0.016, chromeMat, 0.088, -0.028, -0.004, 0, 0, -0.22);
  gunBox(wheelPivot, 0.024, 0.11, 0.016, chromeMat, 0, -0.088, -0.004);

  /* Driver's Left & Right Hands + Forearms gripping the steering wheel at 8:30 and 3:30 */
  gunBox(wheelPivot, 0.048, 0.062, 0.052, skinMat, -wheelRadius * 0.96, -0.025, 0.012, 0, 0, 0.12);
  gunBox(wheelPivot, 0.068, 0.068, 0.24, sleeveMat, -wheelRadius * 1.06, -0.09, 0.13, 0.35, -0.18, 0);
  gunBox(wheelPivot, 0.048, 0.062, 0.052, skinMat, wheelRadius * 0.96, -0.025, 0.012, 0, 0, -0.12);
  gunBox(wheelPivot, 0.068, 0.068, 0.24, sleeveMat, wheelRadius * 1.06, -0.09, 0.13, 0.35, 0.18, 0);

  g.add(steeringCol);

  /* 7. Windshield A-Pillars, Roof Header, Rearview Mirror & Left Side Mirror */
  gunBox(g, 0.065, 0.68, 0.085, dashDark, -0.54, 0.08, -0.72, -0.35, 0, -0.14);
  gunBox(g, 0.065, 0.68, 0.085, dashDark, 1.02, 0.08, -0.78, -0.35, 0, 0.14);
  gunBox(g, 1.75, 0.07, 0.14, dashDark, 0.24, 0.39, -0.68, 0.15, 0, 0);

  /* Top Rearview Mirror */
  gunBox(g, 0.02, 0.06, 0.02, dashDark, 0.26, 0.34, -0.66);
  gunBox(g, 0.23, 0.058, 0.026, dashSlate, 0.26, 0.305, -0.66, 0, -0.14, 0);
  gunBox(g, 0.215, 0.046, 0.028, mirrorMat, 0.26, 0.305, -0.658, 0, -0.14, 0);

  /* Left Exterior Side-View Mirror */
  const sideMirror = new THREE.Group();
  sideMirror.position.set(-0.63, -0.12, -0.82);
  sideMirror.rotation.y = 0.28;
  gunBox(sideMirror, 0.14, 0.085, 0.05, hoodMat, 0, 0, 0);
  gunBox(sideMirror, 0.12, 0.07, 0.054, mirrorMat, 0, 0, 0.004);
  gunBox(sideMirror, 0.06, 0.025, 0.03, dashDark, 0.08, -0.02, 0);
  g.add(sideMirror);

  carCockpitRoot.add(g);
  carCockpit = {
    group: g,
    hoodMat,
    policeStripe,
    skinMat,
    sleeveMat,
    wheelPivot,
    tachNeedlePivot,
    speedNeedlePivot,
    wiperL,
    wiperR,
    gaugeCanvas,
    gaugeTex,
    navCanvas,
    navTex,
    steerAngle: 0,
    wiperPhase: 0,
    canvasTimer: 0,
    lastCarColor: -1,
    lastIsPolice: null
  };
}

function syncCockpitDriverColors() {
  if (!carCockpit || !KC.CHAR_OPTIONS || !KC.charConfig) return;
  const O = KC.CHAR_OPTIONS;
  const cfg = KC.charConfig;
  const skinHex = (O.skins[cfg.skinIdx] || O.skins[0]).hex;
  const shirtHex = (O.shirtColors[cfg.shirtColorIdx] || O.shirtColors[0]).hex;
  carCockpit.skinMat.color.setHex(skinHex);
  carCockpit.sleeveMat.color.setHex(shirtHex);
}

function drawCockpitCanvases(car) {
  if (!carCockpit || !car) return;
  const mph = Math.round(Math.abs(car.speed) * 2.237);
  const maxMph = Math.round((car.maxSpeed || 28) * 2.237);
  const speedRatio = clamp(Math.abs(car.speed) / Math.max(1, car.maxSpeed), 0, 1);
  const gear = car.speed < -0.4 ? 'R' : (mph === 0 ? 'N' : 'D' + clamp(1 + Math.floor(mph / 14), 1, 5));

  /* 1. Instrument Cluster Display */
  {
    const c = carCockpit.gaugeCanvas;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 177, 59, 0.32)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    /* Left Dial: RPM Tachometer */
    const lx = 104, ly = 128, r = 74;
    ctx.strokeStyle = 'rgba(87, 230, 194, 0.25)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(lx, ly, r, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    const rpmRatio = mph === 0 ? 0.12 : clamp(0.22 + ((mph % 16) / 16) * 0.55 + speedRatio * 0.25, 0.12, 0.98);
    ctx.strokeStyle = rpmRatio > 0.82 ? '#ff3b3b' : '#57e6c2';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(lx, ly, r, Math.PI * 0.8, Math.PI * (0.8 + rpmRatio * 1.4));
    ctx.stroke();

    ctx.fillStyle = '#8fa3b8';
    ctx.font = '700 16px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RPM x1000', lx, ly + 44);

    /* Right Dial: Speedometer Arc */
    const rx = W - 104, ry = 128;
    ctx.strokeStyle = 'rgba(255, 177, 59, 0.22)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(rx, ry, r, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    ctx.strokeStyle = '#ffb13b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(rx, ry, r, Math.PI * 0.8, Math.PI * (0.8 + speedRatio * 1.4));
    ctx.stroke();
    ctx.fillStyle = '#8fa3b8';
    ctx.fillText('MAX ' + maxMph, rx, ry + 44);

    /* Center Digital Speed & Gear Readout */
    ctx.fillStyle = '#f2e8d5';
    ctx.font = '400 72px Anton, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(mph), W / 2, 108);

    ctx.fillStyle = '#ffb13b';
    ctx.font = '700 18px Rajdhani, sans-serif';
    ctx.fillText('MPH', W / 2, 132);

    /* Gear badge */
    ctx.fillStyle = gear === 'R' ? 'rgba(255,59,59,0.22)' : 'rgba(87,230,194,0.18)';
    ctx.fillRect(W / 2 - 34, 146, 68, 34);
    ctx.strokeStyle = gear === 'R' ? '#ff3b3b' : '#57e6c2';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 34, 146, 68, 34);
    ctx.fillStyle = gear === 'R' ? '#ff3b3b' : '#57e6c2';
    ctx.font = '700 24px Rajdhani, sans-serif';
    ctx.fillText(gear, W / 2, 171);

    carCockpit.gaugeTex.needsUpdate = true;
  }

  /* 2. Center Console Infotainment / Police MDT Screen */
  {
    const c = carCockpit.navCanvas;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.fillStyle = car.isPolice ? '#08111e' : '#0b0e16';
    ctx.fillRect(0, 0, W, H);

    const accent = car.isPolice ? '#65b8ff' : '#ffb13b';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    ctx.fillStyle = accent;
    ctx.fillRect(4, 4, W - 8, 34);
    ctx.fillStyle = '#090b10';
    ctx.font = '700 19px Rajdhani, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(car.isPolice ? 'KCPD // 911 MDT TERMINAL' : 'HEARTLAND NAV // KC 2026', 14, 27);

    const area = areaNameAt(car.x, car.z);
    ctx.fillStyle = '#f2e8d5';
    ctx.font = '700 26px Rajdhani, sans-serif';
    ctx.fillText(area, 16, 74);

    ctx.fillStyle = '#57e6c2';
    ctx.font = '600 18px Rajdhani, sans-serif';
    const dist = Math.round(contractDistance());
    ctx.fillText('TARGET: ' + (state.contract.location || 'KC').toUpperCase() + ' (' + dist + 'm)', 16, 104);

    /* Simulated GPS road grid lines on console display */
    ctx.strokeStyle = 'rgba(87, 230, 194, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 120, W - 32, 52);
    const barW = clamp((1 - dist / 240) * (W - 40), 18, W - 40);
    ctx.fillStyle = 'rgba(87, 230, 194, 0.28)';
    ctx.fillRect(20, 124, barW, 44);
    ctx.fillStyle = '#f2e8d5';
    ctx.font = '700 17px Rajdhani, sans-serif';
    ctx.fillText(car.isPolice ? 'CODE 3 · SIREN ACTIVE' : '♪ 104.9 KC JAZZ & BASS FM', 28, 152);

    ctx.fillStyle = 'rgba(242,232,213,0.6)';
    ctx.font = '600 16px Rajdhani, sans-serif';
    ctx.fillText(formatClock(state.timeMinutes) + ' · ' + state.weather + ' · HEADLIGHTS ON', 16, 200);

    carCockpit.navTex.needsUpdate = true;
  }
}

function updateCarCockpitView(dt) {
  if (!carCockpit) return;
  const isCar = !activeVehicle || activeVehicle.type === 'car';
  const show = G.mode === 'playing' && !!activeVehicle && player.cameraMode === '1p' && isCar;
  carCockpitRoot.visible = show;
  if (!show) return;

  const car = activeVehicle;
  /* Sync exterior hood paint color with the active vehicle */
  const desiredColor = car.isPolice ? 0x182030 : (car.color || 0xa32b2b);
  if (carCockpit.lastCarColor !== desiredColor || carCockpit.lastIsPolice !== car.isPolice) {
    carCockpit.lastCarColor = desiredColor;
    carCockpit.lastIsPolice = car.isPolice;
    carCockpit.hoodMat.color.setHex(desiredColor);
    carCockpit.policeStripe.visible = !!car.isPolice;
    syncCockpitDriverColors();
  }

  /* Steering wheel & hands rotation */
  const kbSteer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const steerInput = clamp(kbSteer + gamepadState.steer, -1, 1);
  carCockpit.steerAngle = lerp(carCockpit.steerAngle, steerInput * 1.18, 1 - Math.exp(-dt * 12));
  carCockpit.wheelPivot.rotation.z = carCockpit.steerAngle;

  /* 3D Gauge Needles rotation */
  const speedRatio = clamp(Math.abs(car.speed) / Math.max(1, car.maxSpeed), 0, 1);
  const mph = Math.abs(car.speed) * 2.237;
  const rpmRatio = mph < 0.5 ? 0.12 : clamp(0.25 + ((mph % 16) / 16) * 0.55 + speedRatio * 0.2, 0.12, 0.98);
  carCockpit.tachNeedlePivot.rotation.z = lerp(1.85, -1.85, rpmRatio);
  carCockpit.speedNeedlePivot.rotation.z = lerp(1.85, -1.85, speedRatio);

  /* Animated Windshield Wipers during Rain or Storm */
  const raining = state.weather === 'RAIN' || state.weather === 'STORM';
  if (raining) {
    const wiperSpd = state.weather === 'STORM' ? 6.5 : 4.2;
    carCockpit.wiperPhase += dt * wiperSpd;
  } else {
    carCockpit.wiperPhase = lerp(carCockpit.wiperPhase, 0, dt * 5);
  }
  const wipeAngle = raining ? Math.abs(Math.sin(carCockpit.wiperPhase)) * 1.25 : 0;
  carCockpit.wiperL.rotation.z = wipeAngle;
  carCockpit.wiperR.rotation.z = wipeAngle;

  /* Gently auto-center cabin free-look while driving so view stays aligned with the road */
  if (Math.abs(car.speed) > 0.5) {
    player.carLookYaw *= Math.exp(-dt * 2.8);
    player.carLookPitch *= Math.exp(-dt * 2.8);
  }

  /* Engine vibration, road bump bob & subtle free-look cabin parallax */
  const speedShake = Math.sin(gameTime * 28) * 0.0012 * clamp(Math.abs(car.speed) / 15, 0.15, 1.2);
  const accelPitch = ((keys.KeyW || gamepadState.throttle > 0.1) ? -0.012 : 0) + ((keys.KeyS || gamepadState.brake > 0.1) ? 0.016 : 0);
  const lookYawParallax = clamp(-player.carLookYaw * 0.35, -0.32, 0.32);
  const lookPitchParallax = clamp(-player.carLookPitch * 0.45, -0.22, 0.22);
  carCockpit.group.position.set(
    lookYawParallax * 0.05,
    speedShake,
    0
  );
  carCockpit.group.rotation.order = 'YXZ';
  carCockpit.group.rotation.set(
    lookPitchParallax + accelPitch,
    lookYawParallax,
    -steerInput * 0.015 * speedRatio
  );

  carCockpit.canvasTimer += dt;
  if (carCockpit.canvasTimer >= 0.08) {
    carCockpit.canvasTimer = 0;
    drawCockpitCanvases(car);
  }
}

function updateWeaponView(dt) {
  /* Strict asset culling: ONLY show 1st-person weapon viewmodel in 1P on foot while playing! */
  const aimingInVehicle = !!activeVehicle && (player.aiming || pointer.aiming || gamepadState.aim);
  const show = G.mode === 'playing' && player.cameraMode === '1p' && !!weaponGroups.length && (!activeVehicle || aimingInVehicle);
  weaponRoot.visible = show;
  if (!show) {
    state.recoilPitch *= Math.exp(-dt * 13);
    state.recoilYaw *= Math.exp(-dt * 13);
    return;
  }
  for (let i = 0; i < weaponGroups.length; i++) weaponGroups[i].visible = i === state.weapon;
  const g = weaponGroups[state.weapon];
  if (!g) return;
  const w = WEAPONS[state.weapon];
  const ud = g.userData;
  const kick = clamp(state.recoilPitch / Math.max(0.001, w.recoil), 0, 2);
  const reloadProgress = state.reloading ? 1 - clamp(state.reloadTimer / w.reload, 0, 1) : 0;
  const dip = Math.sin(reloadProgress * Math.PI);

  /* Slower, smoother, weightier 1st-person walking bob & figure-8 weapon sway */
  const speedRatio = clamp(Math.hypot(player.vel.x, player.vel.z) / 5.2, 0, 1.3);
  const adsDamp = 1 - player.adsBlend * 0.72;
  const walk = Math.sin(player.bobPhase * 0.55) * adsDamp;
  const walkY = Math.abs(Math.sin(player.bobPhase * 1.1)) * 0.0065 * speedRatio * adsDamp;
  const swayX = Math.cos(player.bobPhase * 0.55) * 0.0055 * speedRatio * adsDamp;

  const bx = lerp(ud.basePos.x, ud.adsPos.x, player.adsBlend);
  const by = lerp(ud.basePos.y, ud.adsPos.y, player.adsBlend);
  const bz = lerp(ud.basePos.z, ud.adsPos.z, player.adsBlend);

  const rx = lerp(ud.baseRot.x, ud.adsRot.x, player.adsBlend);
  const ry = lerp(ud.baseRot.y, ud.adsRot.y, player.adsBlend);
  const rz = lerp(ud.baseRot.z, ud.adsRot.z, player.adsBlend);

  g.position.set(
    bx + swayX + player.leanAmount * 0.03,
    by - dip * 0.28 - walkY,
    bz + kick * 0.085 + dip * 0.06
  );
  g.rotation.set(
    rx - kick * 0.068 + dip * 0.62 + walk * 0.005,
    ry + swayX * 0.45 + dip * 0.18,
    rz + dip * 0.2 + swayX * 0.18 - player.leanAmount * 0.18
  );

  const flash = ud.flash;
  flash.visible = state.muzzleTimer > 0;
  if (flash.visible) {
    const p = clamp(state.muzzleTimer / 0.055, 0, 1);
    flash.material.opacity = p * 0.95;
    const s = rand(0.26, 0.42);
    flash.scale.set(s, s, 1);
    flash.material.rotation = rand(0, 3.14);
  }
  state.recoilPitch *= Math.exp(-dt * 13);
  state.recoilYaw *= Math.exp(-dt * 13);
}

/* ============================================================
   Characters, Player 3P Rig, Vehicles, Combat
   ============================================================ */
const carHitMeshes = [];
const charTargets = [];
const corpses = [];

const SKIN_TONES = [0xd6a17a, 0x9a6644, 0x6e4732, 0xe3b992, 0x8d5a3b, 0xc98d6b, 0x523424, 0xefd0b3];
const SHIRT_COLORS = [
  0xc8102e, 0x1d5bbf, 0x596a7c, 0x6c3b3b, 0x3e5e50, 0xd99b26,
  0x4b3e66, 0x8b5b35, 0x3a3a44, 0x77525b, 0x246b57, 0xd8cdb8,
  0x2c425e, 0x9e3d22
];
const PANTS_COLORS = [0x25262e, 0x30323b, 0x3a342c, 0x1f2630, 0x2d2a33, 0x45536b, 0x5a4c3c];
const HAIR_COLORS = [0x1c1511, 0x34231a, 0x51382a, 0x0f0d0c, 0x7a5130, 0xb88b4a, 0x6b6c72, 0x8c2d23];

/* Shared low-poly detail materials for NPCs (performance-optimized) */
const NPC_EYE_WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xf5f2eb });
const NPC_PUPIL_MAT = new THREE.MeshBasicMaterial({ color: 0x111116 });
const NPC_SHADES_MAT = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.2, metalness: 0.85 });
const NPC_GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xe6ad38, roughness: 0.35, metalness: 0.7 });
const NPC_WHITE_MAT = new THREE.MeshStandardMaterial({ color: 0xf0ece1, roughness: 0.85 });
const NPC_HIVIS_MAT = new THREE.MeshStandardMaterial({ color: 0xc8f032, roughness: 0.65, emissive: 0x303d05, emissiveIntensity: 0.35 });
const NPC_LEATHER_MAT = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.75 });
const NPC_PHONE_SCREEN_MAT = new THREE.MeshBasicMaterial({ color: 0x70e8ff, toneMapped: false });
const NPC_BAG_MAT = new THREE.MeshStandardMaterial({ color: 0xd98a2b, roughness: 0.8 });

function rebuildPlayerRig() {
  if (playerRig && playerRig.group) {
    scene.remove(playerRig.group);
  }
  playerRig = KC.buildCustomPersonMesh(KC.charConfig, { showNametag: false });
  playerRig.group.visible = false;
  scene.add(playerRig.group);
  syncCockpitDriverColors();
}

function makePerson(opts = {}) {
  const type = opts.type || 'ped';
  const role = opts.role || (type === 'ped' ? KC.pick(['citizen', 'office', 'fan', 'bbq', 'worker', 'hipster', 'shopper']) : type);
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: opts.skin ?? KC.pick(SKIN_TONES), roughness: 0.9 });

  let shirtColor = opts.shirt;
  if (shirtColor == null) {
    if (type === 'cop') shirtColor = 0x2b4f7a;
    else if (type === 'thug') shirtColor = 0x2a1f26;
    else if (role === 'fan') shirtColor = Math.random() < 0.6 ? 0xc8102e : 0x1d5bbf;
    else if (role === 'office') shirtColor = KC.pick([0x253244, 0x353942, 0xd8d4ca, 0x4a5b70]);
    else if (role === 'bbq') shirtColor = KC.pick([0x7a2620, 0x2a2729, 0x5c3828]);
    else if (role === 'worker') shirtColor = 0x2a394a;
    else shirtColor = KC.pick(SHIRT_COLORS);
  }
  const pantsColor = type === 'cop' ? 0x182334 : type === 'thug' ? 0x1b171c : (opts.pants ?? KC.pick(PANTS_COLORS));
  const hairColor = opts.hair ?? KC.pick(HAIR_COLORS);

  const mb = KC.sharedMicroBump || null;
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.88, bumpMap: mb, bumpScale: 0.016 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.92, bumpMap: mb, bumpScale: 0.018 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x131318, roughness: 0.78 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.92, bumpMap: mb, bumpScale: 0.02 });
  const accentColor = type === 'thug' ? (opts.accent ?? 0xb5232b) : type === 'cop' ? 0xc9a53c : (role === 'fan' ? 0xffb81c : KC.pick([0xd99b26, 0xe0dfd5, 0xc8102e, 0x57e6c2]));
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.6, metalness: type === 'cop' ? 0.5 : 0.1 });
  const mats = [skin, shirt, pants, shoe, accent, hairMat];

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), shirt);
  torso.position.y = 1.13;
  torso.castShadow = true;
  group.add(torso);

  /* Neck joint */
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), skin);
  neck.position.y = 1.51;
  group.add(neck);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), pants);
  hips.position.y = 0.73;
  hips.castShadow = true;
  group.add(hips);

  /* Belt & buckle detail */
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.055, 0.32), shoe);
  belt.position.y = 0.81;
  group.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), NPC_GOLD_MAT);
  buckle.position.set(0, 0.81, -0.165);
  group.add(buckle);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.31), skin);
  head.position.y = 1.69;
  head.castShadow = true;
  group.add(head);

  /* Ears */
  for (const ex of [-0.17, 0.17]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.06), skin);
    ear.position.set(ex, 1.69, -0.01);
    group.add(ear);
  }

  /* Facial Details: Eyes, Pupils, Eyebrows, Nose & Mouth on -Z front of head */
  for (const side of [-1, 1]) {
    const eyeW = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.042, 0.014), NPC_EYE_WHITE_MAT);
    eyeW.position.set(side * 0.075, 1.715, -0.156);
    group.add(eyeW);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.034, 0.018), NPC_PUPIL_MAT);
    pupil.position.set(side * 0.073, 1.715, -0.159);
    group.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.02, 0.018), hairMat);
    brow.position.set(side * 0.076, 1.762, -0.158);
    brow.rotation.z = side * (type === 'thug' ? -0.18 : 0.05);
    group.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.058, 0.034), skin);
  nose.position.set(0, 1.675, -0.166);
  group.add(nose);

  const mouthMat = new THREE.MeshBasicMaterial({ color: type === 'ped' && Math.random() < 0.35 ? 0xd8a88e : 0x3b1f1a });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.022, 0.014), mouthMat);
  mouth.position.set(0, 1.605, -0.157);
  group.add(mouth);

  /* Optional Facial Hair (Beard / Goatee / Mustache) */
  if (type !== 'cop' && Math.random() < 0.32) {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.09, 0.18), hairMat);
    beard.position.set(0, 1.565, -0.08);
    group.add(beard);
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.026, 0.024), hairMat);
    stache.position.set(0, 1.628, -0.16);
    group.add(stache);
  }

  /* Optional Glasses / Sunglasses */
  const hasGlasses = opts.glasses ?? (type === 'cop' ? Math.random() < 0.55 : Math.random() < 0.32);
  if (hasGlasses) {
    const shadeBridge = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.022, 0.03), NPC_SHADES_MAT);
    shadeBridge.position.set(0, 1.73, -0.165);
    group.add(shadeBridge);
    for (const sx of [-0.08, 0.08]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.068, 0.025), NPC_SHADES_MAT);
      lens.position.set(sx, 1.716, -0.168);
      group.add(lens);
    }
  }

  /* Role-Specific Headgear, Hair & Torso Clothing Layers */
  if (type === 'cop') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), new THREE.MeshStandardMaterial({ color: 0x142238, roughness: 0.8 }));
    cap.position.set(0, 1.89, 0.01);
    group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.14), new THREE.MeshStandardMaterial({ color: 0x0d1624, roughness: 0.8 }));
    brim.position.set(0, 1.85, -0.2);
    group.add(brim);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), accent);
    badge.position.set(-0.16, 1.3, -0.17);
    group.add(badge);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.35), new THREE.MeshStandardMaterial({ color: 0x172234, roughness: 0.85 }));
    vest.position.y = 1.18;
    group.add(vest);
  } else if (type === 'thug') {
    const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.33), accent);
    bandana.position.set(0, 1.61, -0.005);
    group.add(bandana);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), new THREE.MeshStandardMaterial({ color: 0x18141b, roughness: 1 }));
    hood.position.set(0, 1.87, 0.03);
    group.add(hood);
    const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.34), accent);
    chestStripe.position.set(0, 1.24, 0);
    group.add(chestStripe);
  } else {
    /* Civilian Headgear & Hair Styles */
    const headStyle = opts.headStyle || (
      role === 'worker' ? 'hardhat' :
      role === 'musician' ? 'fedora' :
      role === 'fan' ? 'cap' :
      role === 'bbq' ? KC.pick(['cap', 'fade', 'afro']) :
      KC.pick(['fade', 'cap', 'beanie', 'fedora', 'cowboy', 'afro', 'ponytail', 'parted'])
    );

    if (headStyle === 'hardhat') {
      const dome = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.36), NPC_GOLD_MAT);
      dome.position.set(0, 1.89, 0);
      group.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.43), NPC_GOLD_MAT);
      brim.position.set(0, 1.84, -0.03);
      group.add(brim);
    } else if (headStyle === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: role === 'fan' ? 0xc8102e : KC.pick([0xc8102e, 0x1d5bbf, 0x1c212b, 0xd99b26]), roughness: 0.75 });
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.11, 0.34), capMat);
      crown.position.set(0, 1.88, 0.01);
      group.add(crown);
      const bill = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.025, 0.14), capMat);
      bill.position.set(0, 1.84, -0.2);
      group.add(bill);
    } else if (headStyle === 'fedora' || headStyle === 'cowboy') {
      const hatMat = new THREE.MeshStandardMaterial({ color: headStyle === 'cowboy' ? 0x6e492d : 0x232026, roughness: 0.8 });
      const brimW = headStyle === 'cowboy' ? 0.52 : 0.45;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(brimW, 0.03, brimW), hatMat);
      brim.position.set(0, 1.84, 0);
      group.add(brim);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), hatMat);
      crown.position.set(0, 1.92, 0);
      group.add(crown);
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.035, 0.33), accent);
      ribbon.position.set(0, 1.87, 0);
      group.add(ribbon);
    } else if (headStyle === 'beanie') {
      const beanieMat = new THREE.MeshStandardMaterial({ color: KC.pick([0x9e2a2b, 0x2b4c7e, 0x2e4a3b, 0xd98a2b]), roughness: 0.95 });
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.35), beanieMat);
      fold.position.set(0, 1.85, 0.01);
      group.add(fold);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.31), beanieMat);
      top.position.set(0, 1.93, 0.02);
      group.add(top);
    } else if (headStyle === 'afro') {
      const afro = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 0.42), hairMat);
      afro.position.set(0, 1.88, 0.02);
      group.add(afro);
    } else if (headStyle === 'ponytail') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.11, 0.34), hairMat);
      top.position.set(0, 1.88, 0.01);
      group.add(top);
      const sides = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.2), hairMat);
      sides.position.set(0, 1.76, 0.07);
      group.add(sides);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.11), hairMat);
      tail.position.set(0, 1.7, 0.21);
      tail.rotation.x = 0.25;
      group.add(tail);
    } else {
      /* Classic Fade / Parted Hair with back & side volume */
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), hairMat);
      top.position.set(0, 1.88, 0.01);
      group.add(top);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.08), hairMat);
      back.position.set(0, 1.76, 0.14);
      group.add(back);
    }

    /* Civilian Torso Clothing Layers */
    if (role === 'office') {
      /* White dress shirt V-insert & necktie */
      const dressShirt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.02), NPC_WHITE_MAT);
      dressShirt.position.set(0, 1.28, -0.162);
      group.add(dressShirt);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.3, 0.025), accent);
      tie.position.set(0, 1.25, -0.168);
      group.add(tie);
    } else if (role === 'bbq') {
      /* Kansas City BBQ Pitmaster White/Canvas Apron */
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.03), NPC_WHITE_MAT);
      apron.position.set(0, 1.04, -0.165);
      group.add(apron);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.025), NPC_WHITE_MAT);
      strap.position.set(0, 1.38, -0.163);
      group.add(strap);
    } else if (role === 'worker') {
      /* High-Visibility Neon Safety Vest */
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.54, 0.34), NPC_HIVIS_MAT);
      vest.position.set(0, 1.16, 0);
      group.add(vest);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.06, 0.35), NPC_WHITE_MAT);
      stripe.position.set(0, 1.06, 0);
      group.add(stripe);
    } else if (role === 'fan') {
      /* KC Sports Jersey Chest Stripe & Gold Shoulder Trim */
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.335), NPC_WHITE_MAT);
      stripe.position.set(0, 1.18, 0);
      group.add(stripe);
      const numBlock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.345), NPC_GOLD_MAT);
      numBlock.position.set(0, 1.18, 0);
      group.add(numBlock);
    } else {
      /* Layered Jacket / Hoodie Pocket or Collar Trim */
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.03), accent);
      pocket.position.set(0, 0.96, -0.162);
      group.add(pocket);
    }

    /* Optional Backpack on ~25% of pedestrians */
    if (Math.random() < 0.25) {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.18), NPC_LEATHER_MAT);
      pack.position.set(0, 1.16, 0.23);
      pack.castShadow = true;
      group.add(pack);
    }
  }

  function limb(x, y, colorMat, length, width, depth, isArm) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const upperLen = length * 0.52;
    const lowerLen = length * 0.52;
    const upperMesh = new THREE.Mesh(new THREE.BoxGeometry(width, upperLen, depth), colorMat);
    upperMesh.position.y = -upperLen / 2;
    upperMesh.castShadow = true;
    pivot.add(upperMesh);

    const joint = new THREE.Group();
    joint.position.set(0, -upperLen + 0.02, 0);
    const lowerMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, lowerLen, depth * 0.92), colorMat);
    lowerMesh.position.y = -lowerLen / 2;
    lowerMesh.castShadow = true;
    joint.add(lowerMesh);

    if (isArm) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(width * 0.98, 0.12, depth * 0.98), skin);
      hand.position.y = -lowerLen + 0.02;
      joint.add(hand);
    } else {
      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, 0.11, depth * 1.18), shoe);
      shoeMesh.position.set(0, -lowerLen + 0.03, -0.03);
      joint.add(shoeMesh);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.03, depth * 1.2), NPC_WHITE_MAT);
      sole.position.set(0, -lowerLen - 0.01, -0.03);
      joint.add(sole);
    }
    pivot.add(joint);
    group.add(pivot);
    return { pivot, joint };
  }

  const leftArmObj = limb(-0.36, 1.42, shirt, 0.62, 0.15, 0.17, true);
  const rightArmObj = limb(0.36, 1.42, shirt, 0.62, 0.15, 0.17, true);
  const leftLegObj = limb(-0.15, 0.74, pants, 0.68, 0.19, 0.22, false);
  const rightLegObj = limb(0.15, 0.74, pants, 0.68, 0.19, 0.22, false);

  let heldProp = opts.prop || null;
  if (type === 'cop' || type === 'thug') {
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.09), shoe);
    gun.position.set(0, -0.38, -0.02);
    rightArmObj.joint.add(gun);
    heldProp = 'gun';
  } else if (!heldProp) {
    if (role === 'musician') heldProp = Math.random() < 0.5 ? 'sax' : 'guitar';
    else if (role === 'office') heldProp = Math.random() < 0.55 ? 'briefcase' : 'coffee';
    else if (role === 'shopper') heldProp = 'bag';
    else if (Math.random() < 0.52) heldProp = KC.pick(['coffee', 'phone', 'bag', 'briefcase']);
  }

  /* Attach Low-Poly Hand Props to Civilian Forearms */
  if (heldProp === 'coffee') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.036, 0.12, 7), NPC_WHITE_MAT);
    cup.position.set(0, -0.34, -0.08);
    cup.rotation.x = -Math.PI / 2;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.041, 0.05, 7), NPC_LEATHER_MAT);
    cup.add(sleeve);
    rightArmObj.joint.add(cup);
  } else if (heldProp === 'phone') {
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.11), NPC_PHONE_SCREEN_MAT);
    phone.position.set(0, -0.34, -0.07);
    rightArmObj.joint.add(phone);
  } else if (heldProp === 'briefcase') {
    const bcase = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.38), NPC_LEATHER_MAT);
    bcase.position.set(0.06, -0.44, 0);
    rightArmObj.joint.add(bcase);
  } else if (heldProp === 'bag') {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.26), NPC_BAG_MAT);
    bag.position.set(0.06, -0.45, 0);
    rightArmObj.joint.add(bag);
  } else if (heldProp === 'sax') {
    const horn = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.42, 7), NPC_GOLD_MAT);
    tube.rotation.x = 0.45;
    horn.add(tube);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.035, 0.16, 8), NPC_GOLD_MAT);
    bell.position.set(0, -0.14, -0.12);
    bell.rotation.x = -0.7;
    horn.add(bell);
    horn.position.set(-0.12, -0.28, -0.16);
    rightArmObj.joint.add(horn);
  } else if (heldProp === 'guitar') {
    const guitar = new THREE.Group();
    const bodyG = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.09), NPC_LEATHER_MAT);
    guitar.add(bodyG);
    const neckG = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.04), shoe);
    neckG.position.set(-0.22, 0.24, 0);
    neckG.rotation.z = 0.65;
    guitar.add(neckG);
    guitar.position.set(0, 1.05, -0.22);
    group.add(guitar);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const bodyProxy = new THREE.Mesh(new THREE.SphereGeometry(0.44, 8, 6), proxyMat);
  bodyProxy.position.y = 1.08;
  bodyProxy.userData.part = 'body';
  group.add(bodyProxy);
  const headProxy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), proxyMat);
  headProxy.position.y = 1.7;
  headProxy.userData.part = 'head';
  group.add(headProxy);

  return {
    group, mats, torso, head, role, heldProp,
    leftArm: leftArmObj.pivot, leftForearm: leftArmObj.joint,
    rightArm: rightArmObj.pivot, rightForearm: rightArmObj.joint,
    leftLeg: leftLegObj.pivot, leftKnee: leftLegObj.joint,
    rightLeg: rightLegObj.pivot, rightKnee: rightLegObj.joint,
    hitMeshes: [bodyProxy, headProxy], shadow
  };
}

function addCharacterTargets(actor) {
  for (const m of actor.model.hitMeshes) {
    m.userData.actor = actor;
    charTargets.push(m);
  }
}

function removeCharacterTargets(actor) {
  for (const m of actor.model.hitMeshes) {
    const i = charTargets.indexOf(m);
    if (i >= 0) charTargets.splice(i, 1);
  }
}

/* ============================================================
   Cars & OBB Vehicle Physics
   ============================================================ */
const WHEEL_GEO = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 10);
const HUB_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8);
const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.9 });
const HUB_MAT = new THREE.MeshStandardMaterial({ color: 0x5c5d63, roughness: 0.4, metalness: 0.8 });
const GLASS_CAR_MAT = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.15, metalness: 0.8, emissive: 0x091018, emissiveIntensity: 0.3 });
const HEADLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false });
const TAILLIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xff2b1f, toneMapped: false });
const POLICE_RED = new THREE.MeshBasicMaterial({ color: 0xff1f1f, toneMapped: false });
const POLICE_BLUE = new THREE.MeshBasicMaterial({ color: 0x2b7bff, toneMapped: false });

function buildCar(color, opts = {}) {
  const group = new THREE.Group();
  const style = opts.police ? 'police' : (opts.style || KC.pick(['sedan', 'sedan', 'suv', 'pickup', 'van']));
  const mb = KC.sharedMicroBump || null;
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.58, bumpMap: mb, bumpScale: 0.01 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151519, roughness: 0.68, metalness: 0.22, bumpMap: mb, bumpScale: 0.015 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.52, 4.2), paint);
  body.position.y = 0.63;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.14, 1.25), paint);
  hood.position.set(0, 0.94, -1.35);
  hood.castShadow = true;
  group.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.14, 0.9), paint);
  trunk.position.set(0, 0.94, 1.55);
  group.add(trunk);
  const cabinH = style === 'suv' ? 0.64 : (style === 'van' || style === 'armored' ? 0.92 : 0.54);
  const cabinL = style === 'suv' ? 2.65 : (style === 'pickup' ? 1.35 : (style === 'van' || style === 'armored' ? 2.75 : 1.95));
  const cabinZ = (style === 'suv' || style === 'van' || style === 'armored') ? 0.45 : (style === 'pickup' ? -0.15 : 0.1);
  const cabinMat = (style === 'van' || style === 'armored')
    ? new THREE.MeshStandardMaterial({ color: style === 'armored' ? 0x16243a : 0xeae4d7, roughness: 0.45 })
    : GLASS_CAR_MAT;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, cabinH, cabinL), cabinMat);
  cabin.position.set(0, 0.9 + cabinH / 2, cabinZ);
  cabin.castShadow = true;
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.09, cabinL * 0.88), style === 'armored' ? new THREE.MeshStandardMaterial({ color: 0xe6ad38, roughness: 0.4 }) : paint);
  roof.position.set(0, 0.92 + cabinH, cabinZ);
  roof.castShadow = true;
  group.add(roof);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.7 });
  for (const z of [-0.86, 0.9]) {
    for (const x of [-0.78, 0.78]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.07), pillarMat);
      p.position.set(x, 1.18, z);
      group.add(p);
    }
  }
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.18), black);
  bumperF.position.set(0, 0.48, -2.14);
  group.add(bumperF);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.22, 0.18), black);
  bumperR.position.set(0, 0.48, 2.14);
  group.add(bumperR);

  const wheels = [];
  for (const z of [-1.35, 1.35]) {
    for (const x of [-0.94, 0.94]) {
      const wg = new THREE.Group();
      wg.position.set(x, 0.4, z);
      const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
      wheel.rotation.z = Math.PI / 2;
      wg.add(wheel);
      const hub = new THREE.Mesh(HUB_GEO, HUB_MAT);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      group.add(wg);
      wheels.push(wg);
    }
  }

  for (const x of [-0.64, 0.64]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), HEADLIGHT_MAT);
    hl.position.set(x, 0.76, -2.11);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.04), TAILLIGHT_MAT);
    tl.position.set(x, 0.76, 2.11);
    group.add(tl);
  }

  let lightbar = null;
  let policeMats = null;
  if (opts.police) {
    lightbar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.28), black);
    barBase.position.set(0, 1.54, 0.1);
    lightbar.add(barBase);
    const redMat = POLICE_RED.clone();
    const blueMat = POLICE_BLUE.clone();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.09, 0.2), i % 2 === 0 ? redMat : blueMat);
      m.position.set(-0.37 + i * 0.25, 1.59, 0.1);
      lightbar.add(m);
    }
    group.add(lightbar);
    policeMats = [redMat, blueMat];
    const white = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.5 }));
    white.position.set(0, 0.65, 0.1);
    group.add(white);
    for (const x of [-0.98, 0.98]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 3.2), new THREE.MeshStandardMaterial({ color: 0x141e36, roughness: 0.5 }));
      stripe.position.set(x, 0.66, 0);
      group.add(stripe);
    }
  }

  group.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow !== false; });
  return { group, body, cabin, wheels, lightbar, policeMats, paint, style };
}

/* ============================================================
   Extended Vehicles: Helicopter, Plane, Boat
   ============================================================ */
function buildHelicopter(color = 0x1a3a5c) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.15, metalness: 0.8, transparent: true, opacity: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121216, roughness: 0.6, metalness: 0.3 });
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 4.0), bodyMat);
  fuselage.position.y = 1.1;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.3), glassMat);
  nose.position.set(0, 0.85, -2.2);
  group.add(nose);
  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), bodyMat);
  tailBoom.position.set(0, 1.05, 3.3);
  group.add(tailBoom);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.8), bodyMat);
  tailFin.position.set(0, 1.6, 4.8);
  group.add(tailFin);
  const mainRotor = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.06, 0.3), dark);
  mainRotor.position.set(0, 2.0, 0);
  const mainRotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 8.0), dark);
  mainRotor2.position.set(0, 2.0, 0);
  const rotorHub = new THREE.Group();
  rotorHub.add(mainRotor, mainRotor2);
  group.add(rotorHub);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.18), dark);
  tailRotor.position.set(0.28, 1.5, 5.0);
  group.add(tailRotor);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.2), dark);
  skidL.position.set(-0.95, 0.32, 0.2);
  group.add(skidL);
  const skidR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.2), dark);
  skidR.position.set(0.95, 0.32, 0.2);
  group.add(skidR);
  for (const z of [-1.4, 1.4]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), dark);
    strut.position.set(-0.95, 0.52, z);
    group.add(strut);
    const strut2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), dark);
    strut2.position.set(0.95, 0.52, z);
    group.add(strut2);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false }));
  light.position.set(0, 1.7, 4.9);
  group.add(light);
  group.userData.rotorHub = rotorHub;
  group.userData.tailRotor = tailRotor;
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, rotorHub, tailRotor };
}

function buildPlane(color = 0xd8d0c0) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.15, metalness: 0.8, transparent: true, opacity: 0.7 });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6.4, 8), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = 1.0;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 8), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 1.0, -3.9);
  group.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.18, 1.6), bodyMat);
  wing.position.set(0, 1.05, 0.4);
  group.add(wing);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 1.0), bodyMat);
  tailWing.position.set(0, 1.5, 3.0);
  group.add(tailWing);
  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 1.0), bodyMat);
  vTail.position.set(0, 1.9, 3.0);
  group.add(vTail);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.2), glassMat);
  cockpit.position.set(0, 1.6, -1.6);
  group.add(cockpit);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), dark);
  prop.position.set(0, 1.0, -4.6);
  group.add(prop);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, prop };
}

function buildBoat(color = 0xd8d0c0) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6, metalness: 0.3 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.15, metalness: 0.8, transparent: true, opacity: 0.7 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 6.4), hullMat);
  hull.position.y = 0.2;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), hullMat);
  bow.rotation.x = -Math.PI / 2;
  bow.position.set(0, 0.2, -4.3);
  group.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.6), hullMat);
  cabin.position.set(0, 1.35, 0.6);
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.12), glassMat);
  windshield.position.set(0, 1.9, -0.7);
  windshield.rotation.x = -0.35;
  group.add(windshield);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), dark);
  mast.position.set(0, 2.6, 1.4);
  group.add(mast);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group };
}

function registerCarHitMeshes(car) {
  car.hitMeshes = [car.model.body, car.model.cabin];
  for (const m of car.hitMeshes) {
    m.userData.car = car;
    carHitMeshes.push(m);
  }
}

function makeCarObject(spot) {
  const model = buildCar(spot.color, { police: spot.kind === 'police', style: spot.style });
  const car = {
    model,
    group: model.group,
    x: spot.x,
    z: spot.z,
    heading: spot.heading,
    speed: 0,
    maxSpeed: spot.kind === 'police' ? 31 : rand(24, 30),
    kind: spot.kind || 'parked',
    style: model.style,
    controlled: false,
    isPolice: spot.kind === 'police',
    color: spot.color,
    trafficSpeed: spot.speed || 0,
    lightPhase: rand(0, 10),
    halfW: 0.98,
    halfL: 2.12
  };
  car.group.position.set(car.x, 0.03, car.z);
  car.group.rotation.y = car.heading;
  scene.add(car.group);
  registerCarHitMeshes(car);
  cars.push(car);
  return car;
}

function makeHeliObject(spot) {
  const model = buildHelicopter(spot.color || 0x1a3a5c);
  const v = {
    type: 'heli', model, group: model.group,
    x: spot.x, z: spot.z, y: spot.y || 0.5,
    heading: spot.heading || 0, pitch: 0, roll: 0,
    speed: 0, verticalSpeed: 0, maxSpeed: 26,
    kind: spot.kind || 'parked', controlled: false,
    color: spot.color || 0x1a3a5c, halfW: 1.2, halfL: 2.4,
    rotorPhase: 0
  };
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.y = v.heading;
  scene.add(v.group);
  helis.push(v);
  return v;
}
function makePlaneObject(spot) {
  const model = buildPlane(spot.color || 0xd8d0c0);
  const v = {
    type: 'plane', model, group: model.group,
    x: spot.x, z: spot.z, y: spot.y || 2,
    heading: spot.heading || 0, pitch: 0, roll: 0,
    speed: 0, maxSpeed: 46,
    kind: spot.kind || 'parked', controlled: false,
    color: spot.color || 0xd8d0c0, halfW: 1.2, halfL: 3.4,
    propPhase: 0
  };
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.y = v.heading;
  scene.add(v.group);
  planes.push(v);
  return v;
}
function makeBoatObject(spot) {
  const model = buildBoat(spot.color || 0xd8d0c0);
  const v = {
    type: 'boat', model, group: model.group,
    x: spot.x, z: spot.z, y: -0.2,
    heading: spot.heading || 0, pitch: 0, roll: 0,
    speed: 0, maxSpeed: 16,
    kind: spot.kind || 'parked', controlled: false,
    color: spot.color || 0xd8d0c0, halfW: 1.4, halfL: 3.4
  };
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.y = v.heading;
  scene.add(v.group);
  boats.push(v);
  return v;
}
function spawnCars() {
  for (const spot of city.parkedSpots) makeCarObject({ ...spot, kind: 'parked' });
  for (const spot of city.trafficSpots) makeCarObject({ ...spot, kind: 'traffic' });
}
function spawnVehicles() {
  if (!city || !city.vehicleSpots) return;
  for (const spot of city.vehicleSpots) {
    if (spot.type === 'heli') makeHeliObject(spot);
    else if (spot.type === 'plane') makePlaneObject(spot);
    else if (spot.type === 'boat') makeBoatObject(spot);
  }
}

function spawnPoliceCarNear(x, z) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(32, 52);
    const px = clamp(x + Math.cos(a) * r, -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
    const pz = clamp(z + Math.sin(a) * r, -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
    if (collidesCircle(px, pz, 2.2)) continue;
    const car = makeCarObject({ x: px, z: pz, heading: Math.atan2(-(x - px), -(z - pz)), color: 0x1a2230, kind: 'police', speed: 0 });
    car.kind = 'police';
    car.isPolice = true;
    return car;
  }
  return null;
}

/* ============================================================
   Enhanced Collision System (Spatial Grid + OBB Cars + Props)
   ============================================================ */

/* Check & resolve circle against a car's Oriented Bounding Box (OBB) */
function resolveCircleAgainstCar(x, z, r, car) {
  const dx = x - car.x;
  const dz = z - car.z;
  const maxR = car.halfL + r + 0.5;
  if (dx * dx + dz * dz > maxR * maxR) return null;

  const cos = Math.cos(car.heading);
  const sin = Math.sin(car.heading);
  /* Transform into car local space where forward is -Z */
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const nx = clamp(localX, -car.halfW, car.halfW);
  const nz = clamp(localZ, -car.halfL, car.halfL);
  let lx = localX - nx;
  let lz = localZ - nz;
  const d2 = lx * lx + lz * lz;
  if (d2 >= r * r) return null;

  let d = Math.sqrt(d2);
  if (d < 0.0001) {
    const pushX = car.halfW - Math.abs(localX);
    const pushZ = car.halfL - Math.abs(localZ);
    if (pushX < pushZ) { lx = localX >= 0 ? 1 : -1; lz = 0; }
    else { lx = 0; lz = localZ >= 0 ? 1 : -1; }
    d = 1;
  }
  const overlap = r - d + 0.015;
  const pushLocalX = (lx / d) * overlap;
  const pushLocalZ = (lz / d) * overlap;
  const worldPushX = pushLocalX * cos + pushLocalZ * sin;
  const worldPushZ = -pushLocalX * sin + pushLocalZ * cos;
  return { x: x + worldPushX, z: z + worldPushZ, nx: worldPushX / overlap, nz: worldPushZ / overlap };
}

function collidesCircle(x, z, r, ignoreCars = false, ignoreCarObj = null) {
  if (Math.abs(x) > KC.WORLD_LIMIT || Math.abs(z) > KC.WORLD_LIMIT) return true;
  const nearby = city ? city.getNearbyColliders(x, z, r + 2) : [];
  for (let i = 0; i < nearby.length; i++) {
    const c = nearby[i];
    if (!c.active) continue;
    const nx = clamp(x, c.minX, c.maxX);
    const nz = clamp(z, c.minZ, c.maxZ);
    const dx = x - nx, dz = z - nz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  if (!ignoreCars) {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (car === ignoreCarObj) continue;
      if (resolveCircleAgainstCar(x, z, r, car)) return true;
    }
  }
  return false;
}

/* Smoothly push a circle out of static colliders AND vehicle OBBs */
function resolveCircleWorld(x, z, r, includeCars = true, ignoreCarObj = null) {
  let hitNormalX = 0, hitNormalZ = 0, didHit = false;
  const nearby = city ? city.getNearbyColliders(x, z, r + 3) : [];
  for (let i = 0; i < nearby.length; i++) {
    const c = nearby[i];
    if (!c.active) continue;
    const nx = clamp(x, c.minX, c.maxX);
    const nz = clamp(z, c.minZ, c.maxZ);
    let dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      let d = Math.sqrt(d2);
      if (d < 0.0001) {
        const left = x - c.minX, right = c.maxX - x, up = z - c.minZ, down = c.maxZ - z;
        const m = Math.min(left, right, up, down);
        if (m === left) { dx = -1; dz = 0; }
        else if (m === right) { dx = 1; dz = 0; }
        else if (m === up) { dx = 0; dz = -1; }
        else { dx = 0; dz = 1; }
        d = 1;
      }
      const push = r - d + 0.01;
      const pnx = dx / d, pnz = dz / d;
      x += pnx * push;
      z += pnz * push;
      hitNormalX = pnx;
      hitNormalZ = pnz;
      didHit = true;
    }
  }
  if (includeCars) {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (car === ignoreCarObj) continue;
      const res = resolveCircleAgainstCar(x, z, r, car);
      if (res) {
        x = res.x;
        z = res.z;
        hitNormalX = res.nx;
        hitNormalZ = res.nz;
        didHit = true;
      }
    }
  }
  x = clamp(x, -KC.WORLD_LIMIT + r, KC.WORLD_LIMIT - r);
  z = clamp(z, -KC.WORLD_LIMIT + r, KC.WORLD_LIMIT - r);
  return { x, z, didHit, hitNormalX, hitNormalZ };
}

/* Destructible street furniture hit check for cars */
function checkDestructiblePropHit(car) {
  if (!city || !city.destructibleProps || Math.abs(car.speed) < 3.5) return;
  for (let i = 0; i < city.destructibleProps.length; i++) {
    const p = city.destructibleProps[i];
    if (p.broken) continue;
    const dx = p.x - car.x, dz = p.z - car.z;
    if (dx * dx + dz * dz < 2.35 * 2.35) {
      p.broken = true;
      if (p.collider) p.collider.active = false;
      if (p.lampObj) {
        p.lampObj.broken = true;
        if (p.lampObj.glow) p.lampObj.glow.visible = false;
        if (p.lampObj.poolMesh) p.lampObj.poolMesh.visible = false;
      }
      p.mesh.rotation.x = (Math.random() < 0.5 ? 1 : -1) * 1.38;
      p.mesh.rotation.z = rand(-0.6, 0.6);
      p.mesh.position.y = 0.18;
      car.speed *= 0.84;
      player.shake = Math.max(player.shake, 0.32);
      G.sound.crash(0.6);
      triggerGamepadRumble(0.45, 140);
      if (p.kind === 'hydrant') {
        p.geyserTimer = 8.5;
        G.sound.splash();
        spawnParticles(p.x, 0.7, p.z, 0x8ad8ff, 18, 6, 0.7, 10);
      } else {
        spawnParticles(p.x, 0.8, p.z, 0xffcf7a, 10, 4.5, 0.4, 10);
      }
    }
  }
}

function updateCars(dt) {
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (car.controlled) continue;

    /* Distance cull distant cars (> 165m) */
    const distSq = (car.x - px) * (car.x - px) + (car.z - pz) * (car.z - pz);
    car.group.visible = distSq <= 165 * 165;

    if (car.kind === 'traffic') {
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      /* Check ahead for player car, other cars, or pedestrians so traffic brakes instead of clipping */
      const lookX = car.x + fx * 4.4, lookZ = car.z + fz * 4.4;
      let blocked = false;
      for (let j = 0; j < cars.length; j++) {
        if (i === j) continue;
        const other = cars[j];
        if ((other.x - lookX) * (other.x - lookX) + (other.z - lookZ) * (other.z - lookZ) < 3.4 * 3.4) {
          blocked = true;
          break;
        }
      }
      if (!blocked && !activeVehicle && (player.pos.x - lookX) * (player.pos.x - lookX) + (player.pos.z - lookZ) * (player.pos.z - lookZ) < 2.6 * 2.6) {
        blocked = true;
        if (Math.random() < dt * 0.45 && (!state.ambientHornTimer || state.ambientHornTimer <= 0)) {
          G.sound.horn();
          state.ambientHornTimer = 3.2;
        }
      }
      state.ambientHornTimer = Math.max(0, (state.ambientHornTimer || 0) - dt);
      const curSpeed = blocked ? 0 : car.trafficSpeed;
      car.speed = lerp(car.speed, curSpeed, Math.min(1, dt * 6));
      car.x += fx * car.speed * dt;
      car.z += fz * car.speed * dt;
      const lim = KC.WORLD_LIMIT - 2;
      if (car.x > lim) car.x = -lim;
      if (car.x < -lim) car.x = lim;
      if (car.z > lim) car.z = -lim;
      if (car.z < -lim) car.z = lim;
      car.group.position.set(car.x, 0.03, car.z);
      car.group.rotation.y = car.heading;
      if (car.group.visible) {
        for (const w of car.model.wheels) w.rotation.x += car.speed * dt * 2.5;
      }
    } else if (car.isPolice && state.wanted >= 2 && distSq < 95 * 95 && distSq > 16 * 16) {
      /* Police cruiser actively pursues along clear vector */
      const targetAngle = Math.atan2(-(px - car.x), -(pz - car.z));
      let diff = targetAngle - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += clamp(diff, -1.6 * dt, 1.6 * dt);
      const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
      const nx = car.x + fx * 11 * dt, nz = car.z + fz * 11 * dt;
      if (!collidesCircle(nx, nz, 1.35, false, car)) {
        car.x = nx;
        car.z = nz;
        car.group.position.set(car.x, 0.03, car.z);
        car.group.rotation.y = car.heading;
      }
    }

    if (car.isPolice && car.model.policeMats && car.group.visible) {
      car.lightPhase += dt * 7;
      const on = Math.sin(car.lightPhase) > 0;
      car.model.policeMats[0].color.setHex(on ? 0xff1f1f : 0x3a0808);
      car.model.policeMats[1].color.setHex(on ? 0x081c3a : 0x2b7bff);
    }
  }
}

/* ============================================================
   NPC Movement & Smart Steering / Whisker Pathfinding
   ============================================================ */
function moveWithCollision(actor, dx, dz, radius = 0.38) {
  const p = actor.group.position;
  const res = resolveCircleWorld(p.x + dx, p.z + dz, radius, true, null);
  p.x = res.x;
  p.z = res.z;
  return res.didHit;
}

const losRaycaster = new THREE.Raycaster();
function hasLineOfSight(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.1) return true;
  losRaycaster.set(from, dir.normalize());
  losRaycaster.far = dist - 0.2;
  const hits = losRaycaster.intersectObjects(city.rayMeshes, false);
  return hits.length === 0;
}

function headingToFace(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  return Math.atan2(-dx, -dz);
}

function animateWalk(model, phase, amount = 1, speedFactor = 1, crouching = false) {
  const swing = Math.sin(phase) * 0.58 * amount;
  const crouchThigh = crouching ? 0.62 : 0;
  const crouchKnee = crouching ? -1.05 : 0;
  model.leftLeg.rotation.x = swing + crouchThigh;
  model.rightLeg.rotation.x = -swing + crouchThigh;
  if (model.leftKnee && model.rightKnee) {
    const lBend = Math.max(0, Math.cos(phase - 0.35)) * 0.85 * amount;
    const rBend = Math.max(0, Math.cos(phase + Math.PI - 0.35)) * 0.85 * amount;
    model.leftKnee.rotation.x = -lBend + crouchKnee;
    model.rightKnee.rotation.x = -rBend + crouchKnee;
  }
  model.leftArm.rotation.x = -swing * 0.78;
  model.rightArm.rotation.x = swing * 0.78;
  if (model.leftForearm && model.rightForearm) {
    model.leftForearm.rotation.x = 0.2 + Math.max(0, -swing) * 0.5;
    model.rightForearm.rotation.x = 0.2 + Math.max(0, swing) * 0.5;
  }
  /* Prop-specific natural arm poses */
  if (model.heldProp === 'coffee' || model.heldProp === 'phone') {
    model.rightArm.rotation.x = 0.45 + Math.sin(phase * 0.5) * 0.08;
    if (model.rightForearm) model.rightForearm.rotation.x = 0.82;
  } else if (model.heldProp === 'sax') {
    model.rightArm.rotation.x = 0.95 + Math.sin(phase * 2.2) * 0.12;
    model.leftArm.rotation.x = 0.85 + Math.cos(phase * 2.2) * 0.1;
    if (model.rightForearm) model.rightForearm.rotation.x = 0.65;
    if (model.leftForearm) model.leftForearm.rotation.x = 0.65;
  } else if (model.heldProp === 'guitar') {
    model.leftArm.rotation.x = 0.72;
    model.rightArm.rotation.x = 0.65 + Math.sin(phase * 4.5) * 0.22;
    if (model.rightForearm) model.rightForearm.rotation.x = 0.55;
  }
  if (model.torso) {
    model.torso.rotation.y = -Math.sin(phase) * 0.1 * amount;
  }
  if (model.head) {
    model.head.rotation.y = Math.sin(phase * 0.45) * 0.12;
  }
  model.group.position.y = 0.14 - (crouching ? 0.22 : 0) + Math.abs(Math.sin(phase)) * 0.032 * speedFactor;
}

/* ---------------- Pedestrians with Intersection Turns, Social Groups & Proximity Recycling ---------------- */
function pedHeading(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI : 0;
  return dir > 0 ? -Math.PI / 2 : Math.PI / 2;
}

const INNER_ROAD_LINES = [-64, -18, 28, 74];

function spawnStorefrontNpcs() {
  /* Notable Kansas City business storefront patrons, diners, commuters & jazz buskers */
  const spots = [
    /* Power & Light / Midland Theatre / Charlie Hustle */
    { x: 11.5, z: 9.5, heading: 0.7, role: 'fan', prop: 'coffee' },
    { x: 12.6, z: 10.4, heading: -2.3, role: 'hipster', prop: 'phone' },
    { x: 24.5, z: 16.2, heading: 0.4, role: 'office', prop: 'briefcase' },
    { x: 25.6, z: 16.8, heading: -2.6, role: 'shopper', prop: 'bag' },
    { x: -5.5, z: 16.5, heading: 0.2, role: 'musician', prop: 'sax' },
    /* H&R Block World HQ & Downtown Main St Streetcar Stop */
    { x: -11.4, z: 15.5, heading: 1.57, role: 'office', prop: 'coffee' },
    { x: -11.4, z: 17.2, heading: 1.57, role: 'citizen', prop: 'phone' },
    { x: -11.4, z: -29.5, heading: 1.57, role: 'office', prop: 'briefcase' },
    /* 18th & Vine: Arthur Bryant's BBQ, Gates Bar-B-Q & The Blue Room Jazz */
    { x: 93.5, z: 66.5, heading: 3.14, role: 'bbq', prop: 'coffee' },
    { x: 95.0, z: 66.5, heading: -1.2, role: 'fan', prop: 'bag' },
    { x: 108.5, z: 54.5, heading: 0, role: 'musician', prop: 'sax' },
    { x: 110.0, z: 55.2, heading: -1.8, role: 'hipster', prop: 'phone' },
    /* East Crossroads: The Roasterie KC, Green Lady Lounge, Town Topic 24H & Up-Down Arcade */
    { x: 131.5, z: -26.5, heading: 2.4, role: 'hipster', prop: 'coffee' },
    { x: 132.8, z: -25.8, heading: -0.8, role: 'office', prop: 'coffee' },
    { x: 148.5, z: -12.5, heading: 1.5, role: 'musician', prop: 'guitar' },
    { x: 147.2, z: -11.8, heading: -1.5, role: 'citizen', prop: 'phone' },
    /* Westport: Joe's KC Gas Station BBQ & Kelly's Westport Inn */
    { x: -38.5, z: 66.5, heading: 0.5, role: 'bbq', prop: 'bag' },
    { x: -37.2, z: 67.2, heading: -2.4, role: 'fan', prop: 'coffee' },
    { x: -24.5, z: 54.5, heading: 0.9, role: 'hipster', prop: 'phone' },
    /* Crown Center: Hallmark Cards HQ & Jack Stack BBQ */
    { x: 54.5, z: 98.5, heading: 0.3, role: 'shopper', prop: 'bag' },
    { x: 55.8, z: 99.0, heading: -2.5, role: 'office', prop: 'briefcase' },
    /* West Bottoms: Boulevard Brewing Co. */
    { x: -93.5, z: -26.5, heading: 0.6, role: 'worker', prop: 'coffee' },
    /* Country Club Plaza: Winstead's Diner */
    { x: -35.5, z: 168.5, heading: 2.8, role: 'shopper', prop: 'bag' },
    { x: -34.2, z: 169.0, heading: -0.5, role: 'citizen', prop: 'coffee' }
  ];

  for (const s of spots) {
    if (collidesCircle(s.x, s.z, 0.32)) continue;
    const model = makePerson({ type: 'ped', role: s.role, prop: s.prop });
    model.group.position.set(s.x, 0.14, s.z);
    model.group.rotation.y = s.heading;
    scene.add(model.group);
    const ped = {
      type: 'ped', kind: 'ped', alive: true, hp: 30, model, group: model.group,
      axis: 'v', line: 28, side: 1, dir: 1, heading: s.heading,
      speed: 1.2, scared: 0, fleeX: 0, fleeZ: 0, turnCooldown: 0,
      phase: rand(0, 10), stationary: true, homeX: s.x, homeZ: s.z, baseHeading: s.heading
    };
    addCharacterTargets(ped);
    peds.push(ped);
  }
}

function spawnPeds(count = 82) {
  for (let i = 0; i < count; i++) {
    const innerBias = i < count * 0.68;
    const axis = Math.random() < 0.5 ? 'v' : 'h';
    const line = innerBias ? KC.pick(INNER_ROAD_LINES) : KC.pick(KC.ROAD_LINES);
    const side = Math.random() < 0.5 ? 1 : -1;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const along = innerBias ? rand(-95, 105) : rand(-170, 170);
    const offset = 5.75 + rand(-0.35, 0.35);
    const x = axis === 'v' ? line + side * offset : along;
    const z = axis === 'v' ? along : line + side * offset;
    if (collidesCircle(x, z, 0.35)) continue;
    const model = makePerson({ type: 'ped' });
    const heading = pedHeading(axis, dir);
    model.group.position.set(x, 0.14, z);
    model.group.rotation.y = heading;
    scene.add(model.group);
    const ped = {
      type: 'ped', kind: 'ped', alive: true, hp: 30, model, group: model.group,
      axis, line, side, dir, heading, speed: rand(1.05, 1.65), scared: 0,
      fleeX: 0, fleeZ: 0, turnCooldown: 0, phase: rand(0, 10), stationary: false
    };
    addCharacterTargets(ped);
    peds.push(ped);
  }
  spawnStorefrontNpcs();
}

/* Recycle distant roaming pedestrians back onto a sidewalk 32m-92m from the player */
function recyclePedNearPlayer(p, px, pz) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const axis = Math.random() < 0.5 ? 'v' : 'h';
    /* Pick a road line within 85m of the player's transverse coordinate */
    const refCoord = axis === 'v' ? px : pz;
    let bestLines = KC.ROAD_LINES.filter((l) => Math.abs(l - refCoord) < 88);
    if (!bestLines.length) bestLines = KC.ROAD_LINES;
    const line = KC.pick(bestLines);
    const side = Math.random() < 0.5 ? 1 : -1;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const alongBase = axis === 'v' ? pz : px;
    const alongOffset = (Math.random() < 0.5 ? 1 : -1) * rand(28, 86);
    const along = clamp(alongBase + alongOffset, -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
    const x = axis === 'v' ? line + side * 5.75 : along;
    const z = axis === 'v' ? along : line + side * 5.75;
    const d = dist2(x, z, px, pz);
    if (d < 24 || d > 105) continue;
    if (collidesCircle(x, z, 0.36)) continue;
    p.axis = axis;
    p.line = line;
    p.side = side;
    p.dir = dir;
    p.heading = pedHeading(axis, dir);
    p.scared = 0;
    p.group.position.set(x, 0.14, z);
    p.group.rotation.y = p.heading;
    p.group.visible = true;
    return;
  }
}

function updatePeds(dt) {
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;

  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (!p.alive) { peds.splice(i, 1); continue; }
    const pos = p.group.position;
    const distSq = (pos.x - px) * (pos.x - px) + (pos.z - pz) * (pos.z - pz);

    /* Recycle roaming pedestrians that drift >128m away back into a 30m-90m ring around the player */
    if (!p.stationary && G.mode === 'playing' && distSq > 128 * 128) {
      recyclePedNearPlayer(p, px, pz);
      continue;
    }

    /* Distance cull distant pedestrians (> 150m) */
    p.group.visible = distSq <= 150 * 150;
    if (distSq > 165 * 165) continue;

    p.turnCooldown = Math.max(0, p.turnCooldown - dt);

    if (p.scared > 0) {
      /* Directional flee away from danger source + obstacle steering */
      p.scared -= dt;
      let fx = pos.x - p.fleeX, fz = pos.z - p.fleeZ;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      const spd = 4.6;
      const blocked = moveWithCollision(p, fx * spd * dt, fz * spd * dt, 0.36);
      if (blocked) {
        /* Steer 90 degrees around obstacle */
        moveWithCollision(p, -fz * spd * dt, fx * spd * dt, 0.36);
      }
      p.heading = Math.atan2(-fx, -fz);
      p.group.rotation.y = lerp(p.group.rotation.y, p.heading, Math.min(1, dt * 10));
      p.phase += dt * 11;
      animateWalk(p.model, p.phase, 1.3, spd / 1.2);
      p.model.leftArm.rotation.x = 2.5 + Math.sin(p.phase * 2) * 0.3;
      p.model.rightArm.rotation.x = 2.5 + Math.cos(p.phase * 2) * 0.3;
      continue;
    }

    /* Stationary storefront patrons, diners & street performers */
    if (p.stationary) {
      p.phase += dt * 2.4;
      animateWalk(p.model, p.phase, 0.14, 0.25);
      p.group.rotation.y = p.baseHeading + Math.sin(p.phase * 0.45) * 0.22;
      /* Head tracking toward nearby player (social awareness) */
      if (p.model.head) {
        const dx = px - pos.x, dz = pz - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 11 && d > 0.5) {
          const targetYaw = Math.atan2(-dx, -dz) - p.group.rotation.y;
          p.model.head.rotation.y = lerp(p.model.head.rotation.y, clamp(targetYaw, -0.9, 0.9), 1 - Math.exp(-dt * 3));
        } else {
          p.model.head.rotation.y = lerp(p.model.head.rotation.y, Math.sin(p.phase * 0.8) * 0.28, 1 - Math.exp(-dt * 2));
        }
      }
      if (p.model.heldProp !== 'sax' && p.model.heldProp !== 'guitar') {
        /* Social conversación hand gesture */
        p.model.leftArm.rotation.x = 0.25 + Math.max(0, Math.sin(p.phase * 1.3)) * 0.45;
        if (p.model.leftForearm) p.model.leftForearm.rotation.x = 0.55;
      }
      /* Wave when player is close */
      if (dist2(pos.x, pos.z, px, pz) < 5 && p.model.rightArm) {
        p.model.rightArm.rotation.x = -1.2 + Math.sin(p.phase * 4) * 0.4;
        if (p.model.rightForearm) p.model.rightForearm.rotation.x = 0.6;
      }
      /* Occasional chat bubble for storefront patrons */
      p.talkTimer = (p.talkTimer || 0) - dt;
      if (p.talkTimer <= 0 && pedBubbles.length < 8) {
        let partner = null;
        for (const q of peds) {
          if (q === p || !q.stationary || !q.alive) continue;
          if (dist2(pos.x, pos.z, q.group.position.x, q.group.position.z) < 3.6) { partner = q; break; }
        }
        const phrases = ['Hey!', 'Nice day.', 'Go Chiefs!', 'BBQ?', 'See ya.', 'Welcome to KC.', 'Watch it!', 'Howdy partner.', 'Good game.', 'Go Royals!'];
        if (partner) {
          spawnPedBubble(p, KC.pick(phrases));
          if (Math.random() < 0.7) spawnPedBubble(partner, KC.pick(phrases));
          p.talkTimer = rand(8, 16);
          partner.talkTimer = rand(8, 16);
        } else if (dist2(pos.x, pos.z, px, pz) < 16) {
          spawnPedBubble(p, KC.pick(phrases));
          p.talkTimer = rand(6, 14);
        } else {
          p.talkTimer = rand(10, 18);
        }
      }
      continue;
    }

    /* Normal sidewalk navigation with intersection turns & traffic waits */
    let speed = p.speed;
    const alongCoord = p.axis === 'v' ? pos.z : pos.x;

    /* At road intersections: check for oncoming cars or randomly turn 90 degrees onto cross street */
    for (let r = 0; r < KC.ROAD_LINES.length; r++) {
      const rl = KC.ROAD_LINES[r];
      const dLine = Math.abs(alongCoord - rl);
      if (dLine < 6.4 && dLine > 4.9) {
        /* Check if a moving car is passing through this intersection */
        for (let c = 0; c < cars.length; c++) {
          const car = cars[c];
          if (Math.abs(car.speed) > 1.5 && dist2(pos.x, pos.z, car.x, car.z) < 8.5) {
            speed = 0;
            break;
          }
        }
        /* 35% chance to turn onto the cross-street sidewalk */
        if (speed > 0 && p.turnCooldown <= 0 && Math.random() < 0.35) {
          p.turnCooldown = 6.0;
          p.axis = p.axis === 'v' ? 'h' : 'v';
          p.line = rl;
          p.side = Math.random() < 0.5 ? 1 : -1;
          p.dir = Math.random() < 0.5 ? 1 : -1;
          p.heading = pedHeading(p.axis, p.dir);
        }
        break;
      }
    }

    if (speed > 0) {
      let vx = 0, vz = 0;
      const targetSide = p.line + p.side * 5.75;
      if (p.axis === 'v') {
        vz = p.dir * speed;
        vx = clamp((targetSide - pos.x) * 2.5, -1.5, 1.5);
      } else {
        vx = p.dir * speed;
        vz = clamp((targetSide - pos.z) * 2.5, -1.5, 1.5);
      }
      /* Separation from player & other peds */
      const dPlayer = dist2(pos.x, pos.z, px, pz);
      if (dPlayer < 1.6 && dPlayer > 0.01) {
        vx += ((pos.x - px) / dPlayer) * 1.4;
        vz += ((pos.z - pz) / dPlayer) * 1.4;
      }
      moveWithCollision(p, vx * dt, vz * dt, 0.35);
      const lim = KC.WORLD_LIMIT - 4;
      if (pos.z > lim || pos.z < -lim || pos.x > lim || pos.x < -lim) {
        p.dir *= -1;
      }
      p.heading = Math.atan2(-vx, -vz);
      p.group.rotation.y = lerp(p.group.rotation.y, p.heading, Math.min(1, dt * 8));
      p.phase += dt * 5.5 * speed;
      animateWalk(p.model, p.phase, 1, speed / 1.2);
    } else {
      animateWalk(p.model, p.phase, 0.08, 0.1);
    }
  }
}

function spawnPedBubble(ped, text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(12,10,14,0.85)';
  ctx.fillRect(6, 6, 244, 84);
  ctx.strokeStyle = 'rgba(242,232,213,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 244, 84);
  ctx.fillStyle = '#f2e8d5';
  ctx.font = 'bold 26px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.8, 1);
  sprite.position.set(ped.group.position.x, 2.35, ped.group.position.z);
  scene.add(sprite);
  const bubble = { sprite, mat, tex, life: 3.2, ped };
  pedBubbles.push(bubble);
  ped.bubble = bubble;
}

const vendorBubbles = [];
function updateVendorBubbles(dt) {
  if (!city || !city.vendorCarts) return;
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  for (const c of city.vendorCarts) {
    c.talkTimer = (c.talkTimer || 0) - dt;
    if (c.talkTimer <= 0 && dist2(c.x, c.z, px, pz) < 14 && vendorBubbles.length < 4) {
      const phrases = ['Fresh KC BBQ!', 'Cold brew here!', 'Hot ribs!', 'Best in town!', 'Come get it!'];
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(12,10,14,0.85)';
      ctx.fillRect(6, 6, 244, 68);
      ctx.strokeStyle = 'rgba(87,230,194,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, 244, 68);
      ctx.fillStyle = '#57e6c2';
      ctx.font = 'bold 24px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(KC.pick(phrases), 128, 40);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.4, 0.75, 1);
      sprite.position.set(c.x, 2.6, c.z);
      scene.add(sprite);
      vendorBubbles.push({ sprite, mat, tex, life: 2.8 });
      c.talkTimer = rand(5, 10);
    }
  }
  for (let i = vendorBubbles.length - 1; i >= 0; i--) {
    const b = vendorBubbles[i];
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.sprite); b.mat.dispose(); b.tex.dispose(); vendorBubbles.splice(i, 1); continue;
    }
    b.mat.opacity = Math.min(1, b.life * 1.6);
  }
}

function updatePedBubbles(dt) {
  for (let i = pedBubbles.length - 1; i >= 0; i--) {
    const b = pedBubbles[i];
    b.life -= dt;
    if (b.life <= 0 || !b.ped.alive) {
      scene.remove(b.sprite);
      b.mat.dispose();
      b.tex.dispose();
      pedBubbles.splice(i, 1);
      if (b.ped.bubble === b) b.ped.bubble = null;
      continue;
    }
    const pos = b.ped.group.position;
    b.sprite.position.set(pos.x, 2.35 + Math.sin((3.2 - b.life) * 2) * 0.06, pos.z);
    b.mat.opacity = Math.min(1, b.life * 1.6);
  }
}

function scarePeds(x, z, radius = 26) {
  for (const p of peds) {
    if (p.alive && dist2(p.group.position.x, p.group.position.z, x, z) < radius) {
      p.scared = rand(4.5, 8.5);
      p.fleeX = x;
      p.fleeZ = z;
    }
  }
}

/* ============================================================
   Hostiles (Cops / Thugs) with Whisker Pathing & Tactical Cover
   ============================================================ */
function makeHostile(type, x, z, extra = {}) {
  const model = makePerson({ type });
  model.group.position.set(x, 0.14, z);
  scene.add(model.group);
  const actor = {
    type, kind: type, alive: true, model, group: model.group,
    hp: type === 'cop' ? 100 : (80 + (state.contract.number || 1) * 12),
    maxHp: type === 'cop' ? 100 : (80 + (state.contract.number || 1) * 12),
    speed: type === 'cop' ? 3.05 : 3.25,
    fireTimer: rand(0.8, 2.2),
    shootCooldown: type === 'cop' ? rand(1.25, 2.0) : rand(1.0, 1.7),
    damage: type === 'cop' ? 8 : (6 + (state.contract.number || 1) * 0.6),
    accuracy: type === 'cop' ? 0.55 : 0.5,
    phase: rand(0, 10),
    losTimer: 0,
    hasLos: false,
    crouching: false,
    strafe: Math.random() < 0.5 ? 1 : -1,
    strafeTimer: rand(1.5, 3.5),
    ...extra
  };
  actor.heading = headingToFace(actor.group.position, player.pos);
  actor.group.rotation.y = actor.heading;
  addCharacterTargets(actor);
  if (type === 'cop') cops.push(actor); else thugs.push(actor);
  return actor;
}

function spawnCopAt(x, z) {
  return makeHostile('cop', x, z);
}

function spawnGangsters(count) {
  for (let i = 0; i < count; i++) {
    let px = 0, pz = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      px = rand(-KC.WORLD_LIMIT + 20, KC.WORLD_LIMIT - 20);
      pz = rand(-KC.WORLD_LIMIT + 20, KC.WORLD_LIMIT - 20);
      if (!collidesCircle(px, pz, 0.5)) break;
    }
    const t = makeHostile('thug', px, pz, { gangster: true });
    t.wanderX = px; t.wanderZ = pz;
    t.nextWander = rand(4, 9);
    t.randomShootTimer = rand(3, 8);
    t.group.rotation.y = rand(0, Math.PI * 2);
  }
}

function spawnThugs(count, x, z) {
  for (let i = 0; i < count; i++) {
    let px = x, pz = z;
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(7, 15);
      px = x + Math.cos(a) * r;
      pz = z + Math.sin(a) * r;
      if (!collidesCircle(px, pz, 0.5)) break;
    }
    const t = makeHostile('thug', px, pz);
    t.group.rotation.y = headingToFace(t.group.position, player.pos);
  }
}

/* Whisker-ray steering: find clear movement angle around buildings & cars */
function steerDirectionWhiskers(x, z, dirX, dirZ, probeDist = 1.65) {
  if (!collidesCircle(x + dirX * probeDist, z + dirZ * probeDist, 0.42)) {
    return { x: dirX, z: dirZ };
  }
  const baseAngle = Math.atan2(dirZ, dirX);
  const offsets = [0.65, -0.65, 1.25, -1.25, 1.85, -1.85];
  for (let i = 0; i < offsets.length; i++) {
    const a = baseAngle + offsets[i];
    const wx = Math.cos(a), wz = Math.sin(a);
    if (!collidesCircle(x + wx * probeDist, z + wz * probeDist, 0.42)) {
      return { x: wx, z: wz };
    }
  }
  return { x: -dirZ, z: dirX };
}

function updateHostile(actor, dt, peersList) {
  if (!actor.alive) return;
  const pos = actor.group.position;
  let target = activeVehicle ? activeVehicle.group.position : player.pos;
  if (actor.gangster) {
    if (!actor.wanderX) { actor.wanderX = actor.group.position.x; actor.wanderZ = actor.group.position.z; actor.nextWander = rand(3, 7); actor.randomShootTimer = rand(4, 9); }
    actor.nextWander -= dt;
    if (actor.nextWander <= 0 || dist2(actor.group.position.x, actor.group.position.z, actor.wanderX, actor.wanderZ) < 1.5) {
      actor.wanderX = clamp(actor.group.position.x + rand(-30, 30), -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
      actor.wanderZ = clamp(actor.group.position.z + rand(-30, 30), -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
      actor.nextWander = rand(5, 12);
    }
    target = { x: actor.wanderX, z: actor.wanderZ };
  } else if (actor.type === 'cop') {
    /* Cops target nearest criminal (thug/gangster) if any, else player if wanted */
    let criminal = null, cDist = 60;
    for (const t of thugs) {
      if (!t.alive) continue;
      const d = dist2(pos.x, pos.z, t.group.position.x, t.group.position.z);
      if (d < cDist) { cDist = d; criminal = t; }
    }
    if (criminal) {
      target = { x: criminal.group.position.x, z: criminal.group.position.z };
      actor.currentTarget = { x: criminal.group.position.x, z: criminal.group.position.z, actor: criminal };
    } else {
      actor.currentTarget = null;
      if (state.wanted <= 0) {
      /* Idle patrol: wander */
      if (!actor.wanderX) { actor.wanderX = pos.x; actor.wanderZ = pos.z; actor.nextWander = rand(4, 8); }
      actor.nextWander -= dt;
      if (actor.nextWander <= 0 || dist2(pos.x, pos.z, actor.wanderX, actor.wanderZ) < 1.5) {
        actor.wanderX = clamp(pos.x + rand(-20, 20), -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
        actor.wanderZ = clamp(pos.z + rand(-20, 20), -KC.WORLD_LIMIT + 10, KC.WORLD_LIMIT - 10);
        actor.nextWander = rand(5, 10);
      }
      target = { x: actor.wanderX, z: actor.wanderZ };
    }
  }
  }
  const tx = target.x, tz = target.z;
  const dx = tx - pos.x, dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);

  actor.losTimer -= dt;
  if (actor.losTimer <= 0) {
    actor.losTimer = 0.25 + Math.random() * 0.18;
    actor.hasLos = hasLineOfSight(
      new THREE.Vector3(pos.x, 1.45, pos.z),
      new THREE.Vector3(tx, activeVehicle ? 1.0 : player.currentEye * 0.75, tz)
    );
  }

  actor.strafeTimer -= dt;
  if (actor.strafeTimer <= 0) {
    actor.strafeTimer = rand(1.8, 3.6);
    if (Math.random() < 0.5) actor.strafe *= -1;
    actor.crouching = actor.hasLos && dist < 20 && Math.random() < 0.35;
  }

  const desired = actor.type === 'cop' ? 15 : 11;
  const dirX = dx / Math.max(0.001, dist), dirZ = dz / Math.max(0.001, dist);
  let moveX = 0, moveZ = 0;

  if (!actor.hasLos || dist > desired + 3) {
    const steered = steerDirectionWhiskers(pos.x, pos.z, dirX, dirZ, 1.7);
    moveX = steered.x * actor.speed;
    moveZ = steered.z * actor.speed;
    actor.crouching = false;
  } else if (dist < desired - 4) {
    moveX = -dirX * actor.speed * 0.6;
    moveZ = -dirZ * actor.speed * 0.6;
  } else {
    const sx = -dirZ * actor.strafe, sz = dirX * actor.strafe;
    if (!collidesCircle(pos.x + sx * 1.1, pos.z + sz * 1.1, 0.42)) {
      moveX = sx * actor.speed * 0.42;
      moveZ = sz * actor.speed * 0.42;
    }
  }

  /* Separation force so hostiles don't stack together */
  for (let i = 0; i < peersList.length; i++) {
    const other = peersList[i];
    if (other === actor || !other.alive) continue;
    const odx = pos.x - other.group.position.x;
    const odz = pos.z - other.group.position.z;
    const od2 = odx * odx + odz * odz;
    if (od2 < 1.6 * 1.6 && od2 > 0.001) {
      const od = Math.sqrt(od2);
      moveX += (odx / od) * 1.4;
      moveZ += (odz / od) * 1.4;
    }
  }

  if (moveX || moveZ) {
    moveWithCollision(actor, moveX * dt, moveZ * dt, 0.4);
    actor.phase += dt * 7.5;
    animateWalk(actor.model, actor.phase, 0.8, 1, actor.crouching);
  } else {
    animateWalk(actor.model, actor.phase, 0.08, 0.15, actor.crouching);
  }
  actor.heading = headingToFace(pos, { x: tx, z: tz });
  actor.group.rotation.y = actor.heading;

  /* Raise weapon arm forward when aiming at player */
  if (actor.hasLos && dist < 34) {
    actor.model.rightArm.rotation.x = 1.45;
  }

  actor.fireTimer -= dt;
  if (actor.gangster) {
    actor.randomShootTimer = (actor.randomShootTimer || 0) - dt;
    if (actor.randomShootTimer <= 0) {
      actor.randomShootTimer = rand(4, 10);
      randomGangShoot(actor);
    }
  }
  if (!actor.gangster && actor.fireTimer <= 0 && actor.hasLos && dist < (actor.type === 'cop' ? 34 : 30)) {
    actor.fireTimer = actor.shootCooldown * rand(0.8, 1.25);
    hostileShoot(actor, dist);
  }
}

function randomGangShoot(actor) {
  if (!actor.alive) return;
  const from = new THREE.Vector3(actor.group.position.x, 1.42, actor.group.position.z);
  const yaw = rand(0, Math.PI * 2);
  const pitch = rand(-0.05, 0.05);
  const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const end = from.clone().addScaledVector(dir, 60);
  const raycaster = new THREE.Raycaster(from, dir, 0, 60);
  const hits = raycaster.intersectObjects(city.rayMeshes.concat(carHitMeshes, charTargets), false);
  if (hits.length) end.copy(hits[0].point);
  /* Damage if hitting player */
  if (hits.length && hits[0].object.userData.actor === undefined && hits[0].object.userData.car === undefined) {
    /* hit wall, nothing */
  }
  if (hits.length && hits[0].object.userData.actor && hits[0].object.userData.actor === /*player*/ null) {}
  addTracer(from, end, 0xffb46b, 0.85);
  spawnParticles(from.x, from.y, from.z, 0xffcf7a, 4, 3, 0.2, 8);
  G.sound.policeShot();
  actor.model.rightArm.rotation.x = 1.45;
  setTimeout(() => { if (actor.model) actor.model.rightArm.rotation.x = 0.2; }, 120);
}

function updateCops(dt) {
  for (let i = cops.length - 1; i >= 0; i--) {
    const c = cops[i];
    if (!c.alive) { cops.splice(i, 1); continue; }
    updateHostile(c, dt, cops);
  }
}

function updateThugs(dt) {
  for (let i = thugs.length - 1; i >= 0; i--) {
    const t = thugs[i];
    if (!t.alive) { thugs.splice(i, 1); continue; }
    updateHostile(t, dt, thugs);
  }
}

function hostileShoot(actor, dist) {
  const ct = actor.currentTarget;
  const targetY = ct && ct.actor ? 1.3 : (activeVehicle ? 1.1 : (player.crouching ? 0.85 : 1.15));
  const tx = ct && ct.actor ? ct.x : (activeVehicle ? activeVehicle.group.position.x : player.pos.x);
  const tz = ct && ct.actor ? ct.z : (activeVehicle ? activeVehicle.group.position.z : player.pos.z);
  const from = new THREE.Vector3(actor.group.position.x, actor.crouching ? 1.1 : 1.42, actor.group.position.z);
  const to = new THREE.Vector3(tx, targetY, tz);
  /* Crouching or sliding makes player harder to hit */
  const evasionPenalty = (player.crouching ? 0.1 : 0) + (player.slideTimer > 0 ? 0.16 : 0);
  const hitChance = clamp(actor.accuracy - dist * 0.009 - evasionPenalty, 0.16, 0.7);
  const hit = Math.random() < hitChance;
  if (!hit) {
    to.x += rand(-1.4, 1.4);
    to.y += rand(-0.4, 1.1);
    to.z += rand(-1.4, 1.4);
  }
  addTracer(from, to, actor.type === 'cop' ? 0xaed4ff : 0xffb46b, 0.7);
  addImpactFlash(to, actor.type === 'cop' ? 0xaed4ff : 0xffb46b, 0.45);
  spawnParticles(from.x, from.y, from.z, 0xffcf7a, 3, 2.4, 0.15, 4);
  if (actor.type === 'cop') G.sound.policeShot(); else G.sound.shoot('pistol');
  if (hit) {
    if (ct && ct.actor && ct.actor.alive) {
      damageActor(ct.actor, actor.damage, to, false);
    } else {
      applyPlayerDamage(actor.damage);
    }
  } else if (G.sound.bulletWhiz) {
    const rightX = Math.cos(player.yaw), rightZ = -Math.sin(player.yaw);
    const dx = from.x - tx, dz = from.z - tz;
    const len = Math.max(0.01, Math.hypot(dx, dz));
    const pan = clamp((dx / len) * rightX + (dz / len) * rightZ, -1, 1);
    G.sound.bulletWhiz(pan);
  }
}

/* ============================================================
   Player Combat (ADS Spread Reduction, Dynamic Muzzle Light)
   ============================================================ */
function getShootTargets() {
  return city.rayMeshes.concat(carHitMeshes, charTargets);
}

function tryShoot() {
  if (G.mode !== 'playing') return;
  const canShootInVehicle = !!activeVehicle && (player.aiming || pointer.aiming || gamepadState.aim);
  if (activeVehicle && !canShootInVehicle) return;
  if (state.reloading) return;
  const w = WEAPONS[state.weapon];
  if (state.fireTimer > 0) return;
  if (state.ammo[state.weapon] <= 0) {
    startReload();
    return;
  }
  state.ammo[state.weapon]--;
  state.fireTimer = w.rate;
  state.muzzleTimer = 0.055;

  /* Crouch and ADS significantly tighten spread and recoil */
  const adsMult = lerp(1.0, 0.35, player.adsBlend);
  const crouchMult = player.crouching ? 0.65 : 1.0;
  const effRecoil = w.recoil * adsMult * crouchMult;
  const effSpread = w.spread * adsMult * crouchMult;

  state.recoilPitch += effRecoil + rand(0, 0.004);
  state.recoilYaw += rand(-0.004, 0.004) * adsMult;
  player.recoilPitch += effRecoil * 0.82;
  player.recoilYaw += rand(-0.003, 0.003) * adsMult;
  player.shake = Math.max(player.shake, 0.11 * adsMult);

  G.sound.shoot(w.sound);
  triggerGamepadRumble(state.weapon === 1 ? 0.38 : 0.25, 70);
  updateHUD();

  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += rand(-1, 1) * effSpread;
  dir.y += rand(-1, 1) * effSpread;
  dir.z += rand(-1, 1) * effSpread;
  dir.normalize();
  raycaster.set(origin, dir);
  raycaster.far = w.range;
  const hits = raycaster.intersectObjects(getShootTargets(), false);
  let end = origin.clone().addScaledVector(dir, w.range);
  if (hits.length) {
    const h = hits[0];
    end = h.point.clone();
    if (h.object.userData.actor) {
      const actor = h.object.userData.actor;
      const head = h.object.userData.part === 'head';
      damageActor(actor, w.damage * (head ? 2.3 : 1), h.point, head);
    } else if (h.object.userData.car) {
      const hitCar = h.object.userData.car;
      spawnParticles(h.point.x, h.point.y, h.point.z, 0xffcf7a, 5, 3, 0.25, 8);
      addImpactFlash(h.point, 0xffb13b, 0.5);
      G.sound.impact();
      if (hitCar.isEventCar && randomEvent.active) {
        hitCar.eventHp = (hitCar.eventHp || 80) - w.damage;
        showHitmarker(hitCar.eventHp <= 0);
        spawnParticles(h.point.x, h.point.y + 0.3, h.point.z, 0x6ee7a8, 7, 4, 0.35, 6);
        if (hitCar.eventHp <= 0) {
          completeRandomEvent('VEHICLE DISABLED');
        }
      }
    } else {
      spawnParticles(h.point.x, h.point.y, h.point.z, 0xffd08a, 6, 3.5, 0.28, 10);
      addImpactFlash(h.point, 0xffb13b, 0.55);
      G.sound.impact();
    }
  }

  let muzzle;
  if (player.cameraMode === '3p' && playerRig) {
    muzzle = new THREE.Vector3();
    playerRig.gunGroup.getWorldPosition(muzzle);
  } else {
    const mx = lerp(0.23, 0.0, player.adsBlend);
    muzzle = camera.localToWorld(new THREE.Vector3(mx, -0.15, -0.85));
  }
  addTracer(muzzle, end, 0xffd08a, 0.85);
  combatFlashLight.position.copy(muzzle);
  combatFlashLight.intensity = 22;

  if (KC.multiplayer) KC.multiplayer.broadcastShot(muzzle, end, 0xffd08a);

  scarePeds(player.pos.x, player.pos.z, 24);
  if (state.wanted === 0 && cops.some((c) => c.alive && dist2(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z) < 30)) {
    addWanted(1, 'POLICE WITNESSED GUNFIRE');
  }
}

function damageActor(actor, amount, point, headshot = false) {
  if (!actor.alive) return;
  actor.hp -= amount;
  spawnParticles(point.x, point.y, point.z, 0xa80f22, headshot ? 10 : 6, 3.5, 0.45, 11);
  addImpactFlash(point, 0xb3122b, 0.35);
  showHitmarker(false);
  G.sound.hitmark(false);
  actor.scared = 8;
  actor.fleeX = player.pos.x;
  actor.fleeZ = player.pos.z;
  if (actor.hp <= 0) killActor(actor, 'shot');
}

function killActor(actor, cause = 'shot') {
  if (!actor.alive) return;
  actor.alive = false;
  removeCharacterTargets(actor);
  const p = actor.group.position;
  spawnParticles(p.x, 1.2, p.z, 0xa80f22, 16, 5, 0.6, 12);
  addShockwave(p.x, p.z, 0xb3122b, 2.2);
  showHitmarker(true);
  G.sound.hitmark(true);
  state.kills++;

  if (actor.type === 'ped') {
    addWanted(1, 'CIVILIAN KILLED');
    notify('CIVILIAN', 'CIVILIAN DOWN', 'danger');
    G.sound.scream();
    scarePeds(p.x, p.z, 30);
    if (activeVehicle && Math.abs(activeVehicle.speed) > 4) addWanted(1, 'HIT AND RUN');
  } else if (actor.type === 'cop') {
    addWanted(1, 'OFFICER DOWN');
    notify('POLICE', 'OFFICER DOWN', 'danger');
    G.sound.wanted();
    spawnWorldPickup(p.x, p.z, 'armor');
  } else if (actor.type === 'thug') {
    state.cash += 60;
    notify('CASH', 'VIPER DOWN  +$60', 'money');
    G.sound.money();
    spawnWorldPickup(p.x, p.z, Math.random() < 0.65 ? 'cash' : 'armor');
    if (state.contract.stage === 'fight' && !actor.isEventActor) {
      state.contract.remaining = Math.max(0, state.contract.remaining - 1);
      updateObjective();
      if (state.contract.remaining <= 0) completeContract();
    }
    if (actor.isEventActor && randomEvent.active) {
      const aliveLeft = randomEvent.actors.filter((a) => a.alive).length;
      if (aliveLeft <= 0) {
        completeRandomEvent('HOSTILES CLEARED');
      } else {
        updateRandomEventHUD();
      }
    }
  }

  actor.group.rotation.z = Math.PI / 2;
  actor.group.position.y = 0.28;
  actor.group.position.x += rand(-0.3, 0.3);
  actor.group.position.z += rand(-0.3, 0.3);
  corpses.push({ group: actor.group, t: 8 });
  updateHUD();
}

function updateCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.t -= dt;
    if (c.t < 1) c.group.position.y -= dt * 0.15;
    if (c.t <= 0) {
      scene.remove(c.group);
      corpses.splice(i, 1);
    }
  }
}

/* ============================================================
   3D Spinning World Pickups (Cash Bundles, Armor Vests & Health)
   ============================================================ */
const worldPickups = [];

function spawnWorldPickup(x, z, kind = 'cash', permanent = false) {
  const g = new THREE.Group();
  const isCash = kind === 'cash';
  const colorHex = isCash ? 0x6ee7a8 : 0x65b8ff;
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.65, side: THREE.DoubleSide, toneMapped: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 14), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);

  const itemGroup = new THREE.Group();
  itemGroup.position.y = 0.48;
  if (isCash) {
    const billMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.6, emissive: 0x164a2c, emissiveIntensity: 0.35 });
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xffd26a, toneMapped: false });
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.26), billMat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.19, 0.27), bandMat);
    itemGroup.add(stack, band);
  } else {
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.45, metalness: 0.35, emissive: 0x153e6b, emissiveIntensity: 0.35 });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x57e6c2, toneMapped: false });
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.22), vestMat);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), crossMat);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.24), crossMat);
    itemGroup.add(vest, crossH, crossV);
  }
  g.add(itemGroup);
  g.position.set(x, 0.14, z);
  scene.add(g);

  const pickup = { group: g, itemGroup, ring, x, z, kind, timer: permanent ? 9999 : 35, phase: rand(0, 6.28) };
  worldPickups.push(pickup);
  return pickup;
}

function clearWorldPickups() {
  for (const p of worldPickups) scene.remove(p.group);
  worldPickups.length = 0;
}

function spawnCityPickups() {
  clearWorldPickups();
  const spots = [
    { x: 0, z: 4, kind: 'cash' },
    { x: -12, z: 18, kind: 'armor' },
    { x: 18, z: 12, kind: 'cash' },
    { x: 40, z: 32, kind: 'cash' },
    { x: -34, z: 62, kind: 'armor' },
    { x: 92, z: 58, kind: 'cash' },
    { x: 128, z: -18, kind: 'armor' },
    { x: -8, z: -56, kind: 'cash' },
    { x: 48, z: 92, kind: 'armor' },
    { x: -88, z: -20, kind: 'cash' }
  ];
  for (const s of spots) {
    if (!collidesCircle(s.x, s.z, 0.4)) spawnWorldPickup(s.x, s.z, s.kind, true);
  }
}

function updateWorldPickups(dt) {
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;

  for (let i = worldPickups.length - 1; i >= 0; i--) {
    const p = worldPickups[i];
    p.timer -= dt;
    if (p.timer <= 0) {
      scene.remove(p.group);
      worldPickups.splice(i, 1);
      continue;
    }
    const d = dist2(p.x, p.z, px, pz);
    p.group.visible = d < 120;
    if (!p.group.visible) continue;

    p.phase += dt * 3.2;
    p.itemGroup.rotation.y = p.phase;
    p.itemGroup.position.y = 0.46 + Math.sin(p.phase * 1.4) * 0.09;

    /* Magnetic pull when within 3.6m */
    if (d < 3.6 && d > 0.1) {
      p.x = lerp(p.x, px, dt * 9);
      p.z = lerp(p.z, pz, dt * 9);
      p.group.position.set(p.x, 0.14, p.z);
    }
    if (d < 1.45) {
      if (p.kind === 'cash') {
        const amt = 85;
        state.cash += amt;
        notify('PICKUP', 'STREET STASH  +$' + amt, 'money');
        G.sound.money();
        spawnParticles(p.x, 0.8, p.z, 0x6ee7a8, 12, 3.5, 0.45, 4);
      } else {
        state.armor = Math.min(100, state.armor + 30);
        state.health = Math.min(100, state.health + 20);
        notify('PICKUP', 'TACTICAL VEST & MEDKIT (+30 ARMOR)', '');
        G.sound.ui();
        spawnParticles(p.x, 0.8, p.z, 0x65b8ff, 12, 3.5, 0.45, 4);
      }
      scene.remove(p.group);
      worldPickups.splice(i, 1);
      updateHUD();
    }
  }
}

function findNearestVendorCart() {
  if (activeVehicle || !city || !city.vendorCarts) return null;
  let best = null, bestD = 3.6;
  for (const c of city.vendorCarts) {
    const d = dist2(player.pos.x, player.pos.z, c.x, c.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function findNearestShop() {
  if (activeVehicle || !city || !city.shops) return null;
  let best = null, bestD = 4.0;
  for (const s of city.shops) {
    const d = dist2(player.pos.x, player.pos.z, s.x, s.z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function buyShop(shop) {
  if (!shop) return;
  if (shop.type === 'gun') {
    if (state.cash < 400) { notify('SHOP', 'NEED $400 FOR NEW WEAPON', 'danger'); return; }
    state.cash -= 400;
    /* Unlock/upgrade: give carbine if not owned, else ammo */
    if (state.weapon !== 1) { state.weapon = 1; notify('SHOP', 'CARBINE ACQUIRED', 'money'); }
    else { state.ammo[1] = WEAPONS[1].mag; notify('SHOP', 'CARBINE RESTOCKED', 'money'); }
    state.ammo[state.weapon] = WEAPONS[state.weapon].mag;
    G.sound.money();
  } else if (shop.type === 'armor') {
    if (state.cash < 150) { notify('SHOP', 'NEED $150 FOR ARMOR', 'danger'); return; }
    state.cash -= 150;
    state.armor = 100;
    notify('SHOP', 'ARMOR REFILLED TO 100', 'money');
    G.sound.money();
  } else if (shop.type === 'ammo') {
    if (state.cash < 60) { notify('SHOP', 'NEED $60 FOR AMMO', 'danger'); return; }
    state.cash -= 60;
    state.ammo[0] = WEAPONS[0].mag;
    state.ammo[1] = WEAPONS[1].mag;
    notify('SHOP', 'ALL AMMO RESTOCKED', 'money');
    G.sound.money();
  }
  updateHUD();
}

function buyVendorBoost(cart) {
  if (!cart) return;
  if (state.cash < 25) {
    notify('VENDOR', 'NEED $25 FOR KC STREET BOOST', 'danger');
    return;
  }
  state.cash -= 25;
  state.health = Math.min(100, state.health + 40);
  state.armor = Math.min(100, state.armor + 25);
  state.streetBoostTimer = 15.0;
  G.sound.money();
  spawnParticles(player.pos.x, 1.2, player.pos.z, 0xffb13b, 16, 4.0, 0.55, 3);
  notify('KC BOOST', cart.name.replace(' $25', '') + ' // +40 HP & SPEED BOOST!', 'money');
  updateHUD();
}

function applyPlayerDamage(amount) {
  if (G.mode !== 'playing') return;
  state.damageTimer = 0;
  state.damageFlash = 1;
  player.shake = Math.max(player.shake, 0.75);
  G.sound.hurt();
  triggerGamepadRumble(0.65, 160);
  $('damage-flash').style.opacity = '1';
  if (state.armor > 0) {
    const absorbed = Math.min(state.armor, amount);
    state.armor -= absorbed;
    amount -= absorbed;
  }
  if (amount > 0) state.health -= amount;
  updateHUD();
  if (state.health <= 0) die();
}

function startReload() {
  if (activeVehicle || state.reloading) return;
  const w = WEAPONS[state.weapon];
  if (state.ammo[state.weapon] >= w.mag) return;
  state.reloading = true;
  state.reloadTimer = w.reload;
  state.reloadClick = false;
  G.sound.reload(0);
  updateHUD();
}

function switchWeapon(index) {
  if (activeVehicle || index === state.weapon || index < 0 || index > 1) return;
  state.weapon = index;
  state.reloading = false;
  state.fireTimer = 0.18;
  G.sound.ui();
  updateHUD();
  updateWeaponView(0);
}

function cycleZoom(dir = 1) {
  player.zoomIndex = (player.zoomIndex + dir + ZOOM_LEVELS.length) % ZOOM_LEVELS.length;
  G.sound.zoom();
  updateHUD();
}

function toggleCameraMode() {
  player.cameraMode = player.cameraMode === '1p' ? '3p' : '1p';
  player.carLookYaw = 0;
  player.carLookPitch = 0;
  G.sound.ui();
  notify('CAMERA', player.cameraMode === '3p' ? '3RD PERSON VIEW [V]' : '1ST PERSON VIEW [V]');
  updateHUD();
}

function toggleCrouch() {
  if (activeVehicle || G.mode !== 'playing') return;
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const sprinting = keys.ShiftLeft || keys.ShiftRight || gamepadState.sprint;
  if (!player.crouching && sprinting && speed > 5.4 && player.onGround) {
    /* Tactical Slide! */
    player.crouching = true;
    player.slideTimer = 0.62;
    player.slideDir.set(player.vel.x, 0, player.vel.z).normalize();
    G.sound.slide();
  } else {
    player.crouching = !player.crouching;
    player.slideTimer = 0;
    G.sound.crouch(player.crouching);
  }
  updateHUD();
}

function updateWeaponState(dt) {
  state.fireTimer = Math.max(0, state.fireTimer - dt);
  state.muzzleTimer = Math.max(0, (state.muzzleTimer || 0) - dt);
  if (state.reloading) {
    state.reloadTimer -= dt;
    if (!state.reloadClick && state.reloadTimer < WEAPONS[state.weapon].reload * 0.5) {
      state.reloadClick = true;
      G.sound.reload(1);
    }
    if (state.reloadTimer <= 0) {
      state.reloading = false;
      state.ammo[state.weapon] = WEAPONS[state.weapon].mag;
      G.sound.reload(2);
      updateHUD();
    }
  }
  const canShootInVehicle = !!activeVehicle && (player.aiming || pointer.aiming || gamepadState.aim);
  if ((pointer.firing || gamepadState.fire) && G.mode === 'playing' && (!activeVehicle || canShootInVehicle)) {
    tryShoot();
  }
}

function showHitmarker(kill) {
  const el = $('hitmarker');
  el.classList.remove('active', 'kill');
  void el.offsetWidth;
  if (kill) el.classList.add('kill');
  el.classList.add('active');
}

/* ============================================================
   Enter / Exit & Drive Vehicles (With Car-vs-Car & Wall Sliding)
   ============================================================ */
function findNearestVehicle() {
  if (activeVehicle) return null;
  let best = null, bestD = 7.5;
  const all = cars.concat(helis, planes, boats);
  for (const v of all) {
    const d = dist2(player.pos.x, player.pos.z, v.x, v.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
function findNearestCar() { return findNearestVehicle(); }

function enterCar(car) {
  if (!car || activeVehicle || G.mode !== 'playing') return;
  const isCar = (car.type === 'car' || !car.type);
  if (isCar && car.kind === 'traffic') {
    car.kind = 'stolen';
    car.trafficSpeed = 0;
    addWanted(1, 'GRAND THEFT AUTO');
    notify('VEHICLE', 'VEHICLE STOLEN', 'danger');
    const d = makePerson({ type: 'ped' });
    d.group.position.set(car.x + 2.4, 0.14, car.z);
    d.group.rotation.y = car.heading + Math.PI / 2;
    scene.add(d.group);
    const runner = {
      type: 'ped', kind: 'ped', alive: true, hp: 30, model: d, group: d.group,
      axis: 'v', line: 0, side: 1, dir: 1, heading: 0, speed: 4.4,
      scared: 8, fleeX: car.x, fleeZ: car.z, turnCooldown: 0, phase: 0
    };
    addCharacterTargets(runner);
    peds.push(runner);
  }
  if (isCar && car.isPolice) addWanted(1, 'POLICE CRUISER STOLEN');
  if (car.isEventCar && randomEvent.active) {
    car.isEventCar = false;
    completeRandomEvent('VEHICLE HIJACKED');
  }
  activeVehicle = car;
  car.controlled = true;
  car.group.visible = player.cameraMode === '3p';
  if (playerRig) playerRig.group.visible = false;
  car.speed = 0;
  if (car.type === 'heli' || car.type === 'plane' || car.type === 'boat') {
    carCockpitRoot.visible = false;
    G.sound.enterCar();
    G.sound.startEngine();
    carLight.intensity = 0;
    updateHUD();
    notify('VEHICLE', car.type === 'heli' ? 'HELICOPTER ACQUIRED' : car.type === 'plane' ? 'AIRCRAFT ACQUIRED' : 'BOAT ACQUIRED', '');
    return;
  }
  state.firing = false;
  pointer.firing = false;
  player.aiming = false;
  player.crouching = false;
  state.reloading = false;
  player.carLookYaw = 0;
  player.carLookPitch = 0;
  G.sound.enterCar();
  G.sound.startEngine();
  carLight.intensity = 85;
  carLight.distance = 68;
  syncCockpitDriverColors();
  drawCockpitCanvases(car);
  updateCarCockpitView(0);
  updateHUD();
  notify('VEHICLE', car.isPolice ? 'POLICE CRUISER ACQUIRED' : 'VEHICLE ACQUIRED', '');
}

function exitCar() {
  if (!activeVehicle) return;
  const car = activeVehicle;
  car.controlled = false;
  car.group.visible = true;
  car.speed = 0;
  carCockpitRoot.visible = false;
  const heading = car.heading;
  const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const candidates = [
    { x: car.x + side.x * 2.35, z: car.z + side.z * 2.35 },
    { x: car.x - side.x * 2.35, z: car.z - side.z * 2.35 },
    { x: car.x + Math.sin(heading) * 3.4, z: car.z + Math.cos(heading) * 3.4 }
  ];
  let chosen = candidates[0];
  for (const c of candidates) {
    if (!collidesCircle(c.x, c.z, 0.5, false, car)) { chosen = c; break; }
  }
  player.pos.set(chosen.x, 0, chosen.z);
  player.yaw = heading + player.carLookYaw;
  player.pitch = player.carLookPitch;
  player.carLookYaw = 0;
  player.carLookPitch = 0;
  activeVehicle = null;
  carLight.intensity = 0;
  G.sound.stopEngine();
  updateHUD();
  updateWeaponView(0);
}

/* ============================================================
   Extended Vehicle Physics: Helicopter, Plane, Boat
   ============================================================ */
function updateDrivenHeli(dt, v) {
  const throttle = Math.max(keys.KeyW ? 1 : 0, gamepadState.throttle);
  const brake = Math.max(keys.KeyS ? 1 : 0, gamepadState.brake);
  const yawInput = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + gamepadState.steer;
  const upInput = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  v.rotorPhase += dt * (4 + Math.abs(v.speed) * 0.4);
  if (v.model.rotorHub) v.model.rotorHub.rotation.y = v.rotorPhase;
  if (v.model.tailRotor) v.model.tailRotor.rotation.x = v.rotorPhase * 1.3;
  if (throttle) v.verticalSpeed += 6 * dt;
  if (brake) v.verticalSpeed -= 6 * dt;
  v.verticalSpeed = clamp(v.verticalSpeed, -6, 8);
  v.verticalSpeed *= 1 - 0.6 * dt;
  v.y += v.verticalSpeed * dt;
  if (v.y < 0.6) { v.y = 0.6; v.verticalSpeed = 0; }
  if (v.y > 180) { v.y = 180; v.verticalSpeed = 0; }
  v.heading += yawInput * dt * 1.6;
  const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
  if (upInput !== 0) v.speed += upInput * 14 * dt;
  v.speed *= 1 - 1.4 * dt;
  v.speed = clamp(v.speed, -8, v.maxSpeed);
  const nx = v.x + fx * v.speed * dt;
  const nz = v.z + fz * v.speed * dt;
  if (Math.abs(nx) < KC.WORLD_LIMIT && Math.abs(nz) < KC.WORLD_LIMIT) { v.x = nx; v.z = nz; }
  else v.speed *= -0.3;
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.set(v.pitch, v.heading, v.roll);
  v.pitch = lerp(v.pitch, clamp(-v.speed * 0.012, -0.25, 0.25), 1 - Math.exp(-dt * 3));
  v.roll = lerp(v.roll, clamp(-yawInput * 0.18, -0.35, 0.35), 1 - Math.exp(-dt * 4));
  player.pos.set(v.x, v.y - 0.6, v.z);
  G.sound.updateEngine(Math.abs(v.speed) + Math.abs(v.verticalSpeed) * 0.5, throttle);
}
function updateDrivenPlane(dt, v) {
  const throttle = Math.max(keys.KeyW ? 1 : 0, gamepadState.throttle);
  const brake = Math.max(keys.KeyS ? 1 : 0, gamepadState.brake);
  const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + gamepadState.steer;
  const pitchInput = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if (throttle) v.speed += 14 * dt;
  if (brake) v.speed -= 22 * dt;
  if (!throttle && !brake) v.speed *= 1 - 0.8 * dt;
  v.speed = clamp(v.speed, 0, v.maxSpeed);
  if (v.speed < 6) v.speed = Math.max(0, v.speed - 4 * dt);
  v.heading += steer * dt * 1.2 * clamp(v.speed / 12, 0.2, 1);
  v.pitch = lerp(v.pitch, clamp(pitchInput * 0.35 + (v.speed < 12 ? -0.08 : 0), -0.45, 0.45), 1 - Math.exp(-dt * 3));
  v.roll = lerp(v.roll, clamp(-steer * 0.45, -0.6, 0.6), 1 - Math.exp(-dt * 4));
  const fx = -Math.sin(v.heading) * Math.cos(v.pitch);
  const fy = Math.sin(v.pitch);
  const fz = -Math.cos(v.heading) * Math.cos(v.pitch);
  v.x += fx * v.speed * dt;
  v.y += fy * v.speed * dt;
  v.z += fz * v.speed * dt;
  v.y = clamp(v.y, 1.5, 140);
  if (Math.abs(v.x) > KC.WORLD_LIMIT || Math.abs(v.z) > KC.WORLD_LIMIT) { v.speed *= 0.4; }
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.set(v.pitch, v.heading, v.roll);
  if (v.model.prop) v.model.prop.rotation.x += v.speed * dt * 18;
  player.pos.set(v.x, v.y - 0.6, v.z);
  G.sound.updateEngine(v.speed, throttle);
  if (v.y <= 1.6 && v.speed > 14) { v.speed *= 0.2; player.shake = Math.max(player.shake, 0.8); G.sound.crash(0.8); }
}
function updateDrivenBoat(dt, v) {
  const throttle = Math.max(keys.KeyW ? 1 : 0, gamepadState.throttle);
  const brake = Math.max(keys.KeyS ? 1 : 0, gamepadState.brake);
  const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + gamepadState.steer;
  if (throttle) v.speed += 5 * dt;
  if (brake) v.speed -= 8 * dt;
  if (!throttle && !brake) v.speed *= 1 - 1.6 * dt;
  v.speed = clamp(v.speed, -4, v.maxSpeed);
  if (Math.abs(v.speed) > 0.4) v.heading += steer * dt * 1.2 * Math.sign(v.speed);
  const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
  const nx = v.x + fx * v.speed * dt;
  const nz = v.z + fz * v.speed * dt;
  if (Math.abs(nx) < KC.WORLD_LIMIT && Math.abs(nz) < KC.WORLD_LIMIT) { v.x = nx; v.z = nz; }
  else v.speed *= -0.3;
  /* buoyancy: snap to water level */
  const waterLevel = -0.25;
  v.y = lerp(v.y, waterLevel + Math.sin(gameTime * 1.4 + v.x * 0.1) * 0.12, 1 - Math.exp(-dt * 3));
  v.roll = lerp(v.roll, steer * 0.06 * (v.speed / v.maxSpeed), 1 - Math.exp(-dt * 3));
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.set(v.pitch, v.heading, v.roll);
  player.pos.set(v.x, v.y + 1.2, v.z);
  G.sound.updateEngine(Math.abs(v.speed), throttle);
}
function updateDrivenCar(dt) {
  if (!activeVehicle) return;
  const v = activeVehicle;
  if (v.type === 'heli') { updateDrivenHeli(dt, v); return; }
  if (v.type === 'plane') { updateDrivenPlane(dt, v); return; }
  if (v.type === 'boat') { updateDrivenBoat(dt, v); return; }
  const car = activeVehicle;
  const throttle = Math.max(keys.KeyW ? 1 : 0, gamepadState.throttle);
  const brake = Math.max(keys.KeyS ? 1 : 0, gamepadState.brake);
  const kbSteer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const steer = clamp(kbSteer + gamepadState.steer, -1, 1);
  const handbrake = (keys.Space || gamepadState.jump) ? 1 : 0;
  const boosting = (keys.ShiftLeft || keys.ShiftRight || gamepadState.sprint) && throttle > 0.1;

  const accel = boosting ? 20.5 : 14.0;
  const topSpeed = car.maxSpeed * (boosting ? 1.26 : 1.0);
  if (throttle > 0.05) car.speed += accel * throttle * dt;
  if (brake > 0.05) {
    if (car.speed > 0.5) car.speed -= 24 * brake * dt;
    else car.speed -= 8.5 * brake * dt;
  }
  if (throttle <= 0.05 && brake <= 0.05) car.speed *= 1 - 2.4 * dt;
  if (handbrake) car.speed *= 1 - 3.8 * dt;
  car.speed = clamp(car.speed, -10, topSpeed);
  if (Math.abs(car.speed) < 0.05) car.speed = 0;

  if (boosting && car.speed > 8 && Math.random() < dt * 20) {
    const bx = car.x + Math.sin(car.heading) * 2.15;
    const bz = car.z + Math.cos(car.heading) * 2.15;
    spawnParticles(bx, 0.42, bz, 0xff8a1f, 2, 3.2, 0.18, 2);
  }

  if (Math.abs(steer) > 0.02 && Math.abs(car.speed) > 0.4) {
    const grip = handbrake ? 1.65 : 1.05;
    car.heading += steer * dt * 1.6 * grip * clamp(Math.abs(car.speed) / 9, 0.25, 1) * Math.sign(car.speed);
  }

  /* Destructible street furniture checks */
  checkDestructiblePropHit(car);

  const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
  const desiredX = car.x + fx * car.speed * dt;
  const desiredZ = car.z + fz * car.speed * dt;

  /* Two-circle capsule approximation for car OBB vs world & other cars */
  const frontX = desiredX + fx * 0.95, frontZ = desiredZ + fz * 0.95;
  const rearX = desiredX - fx * 0.95, rearZ = desiredZ - fz * 0.95;

  /* Check car-vs-car physical collision */
  let hitOtherCar = null;
  for (let i = 0; i < cars.length; i++) {
    const other = cars[i];
    if (other === car) continue;
    const hitF = resolveCircleAgainstCar(frontX, frontZ, 1.05, other);
    const hitR = hitF || resolveCircleAgainstCar(rearX, rearZ, 1.05, other);
    if (hitR) {
      hitOtherCar = { car: other, res: hitR };
      break;
    }
  }

  if (hitOtherCar) {
    const other = hitOtherCar.car;
    const impactSpeed = Math.abs(car.speed);
    /* Push the other car and deflect our car */
    other.x -= hitOtherCar.res.nx * clamp(impactSpeed * 0.06, 0.15, 0.9);
    other.z -= hitOtherCar.res.nz * clamp(impactSpeed * 0.06, 0.15, 0.9);
    const resolvedOther = resolveCircleWorld(other.x, other.z, 1.15, false, other);
    other.x = resolvedOther.x;
    other.z = resolvedOther.z;
    other.group.position.set(other.x, 0.03, other.z);

    car.x += hitOtherCar.res.nx * 0.18;
    car.z += hitOtherCar.res.nz * 0.18;
    if (impactSpeed > 5) {
      player.shake = Math.max(player.shake, clamp(impactSpeed / 22, 0.25, 0.75));
      G.sound.crash(impactSpeed / 18);
      triggerGamepadRumble(0.7, 180);
      spawnParticles((car.x + other.x) * 0.5, 0.9, (car.z + other.z) * 0.5, 0xffcf7a, 10, 4.5, 0.35, 9);
    }
    car.speed *= -0.25;
  } else {
    /* World building/tree collision with smooth wall sliding */
    const resCenter = resolveCircleWorld(desiredX, desiredZ, 1.22, false, car);
    const resFront = resolveCircleWorld(frontX, frontZ, 1.02, false, car);
    if (!resCenter.didHit && !resFront.didHit) {
      car.x = desiredX;
      car.z = desiredZ;
    } else {
      const nx = resFront.didHit ? resFront.hitNormalX : resCenter.hitNormalX;
      const nz = resFront.didHit ? resFront.hitNormalZ : resCenter.hitNormalZ;
      /* Slide along wall tangent */
      const dot = fx * nx + fz * nz;
      car.x = resCenter.x;
      car.z = resCenter.z;
      if (Math.abs(car.speed) > 7 && Math.abs(dot) > 0.45) {
        player.shake = Math.max(player.shake, 0.55);
        G.sound.crash(Math.abs(car.speed) / 20);
        triggerGamepadRumble(0.65, 160);
        spawnParticles(car.x + fx * 1.4, 0.9, car.z + fz * 1.4, 0xffcf7a, 9, 4, 0.3, 9);
      }
      if (Math.abs(dot) > 0.72) {
        car.speed *= -0.2;
      } else {
        car.speed *= 0.78;
        car.heading += (fx * nz - fz * nx) * 0.12;
      }
    }
  }

  const lim = KC.WORLD_LIMIT - 3;
  car.x = clamp(car.x, -lim, lim);
  car.z = clamp(car.z, -lim, lim);
  car.group.position.set(car.x, 0.03, car.z);
  car.group.rotation.y = car.heading;
  /* Ensure car mesh is visible in 3P driving and hidden in 1P cockpit view */
  car.group.visible = player.cameraMode === '3p';

  for (let wi = 0; wi < car.model.wheels.length; wi++) {
    const w = car.model.wheels[wi];
    w.rotation.x += car.speed * dt * 2.5;
    if (wi < 2) w.rotation.y = steer * 0.35;
  }

  player.pos.set(car.x, 0, car.z);
  G.sound.updateEngine(car.speed, throttle, boosting, !!handbrake, steer);

  if (Math.abs(car.speed) > 4.2) {
    for (const p of peds) {
      if (p.alive && dist2(car.x, car.z, p.group.position.x, p.group.position.z) < 1.95) killActor(p, 'car');
    }
    for (const c of cops) {
      if (c.alive && dist2(car.x, car.z, c.group.position.x, c.group.position.z) < 1.95) killActor(c, 'car');
    }
    for (const t of thugs) {
      if (t.alive && dist2(car.x, car.z, t.group.position.x, t.group.position.z) < 1.95) killActor(t, 'car');
    }
  }
  if (keys.KeyH || gamepadState.horn) {
    if (!state.hornTimer || state.hornTimer <= 0) {
      G.sound.horn();
      state.hornTimer = 0.8;
    }
  }
  state.hornTimer = Math.max(0, (state.hornTimer || 0) - dt);
}

/* ============================================================
   Contracts & Wanted Level
   ============================================================ */
const CONTRACT_LOCATIONS = [
  'Kauffman Center', 'Union Station', 'Liberty Memorial', 'River Market',
  '18th & Vine', 'Westport', 'Crown Center', 'T-Mobile Center', 'Power & Light',
  'Bartle Hall', 'Berkley Riverfront', 'West Bottoms', 'Country Club Plaza',
  'East Crossroads', 'Columbus Park'
];

function removeContractMarker() {
  if (contractMarker) {
    scene.remove(contractMarker);
    contractMarker = null;
  }
  state.contract.marker = null;
}

function createContractMarker(name) {
  removeContractMarker();
  const lm = city.landmarks[name];
  if (!lm) return;
  const m = lm.marker;
  const group = new THREE.Group();
  group.position.set(m.x, 0.22, m.z);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffb13b, transparent: true, opacity: 0.11, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 25, 12, 1, true), beamMat);
  beam.position.y = 12.5;
  group.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffb13b, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 2.15, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshBasicMaterial({ color: 0xffc45c, toneMapped: false })
  );
  diamond.position.y = 2.9;
  group.add(diamond);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: city.glowTex, color: 0xffb13b, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  glow.position.y = 2.9;
  glow.scale.set(6, 6, 1);
  group.add(glow);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(15, 15),
    new THREE.MeshBasicMaterial({
      map: city.poolTex, color: 0xffb13b, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.025;
  group.add(pool);
  group.userData.parts = { beam, beamMat, ring, ringMat, diamond, glow };
  scene.add(group);
  contractMarker = group;
  state.contract.marker = { x: m.x, z: m.z };
}

function startTravel(name) {
  removeContractMarker();
  state.contract.stage = 'travel';
  state.contract.location = name;
  state.contract.remaining = 0;
  state.contract.total = 0;
  createContractMarker(name);
  updateObjective();
}

function startFight() {
  if (state.contract.stage !== 'travel' || !state.contract.marker) return;
  const marker = state.contract.marker;
  state.contract.stage = 'fight';
  state.contract.total = Math.min(3 + Math.floor((state.contract.number - 1) / 2), 6);
  state.contract.remaining = state.contract.total;
  removeContractMarker();
  spawnThugs(state.contract.total, marker.x, marker.z);
  showBanner('CONTRACT ACTIVE', 'ELIMINATE THE VIPERS');
  notify('CONTRACT', 'VIPERS SPOTTED // ' + state.contract.location.toUpperCase(), 'danger');
  G.sound.wanted();
  updateObjective();
}

function completeContract() {
  if (state.contract.stage !== 'fight') return;
  state.contract.stage = 'cooldown';
  state.contract.cooldown = 7;
  state.cash += state.contract.reward;
  state.contracts++;
  state.health = Math.min(100, state.health + 25);
  state.armor = Math.min(100, state.armor + 25);
  showBanner('CONTRACT COMPLETE', '+$' + state.contract.reward.toLocaleString('en-US'));
  notify('PAYOUT', 'CONTRACT COMPLETE  +$' + state.contract.reward.toLocaleString('en-US'), 'money');
  G.sound.missionComplete();
  G.sound.money();
  spawnParticles(player.pos.x, 1.4, player.pos.z, 0x6ee7a8, 24, 4, 1.2, 3);
  updateObjective();
  updateHUD();
}

function nextContract() {
  const choices = CONTRACT_LOCATIONS.filter((n) => n !== state.contract.location && city.landmarks[n]);
  const next = choices.length ? KC.pick(choices) : 'Kauffman Center';
  state.contract.number++;
  state.contract.reward = 1200 + (state.contract.number - 1) * 600;
  startTravel(next);
  showBanner('NEW CONTRACT', next.toUpperCase());
  notify('CONTRACT', 'MEET THE CONTACT // ' + next.toUpperCase());
}

function updateContract(dt) {
  if (state.contract.stage === 'cooldown') {
    state.contract.cooldown -= dt;
    if (state.contract.cooldown <= 0) nextContract();
  }
  if (contractMarker) {
    const parts = contractMarker.userData.parts;
    const t = gameTime;
    parts.diamond.rotation.y += dt * 1.8;
    parts.diamond.position.y = 2.9 + Math.sin(t * 2.1) * 0.18;
    parts.glow.material.opacity = 0.4 + Math.sin(t * 2.6) * 0.12;
    const s = 1 + Math.sin(t * 2.4) * 0.09;
    parts.ring.scale.set(s, s, s);
    parts.ringMat.opacity = 0.55 + Math.sin(t * 2.4) * 0.18;
    parts.beamMat.opacity = 0.08 + Math.sin(t * 1.7) * 0.025;
  }
}

function contractDistance() {
  if (!state.contract.marker) return 0;
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  return dist2(px, pz, state.contract.marker.x, state.contract.marker.z);
}

function updateObjective() {
  const title = $('objective-title');
  const sub = $('objective-sub');
  if (!title || !sub) return;
  if (state.contract.stage === 'travel') {
    const d = Math.round(contractDistance());
    title.textContent = 'MEET THE CONTACT';
    sub.innerHTML = state.contract.location.toUpperCase() + ' <span class="objective-dist" id="objective-dist">' + d + ' m</span>';
  } else if (state.contract.stage === 'fight') {
    title.textContent = 'ELIMINATE THE VIPERS';
    sub.innerHTML = state.contract.remaining + ' HOSTILES REMAIN';
  } else {
    title.textContent = 'CONTRACT COMPLETE';
    sub.textContent = 'PAYOUT SECURED // NEW CONTRACT INBOUND';
  }
}

function updateObjectiveDistance() {
  if (state.contract.stage !== 'travel') return;
  const el = $('objective-dist');
  if (el) el.textContent = Math.round(contractDistance()) + ' m';
}

/* ============================================================
   Dynamic Random Events System (5 KC-Themed Street Events)
   ============================================================ */
const RANDOM_EVENT_DEFS = [
  {
    kind: 'ARMORED_TRUCK',
    title: 'COMMERCE BANK ARMORED CONVOY',
    sub: 'RAID ARMORED TRUCK OR CLEAR GUARDS',
    reward: 850,
    color: 0x57e6c2
  },
  {
    kind: 'TURF_WAR',
    title: 'CROSSROADS TURF SHOOTOUT',
    sub: 'CLEAR RIVAL CREWS & CLAIM STASH',
    reward: 800,
    color: 0xff5f8f
  },
  {
    kind: 'CITIZEN_RESCUE',
    title: 'STRANDED KC LOCAL AMBUSH',
    sub: 'RESCUE LOCAL FROM MUGGERS (-1 ★)',
    reward: 650,
    color: 0x65b8ff
  },
  {
    kind: 'SUPPLY_DROP',
    title: 'ROASTERIE AIR CARGO DROP',
    sub: 'SECURE FLARE CRATE OR CLEAR GUARDS',
    reward: 700,
    color: 0xffb13b
  },
  {
    kind: 'GETAWAY_CAR',
    title: 'STOLEN PLAZA MUSCLE GT',
    sub: 'HIJACK OR DISABLE FUGITIVE GT',
    reward: 950,
    color: 0xff5f8f
  }
];

const randomEvent = {
  active: false,
  kind: '',
  title: '',
  sub: '',
  reward: 0,
  color: 0xff5f8f,
  x: 0,
  z: 0,
  timer: 0,
  cooldown: 6.5,
  flareTimer: 0,
  group: null,
  actors: [],
  cars: [],
  citizens: [],
  lastIdx: -1
};

function randomEventDistance() {
  if (!randomEvent.active) return 0;
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  return dist2(px, pz, randomEvent.x, randomEvent.z);
}

function updateRandomEventHUD() {
  const card = $('event-card');
  if (!card) return;
  if (!randomEvent.active || G.mode !== 'playing') {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  const titleEl = $('event-title');
  const subEl = $('event-sub');
  if (titleEl) titleEl.textContent = randomEvent.title;
  if (subEl) {
    const d = Math.round(randomEventDistance());
    const aliveHostiles = randomEvent.actors.filter((a) => a.alive).length;
    const prefix = aliveHostiles > 0 ? (randomEvent.sub + ' (' + aliveHostiles + ' LEFT)') : randomEvent.sub;
    subEl.innerHTML = prefix + ' <span class="objective-dist event-dist" id="event-dist">' + d + ' m</span>';
  }
}

function clearRandomEvent(quiet = true) {
  if (randomEvent.group) {
    scene.remove(randomEvent.group);
    randomEvent.group = null;
  }
  for (const a of randomEvent.actors) {
    if (a.alive) {
      a.alive = false;
      removeCharacterTargets(a);
      scene.remove(a.group);
      const ti = thugs.indexOf(a);
      if (ti >= 0) thugs.splice(ti, 1);
    }
  }
  randomEvent.actors.length = 0;

  for (const c of randomEvent.citizens) {
    if (c.alive) {
      c.alive = false;
      removeCharacterTargets(c);
      scene.remove(c.group);
      const pi = peds.indexOf(c);
      if (pi >= 0) peds.splice(pi, 1);
    }
  }
  randomEvent.citizens.length = 0;

  for (const car of randomEvent.cars) {
    if (car === activeVehicle) {
      car.isEventCar = false;
      continue;
    }
    for (const m of car.hitMeshes || []) {
      const idx = carHitMeshes.indexOf(m);
      if (idx >= 0) carHitMeshes.splice(idx, 1);
    }
    scene.remove(car.group);
    const ci = cars.indexOf(car);
    if (ci >= 0) cars.splice(ci, 1);
  }
  randomEvent.cars.length = 0;

  const wasActive = randomEvent.active;
  randomEvent.active = false;
  updateRandomEventHUD();
  if (wasActive && !quiet) {
    notify('LIVE EVENT', 'EVENT EXPIRED // AREA CLEARED');
  }
}

function findRandomEventSpot() {
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  const yaw = activeVehicle ? activeVehicle.heading : player.yaw;
  const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);

  /* Prefer a road or sidewalk spot 34m-68m ahead of the player so it's immediately visible */
  for (let attempt = 0; attempt < 35; attempt++) {
    const spread = attempt < 15 ? rand(-1.0, 1.0) : rand(-Math.PI, Math.PI);
    const baseAng = Math.atan2(fwdZ, fwdX) + spread;
    const dist = rand(34, 68);
    let tx = clamp(px + Math.cos(baseAng) * dist, -KC.WORLD_LIMIT + 16, KC.WORLD_LIMIT - 16);
    let tz = clamp(pz + Math.sin(baseAng) * dist, -KC.WORLD_LIMIT + 16, KC.WORLD_LIMIT - 16);
    /* Snap to nearest road line so event never spawns inside a building */
    let bestLineX = KC.ROAD_LINES[0], bestDX = 999;
    let bestLineZ = KC.ROAD_LINES[0], bestDZ = 999;
    for (const rl of KC.ROAD_LINES) {
      if (Math.abs(tx - rl) < bestDX) { bestDX = Math.abs(tx - rl); bestLineX = rl; }
      if (Math.abs(tz - rl) < bestDZ) { bestDZ = Math.abs(tz - rl); bestLineZ = rl; }
    }
    if (bestDX < bestDZ) tx = bestLineX + (Math.random() < 0.5 ? 2.2 : -2.2);
    else tz = bestLineZ + (Math.random() < 0.5 ? 2.2 : -2.2);

    const dPlayer = dist2(tx, tz, px, pz);
    if (dPlayer < 24 || dPlayer > 95) continue;
    if (!collidesCircle(tx, tz, 2.2)) return { x: tx, z: tz };
  }
  return { x: clamp(px + 28, -140, 140), z: clamp(pz - 18, -140, 140) };
}

function buildRandomEventBeacon(x, z, colorHex) {
  const g = new THREE.Group();
  g.position.set(x, 0.14, z);

  const beamMat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.14, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.25, 22, 10, 1, true), beamMat);
  beam.position.y = 11;
  g.add(beam);

  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.78, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.1, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);

  /* Low-Poly Glowing Loot / Supply Crate at center of event */
  const crateGroup = new THREE.Group();
  crateGroup.position.y = 0.42;
  const crateBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.68, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x1d2330, roughness: 0.5, metalness: 0.4 })
  );
  crateBody.castShadow = true;
  crateGroup.add(crateBody);
  const strapMat = new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false });
  const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.14, 0.99), strapMat);
  crateGroup.add(strap1);
  const strap2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.99), strapMat);
  crateGroup.add(strap2);
  g.add(crateGroup);

  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.48, 0),
    new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false })
  );
  star.position.y = 2.6;
  g.add(star);

  g.userData.parts = { beam, beamMat, ring, ringMat, crateGroup, star };
  scene.add(g);
  return g;
}

function triggerRandomEvent(preferredKind = null) {
  if (!city) return null;
  clearRandomEvent(true);

  let idx = randomEvent.lastIdx;
  if (preferredKind) {
    const found = RANDOM_EVENT_DEFS.findIndex((d) => d.kind === preferredKind);
    idx = found >= 0 ? found : 0;
  } else {
    idx = (randomEvent.lastIdx + 1 + KC.randInt(0, RANDOM_EVENT_DEFS.length - 2)) % RANDOM_EVENT_DEFS.length;
  }
  randomEvent.lastIdx = idx;
  const def = RANDOM_EVENT_DEFS[idx];
  const spot = findRandomEventSpot();

  randomEvent.active = true;
  randomEvent.kind = def.kind;
  randomEvent.title = def.title;
  randomEvent.sub = def.sub;
  randomEvent.reward = def.reward;
  randomEvent.color = def.color;
  randomEvent.x = spot.x;
  randomEvent.z = spot.z;
  randomEvent.timer = 95;
  randomEvent.flareTimer = 0;
  randomEvent.group = buildRandomEventBeacon(spot.x, spot.z, def.color);

  if (def.kind === 'ARMORED_TRUCK') {
    const truck = makeCarObject({
      x: spot.x + 2.2,
      z: spot.z,
      heading: rand(0, Math.PI * 2),
      color: 0x16243a,
      kind: 'parked',
      style: 'armored'
    });
    truck.isEventCar = true;
    truck.eventHp = 90;
    randomEvent.cars.push(truck);

    for (let i = 0; i < 2; i++) {
      const gx = spot.x + (i === 0 ? -2.2 : 2.2);
      const gz = spot.z + (i === 0 ? -2.4 : 2.6);
      const guard = makeHostile('thug', gx, gz, { isEventActor: true, hp: 75 });
      randomEvent.actors.push(guard);
    }
  } else if (def.kind === 'TURF_WAR') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const gx = spot.x + Math.cos(a) * 3.8;
      const gz = spot.z + Math.sin(a) * 3.8;
      const gangA = i < 2;
      const rival = makeHostile('thug', gx, gz, {
        isEventActor: true,
        isRival: true,
        rivalTeam: gangA ? 0 : 1,
        hp: 70
      });
      randomEvent.actors.push(rival);
    }
  } else if (def.kind === 'CITIZEN_RESCUE') {
    const brokenCar = makeCarObject({
      x: spot.x - 2.2,
      z: spot.z + 1.2,
      heading: 0.6,
      color: 0x456b8c,
      kind: 'parked',
      style: 'sedan'
    });
    randomEvent.cars.push(brokenCar);

    /* Waving stranded KC citizen */
    const citizenModel = makePerson({ type: 'ped', role: 'fan', prop: 'phone' });
    citizenModel.group.position.set(spot.x, 0.14, spot.z - 1.4);
    scene.add(citizenModel.group);
    const citizen = {
      type: 'ped', kind: 'ped', alive: true, hp: 60, model: citizenModel, group: citizenModel.group,
      axis: 'v', line: 28, side: 1, dir: 1, heading: 0, speed: 1.2, scared: 0,
      fleeX: 0, fleeZ: 0, turnCooldown: 0, phase: 0, stationary: true,
      homeX: spot.x, homeZ: spot.z - 1.4, baseHeading: 0, isEventCitizen: true
    };
    addCharacterTargets(citizen);
    peds.push(citizen);
    randomEvent.citizens.push(citizen);

    for (let i = 0; i < 2; i++) {
      const mugger = makeHostile('thug', spot.x + (i === 0 ? -2.5 : 2.5), spot.z + 2.2, {
        isEventActor: true,
        hp: 65
      });
      randomEvent.actors.push(mugger);
    }
  } else if (def.kind === 'SUPPLY_DROP') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const guard = makeHostile('thug', spot.x + Math.cos(a) * 3.4, spot.z + Math.sin(a) * 3.4, {
        isEventActor: true,
        hp: 70
      });
      randomEvent.actors.push(guard);
    }
  } else if (def.kind === 'GETAWAY_CAR') {
    const gt = makeCarObject({
      x: spot.x + 1.8,
      z: spot.z,
      heading: rand(0, Math.PI * 2),
      color: 0xe6ad38,
      kind: 'parked',
      style: 'sedan'
    });
    gt.isEventCar = true;
    gt.eventHp = 75;
    randomEvent.cars.push(gt);

    for (let i = 0; i < 2; i++) {
      const crew = makeHostile('thug', spot.x + (i === 0 ? -2.4 : 2.6), spot.z + 2.4, {
        isEventActor: true,
        hp: 70
      });
      randomEvent.actors.push(crew);
    }
  }

  updateRandomEventHUD();
  const d = Math.round(randomEventDistance());
  notify('LIVE EVENT', def.title + ' // ' + d + 'M AWAY', 'danger');
  showBanner('LIVE RANDOM EVENT', def.title);
  G.sound.ui();
  return randomEvent;
}

function completeRandomEvent(reason = 'COMPLETED') {
  if (!randomEvent.active) return;
  const reward = randomEvent.reward || 750;
  const title = randomEvent.title;
  const kind = randomEvent.kind;
  const ex = randomEvent.x;
  const ez = randomEvent.z;

  state.cash += reward;
  state.health = Math.min(100, state.health + 30);
  state.armor = Math.min(100, state.armor + 40);
  state.ammo = [WEAPONS[0].mag, WEAPONS[1].mag];
  if (kind === 'CITIZEN_RESCUE' && state.wanted > 0) {
    state.wanted = Math.max(0, state.wanted - 1);
    if (state.wanted === 0) clearWanted(true);
    else updateWantedUI();
  }

  spawnParticles(ex, 1.3, ez, 0x6ee7a8, 26, 5.5, 1.1, 4);
  addShockwave(ex, ez, randomEvent.color, 4.5);
  showBanner('EVENT COMPLETE', '+$' + reward.toLocaleString('en-US') + ' // ' + reason);
  notify('EVENT PAYOUT', title + '  +$' + reward.toLocaleString('en-US'), 'money');
  G.sound.missionComplete();
  G.sound.money();

  clearRandomEvent(true);
  randomEvent.cooldown = rand(24, 34);
  updateHUD();
}

function updateRandomEvent(dt) {
  if (G.mode !== 'playing') return;

  if (!randomEvent.active) {
    randomEvent.cooldown -= dt;
    if (randomEvent.cooldown <= 0) {
      triggerRandomEvent();
    }
    return;
  }

  randomEvent.timer -= dt;
  if (randomEvent.timer <= 0) {
    clearRandomEvent(false);
    randomEvent.cooldown = rand(18, 28);
    return;
  }

  /* Animate 3D Event Beacon & Crate */
  if (randomEvent.group && randomEvent.group.userData.parts) {
    const parts = randomEvent.group.userData.parts;
    const t = gameTime;
    parts.star.rotation.y += dt * 2.4;
    parts.star.position.y = 2.6 + Math.sin(t * 2.8) * 0.2;
    parts.crateGroup.rotation.y += dt * 0.9;
    parts.crateGroup.position.y = 0.44 + Math.sin(t * 2.2) * 0.06;
    const s = 1 + Math.sin(t * 3.1) * 0.12;
    parts.ring.scale.set(s, s, s);
    parts.ringMat.opacity = 0.55 + Math.sin(t * 3.1) * 0.22;
    parts.beamMat.opacity = 0.1 + Math.sin(t * 2.2) * 0.04;
  }

  /* Periodic signal flare smoke / rival turf-war crossfire effects */
  randomEvent.flareTimer -= dt;
  if (randomEvent.flareTimer <= 0) {
    randomEvent.flareTimer = 0.45;
    const dist = randomEventDistance();
    if (dist < 130) {
      spawnParticles(randomEvent.x, 1.1, randomEvent.z, randomEvent.color, 3, 2.2, 0.75, -1.8);
      if (randomEvent.kind === 'TURF_WAR' && randomEvent.actors.length >= 2) {
        const alive = randomEvent.actors.filter((a) => a.alive);
        if (alive.length >= 2) {
          const a1 = alive[0].group.position;
          const a2 = alive[alive.length - 1].group.position;
          addTracer(
            new THREE.Vector3(a1.x, 1.35, a1.z),
            new THREE.Vector3(a2.x + rand(-0.6, 0.6), 1.25, a2.z + rand(-0.6, 0.6)),
            0xff5f8f,
            0.55
          );
        }
      }
    }
  }

  /* Waving stranded citizen animation */
  for (const c of randomEvent.citizens) {
    if (c.alive && c.model) {
      c.model.leftArm.rotation.x = 2.6 + Math.sin(gameTime * 8) * 0.35;
      c.model.rightArm.rotation.x = 2.6 + Math.cos(gameTime * 8) * 0.35;
    }
  }

  /* Check if player walks or drives directly over the event loot crate to claim it */
  const d = randomEventDistance();
  if (d < 3.6) {
    completeRandomEvent('PAYLOAD SECURED');
  }
}

function updateWantedUI() {
  const stars = document.querySelectorAll('#stars .star');
  stars.forEach((s, i) => s.classList.toggle('lit', i < state.wanted));
  const w = $('wanted');
  if (w) w.classList.toggle('active', state.wanted > 0);
}

function addWanted(n = 1, reason = '') {
  if (G.mode !== 'playing') return;
  const before = state.wanted;
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.evadeTimer = 0;
  if (state.wanted > before) {
    updateWantedUI();
    notify('WANTED', reason || 'CIVILIAN DISTURBANCE', 'danger');
    G.sound.wanted();
    G.sound.startSiren();
    if (state.wanted === 1 || state.wanted === 2) spawnCopResponse();
    state.policeTimer = 2.5;
  }
}

function removeCops() {
  for (const c of cops) {
    c.alive = false;
    removeCharacterTargets(c);
    scene.remove(c.group);
  }
  cops.length = 0;
}

function removePoliceCars() {
  for (let i = cars.length - 1; i >= 0; i--) {
    const car = cars[i];
    if (car.kind === 'police' && !car.controlled) {
      for (const m of car.hitMeshes || []) {
        const idx = carHitMeshes.indexOf(m);
        if (idx >= 0) carHitMeshes.splice(idx, 1);
      }
      scene.remove(car.group);
      cars.splice(i, 1);
    }
  }
}

function clearWanted(quiet = false) {
  const had = state.wanted > 0;
  state.wanted = 0;
  state.evadeTimer = 0;
  removeCops();
  removePoliceCars();
  G.sound.stopSiren();
  updateWantedUI();
  if (had && !quiet) notify('POLICE', 'YOU EVADED THE POLICE');
  if (had && !quiet) G.sound.clearWanted();
}

function spawnCopAtOpen(x, z) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(27, 46);
    const px = clamp(x + Math.cos(a) * r, -KC.WORLD_LIMIT + 8, KC.WORLD_LIMIT - 8);
    const pz = clamp(z + Math.sin(a) * r, -KC.WORLD_LIMIT + 8, KC.WORLD_LIMIT - 8);
    if (!collidesCircle(px, pz, 0.5)) return spawnCopAt(px, pz);
  }
  return null;
}

function spawnCopResponse() {
  if (G.mode !== 'playing') return;
  const alive = cops.filter((c) => c.alive).length;
  const desired = Math.min(6, state.wanted * 2);
  let need = Math.max(0, desired - alive);
  if (need <= 0) return;
  if (state.wanted >= 2 && gameTime - (state.lastPoliceCar || -99) > 22) {
    const car = spawnPoliceCarNear(player.pos.x, player.pos.z);
    if (car) {
      state.lastPoliceCar = gameTime;
      for (let i = 0; i < 2; i++) {
        const px = car.x + rand(-3, 3), pz = car.z + rand(-3, 3);
        if (!collidesCircle(px, pz, 0.5)) spawnCopAt(px, pz);
      }
      need -= 2;
      notify('POLICE', 'POLICE CRUISER INBOUND', 'danger');
    }
  }
  for (let i = 0; i < need; i++) spawnCopAtOpen(player.pos.x, player.pos.z);
  state.policeTimer = 6;
}

function updateWanted(dt) {
  if (state.wanted <= 0) return;
  let nearest = 999;
  for (const c of cops) {
    if (!c.alive) continue;
    const d = dist2(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z);
    if (d < nearest) nearest = d;
  }
  if (nearest > 52) state.evadeTimer += dt;
  else state.evadeTimer = 0;
  if (state.evadeTimer > 14) {
    state.wanted--;
    state.evadeTimer = 0;
    updateWantedUI();
    if (state.wanted <= 0) {
      clearWanted(false);
    } else {
      notify('POLICE', 'WANTED LEVEL DECREASED', 'danger');
      G.sound.clearWanted();
    }
    return;
  }
  state.policeTimer -= dt;
  if (state.policeTimer <= 0) spawnCopResponse();
}

/* ============================================================
   XInput Controller (Gamepad API) Polling & Haptic Rumble
   ============================================================ */
const gamepadState = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  fire: false,
  aim: false,
  sprint: false,
  jump: false,
  throttle: 0,
  brake: 0,
  steer: 0,
  horn: false,
  lean: 0,
  prevButtons: new Array(18).fill(false)
};

function applyDeadzone(val, dz = 0.16) {
  if (Math.abs(val) < dz) return 0;
  return Math.sign(val) * ((Math.abs(val) - dz) / (1 - dz));
}

function triggerGamepadRumble(strength = 0.4, durationMs = 100) {
  if (!navigator.getGamepads) return;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
        gp.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: clamp(strength, 0, 1),
          strongMagnitude: clamp(strength * 0.85, 0, 1)
        }).catch(() => {});
        break;
      }
    }
  } catch (e) {}
}

function pollGamepad(dt) {
  if (!navigator.getGamepads) return;
  let gp = null;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
  } catch (e) { return; }

  const wasConnected = state.gamepadConnected;
  state.gamepadConnected = !!gp;
  if (gp && !wasConnected) {
    state.gamepadName = gp.id || 'XINPUT CONTROLLER';
    notify('XINPUT', 'CONTROLLER ONLINE');
    updateHUD();
  } else if (!gp && wasConnected) {
    gamepadState.moveX = gamepadState.moveY = gamepadState.lookX = gamepadState.lookY = 0;
    gamepadState.fire = gamepadState.aim = gamepadState.sprint = gamepadState.jump = false;
    gamepadState.throttle = gamepadState.brake = gamepadState.steer = 0;
    updateHUD();
    return;
  }
  if (!gp) return;

  const lx = applyDeadzone(gp.axes[0] || 0, 0.16);
  const ly = applyDeadzone(gp.axes[1] || 0, 0.16);
  const rx = applyDeadzone(gp.axes[2] || 0, 0.15);
  const ry = applyDeadzone(gp.axes[3] || 0, 0.15);

  gamepadState.moveX = lx;
  gamepadState.moveY = -ly;
  gamepadState.steer = -lx;
  gamepadState.lookX = rx;
  gamepadState.lookY = ry;

  const btn = (idx) => !!(gp.buttons[idx] && gp.buttons[idx].pressed);
  const val = (idx) => (gp.buttons[idx] ? gp.buttons[idx].value : 0);
  const justPressed = (idx) => btn(idx) && !gamepadState.prevButtons[idx];

  const ltVal = val(6);
  const rtVal = val(7);
  gamepadState.aim = ltVal > 0.25;
  gamepadState.fire = rtVal > 0.35;
  gamepadState.throttle = rtVal;
  gamepadState.brake = ltVal;
  gamepadState.jump = btn(0); // A
  gamepadState.sprint = btn(10); // L3
  gamepadState.horn = btn(10);

  /* Right stick camera look */
  if (G.mode === 'playing' && (Math.abs(rx) > 0.001 || Math.abs(ry) > 0.001)) {
    const lookSpeed = pointer.sensitivity * 2.55 * (player.aiming ? 0.58 : 1.0);
    if (activeVehicle) {
      player.carLookYaw = clamp(player.carLookYaw - rx * lookSpeed * dt, -2.5, 2.5);
      player.carLookPitch = clamp(player.carLookPitch - ry * lookSpeed * dt, -0.4, 0.4);
    } else {
      player.yaw -= rx * lookSpeed * dt;
      player.pitch = clamp(player.pitch - ry * lookSpeed * dt, -1.38, 1.38);
    }
  }

  /* LB / RB: Lean when aiming, otherwise switch weapon */
  if (gamepadState.aim && !activeVehicle) {
    gamepadState.lean = (btn(5) ? 1 : 0) - (btn(4) ? 1 : 0);
  } else {
    gamepadState.lean = 0;
    if (justPressed(4)) switchWeapon(0);
    if (justPressed(5)) switchWeapon(1);
  }

  /* Action buttons edge-triggered */
  if (G.mode === 'menu' && justPressed(0)) {
    G.sound.init();
    startGame();
  } else if (G.mode === 'dead' && justPressed(0)) {
    respawn();
  } else if (G.mode === 'paused' && (justPressed(9) || justPressed(0))) {
    resumeGame();
  } else if (G.mode === 'playing') {
    if (justPressed(1) || justPressed(11)) toggleCrouch(); // B or R3
    if (justPressed(2)) startReload(); // X
    if (justPressed(3)) interact(); // Y
    if (justPressed(12)) toggleFlashlight(); // D-Pad Up
    if (justPressed(13)) toggleCameraMode(); // D-Pad Down
    if (justPressed(14)) cycleZoom(-1); // D-Pad Left
    if (justPressed(15)) cycleZoom(1); // D-Pad Right
    if (justPressed(9)) pauseGame(); // Start
    if (justPressed(8) && KC.multiplayer) KC.multiplayer.toggleVoiceMode(); // Back/Select
  }

  for (let i = 0; i < 18; i++) gamepadState.prevButtons[i] = btn(i);
}

/* ============================================================
   Player Movement, Shooter Mechanics & 1P/3P Camera
   ============================================================ */
function updatePlayer(dt) {
  state.damageTimer += dt;
  if (state.damageTimer > 7 && state.health < 100 && G.mode === 'playing') {
    state.health = Math.min(100, state.health + 5.5 * dt);
    if (Math.random() < dt * 4) updateHUD();
  }
  player.shake *= Math.exp(-dt * 7);
  player.recoilPitch *= Math.exp(-dt * 9);
  player.recoilYaw *= Math.exp(-dt * 9);

  /* Periodic world distance culling */
  cullTimer += dt;
  if (cullTimer >= 0.16 && city && city.updateCulling) {
    cullTimer = 0;
    const cx = activeVehicle ? activeVehicle.x : player.pos.x;
    const cz = activeVehicle ? activeVehicle.z : player.pos.z;
    city.updateCulling(cx, cz);
  }

  if (activeVehicle) {
    if (playerRig) playerRig.group.visible = false;
    updateDrivenCar(dt);
    updateCameraCar(dt);
    nearestCar = null;
    return;
  }

  /* Aim Down Sights (ADS) state */
  player.aiming = !state.reloading && (pointer.aiming || gamepadState.aim);
  const targetAds = player.aiming ? 1 : 0;
  player.adsBlend = lerp(player.adsBlend, targetAds, 1 - Math.exp(-dt * 15));

  /* Lean Left / Lean Right: Q/Z = left (-1), E/X = right (+1) */
  const nearInteractable = !!nearestCar || (state.contract.stage === 'travel' && state.contract.marker && contractDistance() < 7);
  const leanLeftKey = keys.KeyQ || keys.KeyZ;
  const leanRightKey = keys.KeyX || (keys.KeyE && (!nearInteractable || player.aiming));
  const desiredLean = clamp((leanRightKey ? 1 : 0) - (leanLeftKey ? 1 : 0) + gamepadState.lean, -1, 1);

  /* Wall-clip check for leaning */
  let allowedLean = desiredLean;
  if (desiredLean !== 0) {
    const rightX = Math.cos(player.yaw), rightZ = -Math.sin(player.yaw);
    if (collidesCircle(player.pos.x + rightX * desiredLean * 0.45, player.pos.z + rightZ * desiredLean * 0.45, 0.28)) {
      allowedLean = 0;
    }
  }
  player.lean = allowedLean;
  player.leanAmount = lerp(player.leanAmount, allowedLean, 1 - Math.exp(-dt * 12));

  /* Eye height interpolation for crouch / slide */
  const targetEye = player.slideTimer > 0 ? 0.82 : (player.crouching ? 1.04 : 1.64);
  player.currentEye = lerp(player.currentEye, targetEye, 1 - Math.exp(-dt * 13));

  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const kbF = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const kbR = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const f = clamp(kbF + gamepadState.moveY, -1, 1);
  const r = clamp(kbR + gamepadState.moveX, -1, 1);
  const inputMag = clamp(Math.hypot(f, r), 0, 1);
  const move = new THREE.Vector3().addScaledVector(forward, f).addScaledVector(right, r);
  const moving = move.lengthSq() > 0.001;
  if (moving) move.normalize();

  const sprint = (keys.ShiftLeft || keys.ShiftRight || gamepadState.sprint) && !player.aiming;
  if (sprint && player.crouching && player.slideTimer <= 0 && moving) {
    player.crouching = false;
  }

  if (player.slideTimer > 0) {
    player.slideTimer -= dt;
    const slideSpd = 8.8 * clamp(player.slideTimer / 0.62, 0.3, 1);
    player.vel.x = player.slideDir.x * slideSpd;
    player.vel.z = player.slideDir.z * slideSpd;
  } else {
    let baseSpeed = 4.6;
    if (sprint) baseSpeed = 7.8;
    else if (player.crouching) baseSpeed = 2.65;
    else if (player.aiming) baseSpeed = 3.1;
    if (state.streetBoostTimer > 0) {
      state.streetBoostTimer = Math.max(0, state.streetBoostTimer - dt);
      baseSpeed *= 1.22;
    }
    const targetSpeed = moving ? baseSpeed * inputMag : 0;
    const response = 1 - Math.exp(-dt * 11);
    player.vel.x = lerp(player.vel.x, move.x * targetSpeed, response);
    player.vel.z = lerp(player.vel.z, move.z * targetSpeed, response);
    if (!moving) {
      player.vel.x *= 1 - dt * 8;
      player.vel.z *= 1 - dt * 8;
    }
  }

  /* Move & resolve against buildings, props, AND vehicle OBBs */
  const desiredX = player.pos.x + player.vel.x * dt;
  const desiredZ = player.pos.z + player.vel.z * dt;
  const resolved = resolveCircleWorld(desiredX, desiredZ, player.radius, true, null);
  player.pos.x = resolved.x;
  player.pos.z = resolved.z;

  const wasOnGround = player.onGround;
  const prevVy = player.vy;
  if ((keys.Space || gamepadState.jump) && player.onGround) {
    if (player.crouching) {
      player.crouching = false;
      player.slideTimer = 0;
    } else {
      player.vy = 5.4;
      player.onGround = false;
      G.sound.footstep();
    }
  }
  player.vy -= 18 * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) {
    player.pos.y = 0;
    player.vy = 0;
    player.onGround = true;
    if (!wasOnGround && prevVy < -1.8) {
      player.landingImpact = clamp(Math.abs(prevVy) / 7.5, 0.25, 1.0);
      G.sound.footstep();
    }
  }
  player.landingImpact = (player.landingImpact || 0) * Math.exp(-dt * 9);

  /* Track turn rate & local strafe angle for 3rd-person torso lean and leg steering */
  const rawYawDelta = player.yaw - (player.prevYaw ?? player.yaw);
  player.prevYaw = player.yaw;
  player.turnRate = lerp(player.turnRate || 0, clamp(rawYawDelta / Math.max(0.001, dt), -8, 8), 0.3);
  const targetStrafeAngle = moving ? Math.atan2(-r, Math.abs(f) + 0.18) * (f < -0.1 ? -1 : 1) : 0;
  player.strafeAngle = lerp(player.strafeAngle || 0, targetStrafeAngle, 1 - Math.exp(-dt * 12));

  /* Slower, calmer, more realistic walking bob cadence */
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed > 0.35 && player.onGround && player.slideTimer <= 0) {
    player.bobPhase += dt * speed * 0.82;
    const bobAmp = player.aiming ? 0.008 : (player.crouching ? 0.014 : 0.022);
    player.bob = Math.sin(player.bobPhase) * bobAmp * clamp(speed / 4.8, 0, 1.25);
    player.footstep -= dt;
    if (player.footstep <= 0) {
      G.sound.footstep(sprint);
      player.footstep = sprint ? 0.33 : (player.crouching ? 0.56 : 0.46);
    }
  } else {
    player.bob *= 1 - dt * 8;
  }

  /* Update 3rd-person player character mesh & strict visibility */
  if (playerRig) {
    const show3P = G.mode === 'playing' && !activeVehicle && player.cameraMode === '3p';
    playerRig.group.visible = show3P;
    if (show3P) {
      playerRig.group.position.set(player.pos.x, player.pos.y + 0.14, player.pos.z);
      playerRig.group.rotation.y = player.yaw;
      const w = WEAPONS[state.weapon];
      const recoilKick = clamp(state.recoilPitch / Math.max(0.001, w.recoil), 0, 1.8);
      const reloadProgress = state.reloading ? (1 - clamp(state.reloadTimer / w.reload, 0, 1)) : 0;
      KC.applyCharacterPose(playerRig, {
        dt,
        walkPhase: player.bobPhase * 1.25,
        speedRatio: speed / 4.6,
        strafeAngle: player.strafeAngle,
        turnRate: player.turnRate,
        crouching: player.crouching,
        sliding: player.slideTimer > 0,
        onGround: player.onGround,
        vy: player.vy,
        landingImpact: player.landingImpact,
        lean: player.leanAmount,
        aiming: player.aiming || state.firing || state.muzzleTimer > 0,
        firing: state.muzzleTimer > 0,
        recoilKick,
        reloading: state.reloading,
        reloadProgress,
        weaponIndex: state.weapon,
        pitch: player.pitch,
        flashlightOn: player.flashlightOn,
        hasWeapon: true
      });
    }
  }

  nearestCar = findNearestCar();
  updateCameraOnFoot(dt, moving, r);
}

const camRaycaster = new THREE.Raycaster();

function updateCameraOnFoot(dt, moving, strafe) {
  const shake = player.shake;
  const sx = (Math.random() - 0.5) * shake * 0.028;
  const sy = (Math.random() - 0.5) * shake * 0.022;
  const rightX = Math.cos(player.yaw), rightZ = -Math.sin(player.yaw);
  const leanOffset = player.leanAmount * 0.42;

  const pitch = clamp(player.pitch + player.recoilPitch + sy * 0.5, -1.42, 1.42);
  const yaw = player.yaw + player.recoilYaw + sx * 0.5;
  const roll = -strafe * 0.01 - player.leanAmount * 0.14;

  const headX = player.pos.x + rightX * leanOffset + sx;
  const headY = player.pos.y + player.currentEye + player.bob + sy;
  const headZ = player.pos.z + rightZ * leanOffset;

  if (player.cameraMode === '1p') {
    camera.position.set(headX, headY, headZ);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, roll);
  } else {
    /* 3rd-Person Over-the-Shoulder Camera with wall-collision spring arm */
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, roll * 0.5);
    const lookDir = new THREE.Vector3();
    camera.getWorldDirection(lookDir);

    const shoulderSide = player.lean < 0 ? -0.52 : 0.55;
    const armDist = lerp(2.75, 1.55, player.adsBlend);
    const pivot = new THREE.Vector3(
      player.pos.x + rightX * (shoulderSide + leanOffset * 0.5),
      headY + 0.14,
      player.pos.z + rightZ * (shoulderSide + leanOffset * 0.5)
    );
    const desiredCam = pivot.clone().addScaledVector(lookDir, -armDist);

    /* Raycast from pivot to desiredCam against city.rayMeshes to prevent wall clipping */
    const backDir = new THREE.Vector3().subVectors(desiredCam, pivot);
    const maxLen = backDir.length();
    if (maxLen > 0.05 && city) {
      camRaycaster.set(pivot, backDir.normalize());
      camRaycaster.far = maxLen;
      const hits = camRaycaster.intersectObjects(city.rayMeshes, false);
      if (hits.length > 0 && hits[0].distance < maxLen) {
        camera.position.copy(pivot).addScaledVector(backDir, Math.max(0.35, hits[0].distance - 0.22));
      } else {
        camera.position.copy(desiredCam);
      }
    } else {
      camera.position.copy(desiredCam);
    }
    camera.position.y = Math.max(0.32, camera.position.y);
  }

  /* Dynamic FOV for ADS + Variable Zoom */
  const baseFov = 75;
  const zoomMag = ZOOM_LEVELS[player.zoomIndex] || 1.25;
  const adsFov = baseFov / zoomMag;
  const targetFov = lerp(baseFov, adsFov, player.adsBlend);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 12));
    camera.updateProjectionMatrix();
  }
  carLight.intensity = 0;
}

function updateCameraHeli(dt, v) {
  const shake = player.shake;
  const camYaw = v.heading + player.carLookYaw;
  const camPitch = clamp(player.carLookPitch, -0.6, 0.6);
  if (player.cameraMode === '1p') {
    const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    camera.position.set(v.x + fx * 0.6, v.y + 0.35, v.z + fz * 0.6);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(camPitch - 0.05, camYaw, 0);
  } else {
    const backX = Math.sin(camYaw), backZ = Math.cos(camYaw);
    const dist = 9.0;
    camera.position.set(v.x + backX * dist, v.y + 4.5, v.z + backZ * dist);
    camera.lookAt(v.x, v.y + 0.5, v.z);
    camera.rotation.order = 'YXZ';
  }
  const targetFov = 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 7)); camera.updateProjectionMatrix(); }
  carLight.intensity = 0;
}
function updateCameraPlane(dt, v) {
  const camYaw = v.heading + player.carLookYaw;
  const camPitch = clamp(v.pitch + player.carLookPitch, -0.9, 0.9);
  if (player.cameraMode === '1p') {
    camera.position.set(v.x - Math.sin(v.heading) * 0.6, v.y + 0.4, v.z - Math.cos(v.heading) * 0.6);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(camPitch, camYaw, v.roll);
  } else {
    const backX = Math.sin(camYaw), backZ = Math.cos(camYaw);
    const dist = 12.0;
    camera.position.set(v.x + backX * dist, v.y + 5.0, v.z + backZ * dist);
    camera.lookAt(v.x, v.y, v.z);
    camera.rotation.order = 'YXZ';
  }
  const targetFov = 70;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 7)); camera.updateProjectionMatrix(); }
  carLight.intensity = 0;
}
function updateCameraBoat(dt, v) {
  const shake = player.shake;
  const camYaw = v.heading + player.carLookYaw;
  const camPitch = clamp(player.carLookPitch, -0.4, 0.4);
  if (player.cameraMode === '1p') {
    const offset = new THREE.Vector3(0, 1.5, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.heading);
    camera.position.set(v.x + offset.x, v.y + 1.6, v.z + offset.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(camPitch + v.pitch, camYaw, v.roll * 0.4);
  } else {
    const backX = Math.sin(camYaw), backZ = Math.cos(camYaw);
    const dist = 8.0;
    camera.position.set(v.x + backX * dist, v.y + 3.5, v.z + backZ * dist);
    camera.lookAt(v.x, v.y + 0.5, v.z);
    camera.rotation.order = 'YXZ';
  }
  const targetFov = 78;
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 7)); camera.updateProjectionMatrix(); }
  carLight.intensity = 0;
}
function updateCameraCar(dt) {
  if (!activeVehicle) return;
  const v = activeVehicle;
  if (v.type === 'heli') { updateCameraHeli(dt, v); return; }
  if (v.type === 'plane') { updateCameraPlane(dt, v); return; }
  if (v.type === 'boat') { updateCameraBoat(dt, v); return; }
  const car = activeVehicle;
  const shake = player.shake;
  const sx = (Math.random() - 0.5) * shake * 0.02;
  const sy = (Math.random() - 0.5) * shake * 0.02;
  const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) + gamepadState.steer;

  const camYaw = car.heading + player.carLookYaw;
  const camPitch = clamp(player.carLookPitch + (Math.random() - 0.5) * shake * 0.02, -0.45, 0.45);

  if (player.cameraMode === '1p') {
    const offset = new THREE.Vector3(0, 1.3, -0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
    camera.position.set(car.x + offset.x + sx, 1.33 + sy, car.z + offset.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(camPitch, camYaw, -steer * 0.014 * clamp(Math.abs(car.speed) / 10, 0, 1));
  } else {
    /* 3rd-Person Chase Camera behind vehicle */
    const backX = Math.sin(camYaw), backZ = Math.cos(camYaw);
    const dist = 6.2 + clamp(car.speed / 12, 0, 1.4);
    camera.position.set(car.x + backX * dist + sx, 2.55 + sy, car.z + backZ * dist);
    camera.lookAt(car.x - backX * 2.5, 1.05 + camPitch * 2, car.z - backZ * 2.5);
    camera.rotation.order = 'YXZ';
  }

  const targetFov = 80;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 7));
    camera.updateProjectionMatrix();
  }
  const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
  carLight.position.set(car.x + fx * 1.8, 0.95, car.z + fz * 1.8);
  carLight.target.position.set(car.x + fx * 26, 0.1, car.z + fz * 26);
  carLight.target.updateMatrixWorld();
  carLight.intensity = 85;
}

function updateMenuCamera(dt) {
  menuTime += dt;
  const a = 0.86 + Math.sin(menuTime * 0.035) * 0.14;
  const r = 112;
  camera.position.set(Math.cos(a) * r, 36 + Math.sin(menuTime * 0.11) * 1.6, Math.sin(a) * r);
  camera.lookAt(-10, 11, -25);
  camera.rotation.order = 'YXZ';
  if (camera.fov !== 62) {
    camera.fov = 62;
    camera.updateProjectionMatrix();
  }
  carLight.intensity = 0;
}

/* ============================================================
   HUD, Notifications, Extended Minimap
   ============================================================ */
function formatClock(minutes) {
  const total = Math.floor(minutes) % 1440;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function updateClock() {
  const el = $('clock');
  if (!el) return;
  const h = Math.floor(state.timeMinutes / 60) % 24;
  const period = h >= 6 && h < 18 ? 'DAY' : (h >= 18 && h < 21 ? 'DUSK' : 'NIGHT');
  el.textContent = formatClock(state.timeMinutes) + ' · ' + period + ' · ' + state.weather;
}

function areaNameAt(x, z) {
  if (!city || !city.mapData) return 'KANSAS CITY';
  let bestLandmark = null;
  let bestLandmarkD = 30;
  for (const l of Object.values(city.landmarks)) {
    if (!l.marker) continue;
    const dd = dist2(x, z, l.marker.x, l.marker.z);
    if (dd < bestLandmarkD) { bestLandmarkD = dd; bestLandmark = l; }
  }
  if (bestLandmark) return bestLandmark.label || 'KANSAS CITY';
  let best = null;
  let bestD = 48;
  for (const d of city.mapData.districts) {
    const dd = dist2(x, z, d.x, d.z);
    if (dd < bestD) { bestD = dd; best = d; }
  }
  return best ? best.name : 'KANSAS CITY';
}

function updateArea() {
  if (!city) return;
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  const name = areaNameAt(px, pz);
  const area = $('area-name');
  const label = $('minimap-label');
  if (area) area.textContent = name;
  if (label) label.textContent = name;
}

const MM_EXTENT = 262;
let minimapBase = null;

function buildMinimap() {
  if (!city || !city.mapData) return;
  const size = 816;
  const s = size / (MM_EXTENT * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, size, size);

  const waterY = (city.mapData.water.maxZ + MM_EXTENT) * s;
  const waterGrad = ctx.createLinearGradient(0, 0, 0, waterY);
  waterGrad.addColorStop(0, '#07131f');
  waterGrad.addColorStop(1, '#0b1c2a');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, 0, size, waterY);
  ctx.strokeStyle = 'rgba(120,170,210,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, waterY);
  ctx.lineTo(size, waterY);
  ctx.stroke();

  for (const b of city.mapData.blocks) {
    const bx = (b.x + MM_EXTENT) * s;
    const bz = (b.z + MM_EXTENT) * s;
    const bs = 30 * s;
    if (b.park) ctx.fillStyle = '#18271c';
    else if (b.landmark) ctx.fillStyle = '#29242a';
    else ctx.fillStyle = '#1b1b22';
    ctx.fillRect(bx - bs / 2, bz - bs / 2, bs, bs);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - bs / 2, bz - bs / 2, bs, bs);
  }

  ctx.strokeStyle = '#37363d';
  ctx.lineWidth = 10 * s;
  ctx.lineCap = 'butt';
  for (const line of city.mapData.lines) {
    const p = (line + MM_EXTENT) * s;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  for (const l of Object.values(city.landmarks)) {
    const lx = (l.x + MM_EXTENT) * s;
    const lz = (l.z + MM_EXTENT) * s;
    ctx.fillStyle = 'rgba(255,177,59,0.78)';
    ctx.fillRect(lx - 3, lz - 3, 6, 6);
  }

  minimapBase = c;
}

function drawMinimap() {
  if (!minimapBase || !city) return;
  const canvas = $('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 3;
  const viewScale = 2.65;
  const px = activeVehicle ? activeVehicle.x : player.pos.x;
  const pz = activeVehicle ? activeVehicle.z : player.pos.z;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#07070b';
  ctx.fillRect(0, 0, size, size);

  const drawSize = MM_EXTENT * 2 * viewScale;
  const left = cx - (px + MM_EXTENT) * viewScale;
  const top = cy - (pz + MM_EXTENT) * viewScale;
  ctx.drawImage(minimapBase, 0, 0, minimapBase.width, minimapBase.height, left, top, drawSize, drawSize);

  const vignette = ctx.createRadialGradient(cx, cy, radius * 0.38, cx, cy, radius);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.78, 'rgba(0,0,0,0.16)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const yaw = activeVehicle ? activeVehicle.heading + player.carLookYaw : player.yaw;
  const ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 43, ang - 0.56, ang + 0.56);
  ctx.closePath();
  ctx.fillStyle = 'rgba(242,232,213,0.08)';
  ctx.fill();

  function blip(x, z, color, dotSize, shape) {
    let dx = (x - px) * viewScale;
    let dz = (z - pz) * viewScale;
    const d = Math.hypot(dx, dz);
    const max = radius - 12;
    let edge = false;
    if (d > max) {
      dx = (dx / d) * max;
      dz = (dz / d) * max;
      edge = true;
    }
    const bx = cx + dx;
    const by = cy + dz;
    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    if (shape === 'diamond') {
      ctx.rotate(Math.PI / 4);
      const q = edge ? 4.2 : 5.2;
      ctx.fillRect(-q, -q, q * 2, q * 2);
    } else if (shape === 'square') {
      const q = edge ? 2.4 : dotSize;
      ctx.fillRect(-q, -q, q * 2, q * 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, edge ? 2.8 : dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (state.contract.stage === 'travel' && state.contract.marker) {
    blip(state.contract.marker.x, state.contract.marker.z, '#ffb13b', 4, 'diamond');
  }
  if (randomEvent.active) {
    blip(randomEvent.x, randomEvent.z, '#ff5f8f', 4.6, 'diamond');
  }
  for (const c of cops) {
    if (!c.alive) continue;
    blip(c.group.position.x, c.group.position.z, '#ff3b3b', 3.2, 'dot');
  }
  for (const t of thugs) {
    if (!t.alive) continue;
    blip(t.group.position.x, t.group.position.z, '#ff6a4a', 3.2, 'dot');
  }
  for (const car of cars) {
    if (!car.isPolice || car.controlled) continue;
    blip(car.x, car.z, '#65b8ff', 3, 'square');
  }
  /* Multiplayer session peers on minimap */
  if (KC.multiplayer) {
    for (const peer of KC.multiplayer.peers.values()) {
      blip(peer.x, peer.z, peer.speaking ? '#57e6c2' : '#9df5c8', 3.6, 'dot');
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = '#f2e8d5';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
  ctx.strokeStyle = 'rgba(242,232,213,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.stroke();
}

function updateSpeedHUD() {
  if (!activeVehicle) return;
  const mph = Math.round(Math.abs(activeVehicle.speed) * 2.237);
  const speedEl = $('speed');
  const fillEl = $('speed-fill');
  const nameEl = $('vehicle-name');
  if (speedEl) speedEl.textContent = String(mph);
  if (fillEl) fillEl.style.width = clamp(Math.abs(activeVehicle.speed) / Math.max(1, activeVehicle.maxSpeed) * 100, 0, 100) + '%';
  if (nameEl) {
    const v = activeVehicle;
    if (v.type === 'heli') nameEl.textContent = 'KC POLICE HELI';
    else if (v.type === 'plane') nameEl.textContent = 'KC SKYHAWK';
    else if (v.type === 'boat') nameEl.textContent = 'KC RIVER RUNNER';
    else nameEl.textContent = v.isPolice ? 'KCPD CRUISER' : 'VULCAN GT';
  }
}

function notify(tag, text, cls = '') {
  const box = $('notifications');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'notification' + (cls ? ' ' + cls : '');
  const tagEl = document.createElement('span');
  tagEl.className = 'note-tag';
  tagEl.textContent = tag;
  const textEl = document.createElement('span');
  textEl.textContent = text;
  el.appendChild(tagEl);
  el.appendChild(textEl);
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 4300);
}

function showBanner(title, sub) {
  const banner = $('banner');
  if (!banner) return;
  const t = $('banner-title');
  const s = $('banner-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
}

function updateHUD() {
  if (!G.city) return;
  const health = clamp(Math.ceil(state.health), 0, 100);
  const armor = clamp(Math.ceil(state.armor), 0, 100);
  const healthFill = $('health-fill');
  const armorFill = $('armor-fill');
  if (healthFill) {
    healthFill.style.width = health + '%';
    healthFill.classList.toggle('low', health < 35);
  }
  if (armorFill) armorFill.style.width = armor + '%';
  if ($('health-num')) $('health-num').textContent = String(health);
  if ($('armor-num')) $('armor-num').textContent = String(armor);
  if ($('cash')) $('cash').textContent = KC.formatMoney(state.cash);

  updateWantedUI();
  updateClock();

  const weapon = WEAPONS[state.weapon];
  if ($('weapon-slot')) $('weapon-slot').textContent = weapon.slot;
  if ($('weapon-name')) $('weapon-name').textContent = weapon.name;
  if ($('ammo')) $('ammo').textContent = String(state.ammo[state.weapon]);
  if ($('reserve')) $('reserve').textContent = '∞';
  if ($('weapon-bar-fill')) $('weapon-bar-fill').style.width = clamp(state.ammo[state.weapon] / weapon.mag * 100, 0, 100) + '%';
  if ($('slot-1')) $('slot-1').classList.toggle('active', state.weapon === 0);
  if ($('slot-2')) $('slot-2').classList.toggle('active', state.weapon === 1);
  const reloadHint = $('reload-hint');
  if (reloadHint) {
    reloadHint.classList.toggle('reloading', state.reloading);
    reloadHint.textContent = state.reloading ? 'RELOADING...' : 'R // RELOAD';
  }

  /* Tactical status pills: Stance, Camera, Flashlight, Zoom, XInput */
  const stanceEl = $('hud-stance');
  if (stanceEl) {
    const stanceTxt = player.slideTimer > 0 ? 'SLIDING' : (player.crouching ? 'CROUCH' : (player.lean < 0 ? 'LEAN L' : player.lean > 0 ? 'LEAN R' : 'STAND'));
    stanceEl.textContent = stanceTxt + ' · ' + player.cameraMode.toUpperCase();
  }
  const flashEl = $('hud-flashlight');
  if (flashEl) {
    flashEl.textContent = 'FLASHLIGHT ' + (player.flashlightOn ? 'ON' : 'OFF') + ' [F]';
    flashEl.classList.toggle('active', player.flashlightOn);
  }
  const zoomEl = $('hud-zoom');
  if (zoomEl) {
    const zVal = ZOOM_LEVELS[player.zoomIndex] || 1.25;
    zoomEl.textContent = (player.aiming ? 'ADS ' : 'ZOOM ') + zVal.toFixed(1) + 'x';
    zoomEl.classList.toggle('active', player.aiming);
  }
  const padEl = $('hud-gamepad');
  if (padEl) {
    padEl.classList.toggle('hidden', !state.gamepadConnected);
  }

  const weaponHud = $('weapon-hud');
  const vehicleHud = $('vehicle-hud');
  if (weaponHud) weaponHud.classList.toggle('hidden', !!activeVehicle);
  if (vehicleHud) vehicleHud.classList.toggle('hidden', !activeVehicle);
  if (activeVehicle) updateSpeedHUD();

  const crosshair = $('crosshair');
  if (crosshair) {
    crosshair.classList.toggle('hidden-cross', !!activeVehicle);
    const gap = player.aiming ? 4 : (player.crouching ? 6 : 9);
    crosshair.style.setProperty('--gap', gap + 'px');
  }

  const playing = G.mode === 'playing';
  const missionNear = playing && !activeVehicle && state.contract.stage === 'travel' &&
    !!state.contract.marker && contractDistance() < 7;
  const vendorCart = playing && !activeVehicle && !missionNear ? findNearestVendorCart() : null;
  const shop = playing && !activeVehicle && !missionNear ? findNearestShop() : null;
  const carDist = nearestCar ? dist2(player.pos.x, player.pos.z, nearestCar.x, nearestCar.z) : 999;
  const cartDist = vendorCart ? dist2(player.pos.x, player.pos.z, vendorCart.x, vendorCart.z) : 999;
  const shopDist = shop ? dist2(player.pos.x, player.pos.z, shop.x, shop.z) : 999;
  const preferShop = !!shop && shopDist <= carDist && shopDist <= cartDist;
  const preferVendor = !!vendorCart && cartDist <= carDist && !preferShop;
  const carNear = playing && !activeVehicle && !!nearestCar && !preferVendor && !preferShop;
  const missionPrompt = $('mission-prompt');
  const vehiclePrompt = $('vehicle-prompt');
  if (missionPrompt) missionPrompt.classList.toggle('hidden', !missionNear);
  if (vehiclePrompt) {
    vehiclePrompt.classList.toggle('hidden', !((carNear || preferVendor || preferShop) && !missionNear));
    if (preferShop) {
      vehiclePrompt.innerHTML = '<span class="key">E</span> ' + shop.name + ' (' + shop.type.toUpperCase() + ')';
    } else if (preferVendor) {
      vehiclePrompt.innerHTML = '<span class="key">E</span> ' + vendorCart.name;
    } else if (carNear) {
      vehiclePrompt.innerHTML = '<span class="key">E</span> ENTER VEHICLE';
    }
  }

  const low = $('low-health');
  if (low) low.classList.toggle('active', playing && health < 35);
  const hint = $('pointer-hint');
  if (hint) hint.classList.toggle('hidden', !playing || pointer.locked || state.gamepadConnected);

  const hud = $('hud');
  if (hud) hud.classList.toggle('hidden', G.mode === 'menu' || G.mode === 'dead');
}

/* ============================================================
   Game Lifecycle
   ============================================================ */
function readStore(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {}
}

function findSafeSpawn() {
  const candidates = [
    [2, 10], [0, 17], [-5, 16], [8, 17], [5, 2], [24, 8],
    [-24, 8], [0, 24], [24, -6], [40, 66], [0, 66], [0, -24]
  ];
  for (const c of candidates) {
    if (!collidesCircle(c[0], c[1], 0.55)) return { x: c[0], z: c[1] };
  }
  return { x: 2, z: 10 };
}

function resetPlayer(spawn) {
  player.pos.set(spawn.x, 0, spawn.z);
  player.vel.set(0, 0, 0);
  player.yaw = -2.35;
  player.pitch = 0;
  player.vy = 0;
  player.onGround = true;
  player.bob = 0;
  player.bobPhase = 0;
  player.footstep = 0;
  player.shake = 0;
  player.recoilPitch = 0;
  player.recoilYaw = 0;
  player.carLookYaw = 0;
  player.carLookPitch = 0;
  player.crouching = false;
  player.slideTimer = 0;
  player.lean = 0;
  player.leanAmount = 0;
  player.aiming = false;
  player.adsBlend = 0;
}

function removeCorpses() {
  for (const c of corpses) scene.remove(c.group);
  corpses.length = 0;
}

function clearThugs() {
  for (const t of thugs) {
    removeCharacterTargets(t);
    scene.remove(t.group);
  }
  thugs.length = 0;
}

function resetActors() {
  clearRandomEvent(true);
  for (const arr of [peds, cops, thugs]) {
    for (const a of arr) {
      if (a.model) removeCharacterTargets(a);
      scene.remove(a.group);
    }
    arr.length = 0;
  }
  removeCorpses();
  spawnPeds(82);
  spawnGangsters(8);
  spawnCityPickups();
}

function resetCars() {
  if (activeVehicle) {
    activeVehicle.controlled = false;
    activeVehicle.group.visible = true;
    activeVehicle = null;
  }
  for (const car of cars) { car.group.visible = true; scene.remove(car.group); }
  for (const h of helis) scene.remove(h.group);
  for (const p of planes) scene.remove(p.group);
  for (const b of boats) scene.remove(b.group);
  cars.length = 0;
  helis.length = 0;
  planes.length = 0;
  boats.length = 0;
  carHitMeshes.length = 0;
  spawnCars();
  spawnVehicles();
}

function startGame() {
  if (!city || G.mode === 'starting') return;
  G.mode = 'starting';
  G.sound.init();
  G.sound.setMuted(G.muted);
  G.sound.stopEngine();
  G.sound.stopSiren();
  if (document.pointerLockElement) document.exitPointerLock();
  if (activeVehicle) activeVehicle.group.visible = true;
  activeVehicle = null;
  nearestCar = null;
  carLight.intensity = 0;
  pointer.firing = false;
  pointer.aiming = false;
  weaponRoot.visible = false;
  removeContractMarker();
  removeCorpses();
  resetCars();
  resetActors();
  rebuildPlayerRig();

  const spawn = findSafeSpawn();
  resetPlayer(spawn);
  gameTime = 0;
  menuTime = 0;
  hudTimer = 0;
  minimapTimer = 0;
  areaTimer = 0;
  state.health = 100;
  state.armor = 50;
  state.cash = 500;
  state.wanted = 0;
  state.evadeTimer = 0;
  state.policeTimer = 1.5;
  state.lastPoliceCar = -99;
  state.weapon = 0;
  state.ammo = [12, 24];
  state.fireTimer = 0;
  state.reloading = false;
  state.reloadTimer = 0;
  state.reloadClick = false;
  state.recoilPitch = 0;
  state.recoilYaw = 0;
  state.muzzleTimer = 0;
  state.hornTimer = 0;
  state.kills = 0;
  state.contracts = 0;
  state.damageTimer = 99;
  state.damageFlash = 0;
  state.firing = false;
  state.contract = {
    number: 1,
    reward: 1200,
    stage: 'travel',
    location: 'Kauffman Center',
    marker: null,
    cooldown: 0,
    remaining: 0,
    total: 0
  };

  $('start-screen').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('death-screen').classList.add('hidden');
  if ($('char-modal')) $('char-modal').classList.add('hidden');
  if ($('session-modal')) $('session-modal').classList.add('hidden');
  if ($('world-modal')) $('world-modal').classList.add('hidden');
  $('damage-flash').style.opacity = '0';
  $('low-health').classList.remove('active');

  /* Apply the configured Per-Game Day/Night Cycle & Weather settings for this game session */
  applyWorldSettings(null, true, true);

  G.mode = 'playing';
  camera.fov = 75;
  camera.updateProjectionMatrix();
  startTravel('Kauffman Center');
  randomEvent.cooldown = 4.5;
  updateWantedUI();
  updateClock();
  updateArea();
  updateHUD();
  drawMinimap();
  updateWeaponView(0);
  if (KC.multiplayer) KC.multiplayer.updateSessionUI();
  showBanner('WELCOME TO KANSAS CITY', 'THE CITY IS YOURS');
  notify('KINGDOM', 'CONTRACT READY // KAUFFMAN CENTER', 'money');
  G.sound.ui();
}

function die() {
  if (G.mode !== 'playing') return;
  G.mode = 'dead';
  state.health = 0;
  state.armor = 0;
  state.firing = false;
  state.reloading = false;
  pointer.firing = false;
  pointer.aiming = false;
  if (document.pointerLockElement) document.exitPointerLock();
  G.sound.stopEngine();
  G.sound.stopSiren();
  if (activeVehicle) {
    activeVehicle.controlled = false;
    activeVehicle.group.visible = true;
    activeVehicle.speed = 0;
    activeVehicle = null;
  }
  carLight.intensity = 0;
  flashLight.intensity = 0;
  weaponRoot.visible = false;
  if (playerRig) playerRig.group.visible = false;
  state.damageFlash = 1;
  $('damage-flash').style.opacity = '1';

  const oldBest = state.bestCash || 0;
  const fee = Math.min(100, state.cash);
  state.cash = Math.max(0, state.cash - fee);
  const isBest = state.cash > oldBest;
  state.bestCash = Math.max(oldBest, state.cash);
  writeStore('heartland26_best', String(state.bestCash));

  $('death-cash').textContent = KC.formatMoney(state.cash);
  $('death-missions').textContent = String(state.contracts);
  $('death-kills').textContent = String(state.kills);
  $('new-best').classList.toggle('hidden', !isBest);
  $('pointer-hint').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('death-screen').classList.remove('hidden');
  updateHUD();
  G.sound.hurt();
}

function respawn() {
  if (!city || G.mode !== 'dead') return;
  G.sound.init();
  G.sound.setMuted(G.muted);
  clearWanted(true);
  clearThugs();
  removeCorpses();
  if (state.contract.stage === 'fight') {
    state.contract.stage = 'travel';
    state.contract.remaining = 0;
    state.contract.total = 0;
    createContractMarker(state.contract.location);
  } else if (state.contract.stage === 'travel' && !contractMarker) {
    createContractMarker(state.contract.location);
  }
  const spawn = findSafeSpawn();
  resetPlayer(spawn);
  state.health = 100;
  state.armor = 50;
  state.damageTimer = 99;
  state.damageFlash = 0;
  state.wanted = 0;
  state.evadeTimer = 0;
  state.policeTimer = 1.5;
  state.lastPoliceCar = -99;
  state.reloading = false;
  state.fireTimer = 0;
  state.ammo = [12, 24];
  state.recoilPitch = 0;
  state.recoilYaw = 0;
  state.muzzleTimer = 0;
  pointer.firing = false;
  pointer.aiming = false;
  G.mode = 'playing';
  $('damage-flash').style.opacity = '0';
  $('low-health').classList.remove('active');
  $('death-screen').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('start-screen').classList.add('hidden');
  updateWantedUI();
  updateHUD();
  updateObjective();
  updateArea();
  drawMinimap();
  updateWeaponView(0);
  showBanner('BACK IN THE GAME', 'THE CITY DOES NOT WAIT');
  notify('MEDICAL', 'PATCHED UP // ' + state.contract.location.toUpperCase());
}

function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  pointer.firing = false;
  pointer.aiming = false;
  weaponRoot.visible = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('pause-cash').textContent = KC.formatMoney(state.cash);
  $('pause-wanted').textContent = state.wanted > 0 ? '★'.repeat(state.wanted) : 'CLEAR';
  syncWorldSettingsUI();
  $('pause-screen').classList.remove('hidden');
  $('pointer-hint').classList.add('hidden');
  G.sound.ui();
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = 'playing';
  $('pause-screen').classList.add('hidden');
  if ($('char-modal')) $('char-modal').classList.add('hidden');
  if ($('session-modal')) $('session-modal').classList.add('hidden');
  if ($('world-modal')) $('world-modal').classList.add('hidden');
  $('pointer-hint').classList.toggle('hidden', pointer.locked);
  G.sound.init();
  G.sound.setMuted(G.muted);
  G.sound.ui();
  updateHUD();
  requestLock();
}

function toMenu() {
  if (document.pointerLockElement) document.exitPointerLock();
  G.mode = 'menu';
  pointer.firing = false;
  pointer.aiming = false;
  weaponRoot.visible = false;
  if (playerRig) playerRig.group.visible = false;
  if (activeVehicle) {
    activeVehicle.controlled = false;
    activeVehicle.group.visible = true;
    activeVehicle.speed = 0;
    activeVehicle = null;
  }
  carLight.intensity = 0;
  flashLight.intensity = 0;
  G.sound.stopEngine();
  G.sound.stopSiren();
  removeCops();
  clearThugs();
  clearRandomEvent(true);
  removeContractMarker();
  removeCorpses();
  removePoliceCars();
  updateWantedUI();
  state.damageFlash = 0;
  $('damage-flash').style.opacity = '0';
  $('low-health').classList.remove('active');
  $('hud').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('death-screen').classList.add('hidden');
  $('start-screen').classList.remove('hidden');
  $('pointer-hint').classList.add('hidden');
  menuTime = 0;
  G.sound.ui();
}

/* ============================================================
   Input & UI Wiring (Keyboard, Mouse, Character & Session Modals)
   ============================================================ */
function requestLock() {
  if (G.mode !== 'playing') return;
  if (document.pointerLockElement === renderer.domElement) return;
  try {
    const result = renderer.domElement.requestPointerLock();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (err) {}
}

function toggleMute() {
  G.muted = !G.muted;
  G.sound.setMuted(G.muted);
  writeStore('heartland26_muted', G.muted ? '1' : '0');
  notify('AUDIO', G.muted ? 'SOUND MUTED' : 'SOUND ONLINE');
}

function interact() {
  if (G.mode !== 'playing') return;
  if (activeVehicle) {
    exitCar();
    return;
  }
  if (state.contract.stage === 'travel' && state.contract.marker && contractDistance() < 7) {
    startFight();
    return;
  }
  const car = findNearestCar();
  const vendorCart = findNearestVendorCart();
  const shop = findNearestShop();
  const carD = car ? dist2(player.pos.x, player.pos.z, car.x, car.z) : 999;
  const cartD = vendorCart ? dist2(player.pos.x, player.pos.z, vendorCart.x, vendorCart.z) : 999;
  const shopD = shop ? dist2(player.pos.x, player.pos.z, shop.x, shop.z) : 999;
  if (shop && shopD <= carD && shopD <= cartD) {
    buyShop(shop);
    return;
  }
  if (vendorCart && cartD <= carD) {
    buyVendorBoost(vendorCart);
    return;
  }
  if (car) {
    enterCar(car);
    return;
  }
  nearestCar = null;
}

function wireCharacterModal() {
  const modal = $('char-modal');
  if (!modal) return;
  const O = KC.CHAR_OPTIONS;
  const cfg = KC.charConfig;
  const preview = $('char-preview-canvas');

  const syncUI = () => {
    if ($('char-callsign')) $('char-callsign').value = cfg.callsign || 'KC_OUTLAW';
    if ($('char-skin-val')) $('char-skin-val').textContent = (O.skins[cfg.skinIdx] || O.skins[0]).name;
    if ($('char-hair-val')) $('char-hair-val').textContent = (O.hairStyles.find((h) => h.id === cfg.hairStyle) || O.hairStyles[0]).label;
    if ($('char-haircol-val')) $('char-haircol-val').textContent = (O.hairColors[cfg.hairColorIdx] || O.hairColors[0]).name;
    if ($('char-outfit-val')) $('char-outfit-val').textContent = (O.outfits.find((o) => o.id === cfg.outfit) || O.outfits[0]).label;
    if ($('char-shirt-val')) $('char-shirt-val').textContent = (O.shirtColors[cfg.shirtColorIdx] || O.shirtColors[0]).name;
    if ($('char-accent-val')) $('char-accent-val').textContent = (O.accentColors[cfg.accentColorIdx] || O.accentColors[0]).name;
    if ($('char-pants-val')) $('char-pants-val').textContent = (O.pantsColors[cfg.pantsColorIdx] || O.pantsColors[0]).name;
    if ($('char-acc-val')) $('char-acc-val').textContent = (O.accessories.find((a) => a.id === cfg.accessory) || O.accessories[0]).label;
    KC.drawCharPreviewCanvas(preview, cfg);
    KC.saveCharConfig(cfg);
    rebuildPlayerRig();
  };

  const cycleIdx = (key, len, dir) => {
    cfg[key] = (cfg[key] + dir + len) % len;
    G.sound.ui();
    syncUI();
  };
  const cycleId = (key, arr, dir) => {
    const idx = Math.max(0, arr.findIndex((x) => x.id === cfg[key]));
    cfg[key] = arr[(idx + dir + arr.length) % arr.length].id;
    G.sound.ui();
    syncUI();
  };

  const bindBtn = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  bindBtn('open-char-btn', () => { modal.classList.remove('hidden'); syncUI(); G.sound.ui(); });
  bindBtn('pause-char-btn', () => { modal.classList.remove('hidden'); syncUI(); G.sound.ui(); });
  bindBtn('close-char-btn', () => { modal.classList.add('hidden'); G.sound.ui(); });

  if ($('char-callsign')) {
    $('char-callsign').addEventListener('input', (e) => {
      cfg.callsign = (e.target.value || 'KC_OUTLAW').toUpperCase().slice(0, 14);
      KC.drawCharPreviewCanvas(preview, cfg);
      KC.saveCharConfig(cfg);
    });
  }

  bindBtn('skin-prev', () => cycleIdx('skinIdx', O.skins.length, -1));
  bindBtn('skin-next', () => cycleIdx('skinIdx', O.skins.length, 1));
  bindBtn('hair-prev', () => cycleId('hairStyle', O.hairStyles, -1));
  bindBtn('hair-next', () => cycleId('hairStyle', O.hairStyles, 1));
  bindBtn('haircol-prev', () => cycleIdx('hairColorIdx', O.hairColors.length, -1));
  bindBtn('haircol-next', () => cycleIdx('hairColorIdx', O.hairColors.length, 1));
  bindBtn('outfit-prev', () => cycleId('outfit', O.outfits, -1));
  bindBtn('outfit-next', () => cycleId('outfit', O.outfits, 1));
  bindBtn('shirt-prev', () => cycleIdx('shirtColorIdx', O.shirtColors.length, -1));
  bindBtn('shirt-next', () => cycleIdx('shirtColorIdx', O.shirtColors.length, 1));
  bindBtn('accent-prev', () => cycleIdx('accentColorIdx', O.accentColors.length, -1));
  bindBtn('accent-next', () => cycleIdx('accentColorIdx', O.accentColors.length, 1));
  bindBtn('pants-prev', () => cycleIdx('pantsColorIdx', O.pantsColors.length, -1));
  bindBtn('pants-next', () => cycleIdx('pantsColorIdx', O.pantsColors.length, 1));
  bindBtn('acc-prev', () => cycleId('accessory', O.accessories, -1));
  bindBtn('acc-next', () => cycleId('accessory', O.accessories, 1));

  bindBtn('char-random-btn', () => {
    cfg.skinIdx = KC.randInt(0, O.skins.length - 1);
    cfg.hairStyle = KC.pick(O.hairStyles).id;
    cfg.hairColorIdx = KC.randInt(0, O.hairColors.length - 1);
    cfg.outfit = KC.pick(O.outfits).id;
    cfg.shirtColorIdx = KC.randInt(0, O.shirtColors.length - 1);
    cfg.accentColorIdx = KC.randInt(0, O.accentColors.length - 1);
    cfg.pantsColorIdx = KC.randInt(0, O.pantsColors.length - 1);
    cfg.accessory = KC.pick(O.accessories).id;
    G.sound.ui();
    syncUI();
  });

  syncUI();
}

function wireSessionModal() {
  const modal = $('session-modal');
  if (!modal || !KC.multiplayer) return;
  const mp = KC.multiplayer;

  const openModal = () => {
    modal.classList.remove('hidden');
    if ($('session-code-input')) $('session-code-input').value = mp.roomCode;
    if ($('session-bots-toggle')) $('session-bots-toggle').textContent = mp.botsEnabled ? 'SQUAD RUNNERS: ON' : 'SQUAD RUNNERS: OFF';
    if ($('session-voice-toggle')) $('session-voice-toggle').textContent = mp.voiceMode === 'open' ? 'VOICE: OPEN MIC (45m)' : 'VOICE: PUSH-TO-TALK [T] (45m)';
    mp.updateSessionUI();
    G.sound.ui();
  };

  if ($('open-session-btn')) $('open-session-btn').addEventListener('click', openModal);
  if ($('pause-session-btn')) $('pause-session-btn').addEventListener('click', openModal);
  if ($('close-session-btn')) $('close-session-btn').addEventListener('click', () => { modal.classList.add('hidden'); G.sound.ui(); });

  if ($('join-session-btn')) {
    $('join-session-btn').addEventListener('click', () => {
      const code = $('session-code-input') ? $('session-code-input').value : 'KC-2026';
      mp.joinRoom(code);
      notify('SESSION', 'JOINED ROOM // ' + mp.roomCode);
      G.sound.ui();
    });
  }
  if ($('copy-invite-btn')) {
    $('copy-invite-btn').addEventListener('click', async () => {
      const code = $('session-code-input') ? $('session-code-input').value : mp.roomCode;
      if (code && code.trim().toUpperCase() !== mp.roomCode) {
        mp.joinRoom(code);
      }
      const res = await mp.copyInviteLink();
      const btn = $('copy-invite-btn');
      if (btn) {
        btn.textContent = '✓ LINK COPIED';
        setTimeout(() => { btn.textContent = '🔗 COPY LINK'; }, 1800);
      }
      notify('INVITE', 'COPIED JOIN URL // ' + res.url, 'money');
      G.sound.money();
    });
  }
  if ($('session-bots-toggle')) {
    $('session-bots-toggle').addEventListener('click', () => {
      mp.setBotsEnabled(!mp.botsEnabled);
      $('session-bots-toggle').textContent = mp.botsEnabled ? 'SQUAD RUNNERS: ON' : 'SQUAD RUNNERS: OFF';
      G.sound.ui();
    });
  }
  if ($('session-voice-toggle')) {
    $('session-voice-toggle').addEventListener('click', () => {
      const mode = mp.toggleVoiceMode();
      $('session-voice-toggle').textContent = mode === 'open' ? 'VOICE: OPEN MIC (45m)' : 'VOICE: PUSH-TO-TALK [T] (45m)';
      G.sound.ui();
    });
  }
}

function wireWorldSettingsModal() {
  const modal = $('world-modal');
  const O = WORLD_SETTINGS_OPTIONS;
  const bindBtn = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

  const cycleSetting = (key, arr, dir) => {
    const idx = Math.max(0, arr.findIndex((x) => x.id === worldSettings[key]));
    worldSettings[key] = arr[(idx + dir + arr.length) % arr.length].id;
    G.sound.ui();
    applyWorldSettings(null, true, false);
  };

  const openModal = () => {
    if (!modal) return;
    modal.classList.remove('hidden');
    syncWorldSettingsUI();
    G.sound.ui();
  };

  bindBtn('open-world-btn', openModal);
  bindBtn('session-world-btn', openModal);
  bindBtn('pause-world-btn', openModal);
  bindBtn('close-world-btn', () => {
    if (modal) modal.classList.add('hidden');
    G.sound.ui();
  });

  /* World Settings Modal selectors */
  bindBtn('world-dn-prev', () => cycleSetting('dayNightMode', O.dayNightModes, -1));
  bindBtn('world-dn-next', () => cycleSetting('dayNightMode', O.dayNightModes, 1));
  bindBtn('world-speed-prev', () => cycleSetting('cycleSpeedPreset', O.cycleSpeeds, -1));
  bindBtn('world-speed-next', () => cycleSetting('cycleSpeedPreset', O.cycleSpeeds, 1));
  bindBtn('world-weather-prev', () => cycleSetting('weatherMode', O.weatherModes, -1));
  bindBtn('world-weather-next', () => cycleSetting('weatherMode', O.weatherModes, 1));
  bindBtn('world-wfreq-prev', () => cycleSetting('weatherFrequency', O.weatherFrequencies, -1));
  bindBtn('world-wfreq-next', () => cycleSetting('weatherFrequency', O.weatherFrequencies, 1));

  /* Pause Screen inline selectors */
  bindBtn('pause-dn-prev', () => cycleSetting('dayNightMode', O.dayNightModes, -1));
  bindBtn('pause-dn-next', () => cycleSetting('dayNightMode', O.dayNightModes, 1));
  bindBtn('pause-speed-prev', () => cycleSetting('cycleSpeedPreset', O.cycleSpeeds, -1));
  bindBtn('pause-speed-next', () => cycleSetting('cycleSpeedPreset', O.cycleSpeeds, 1));
  bindBtn('pause-weather-prev', () => cycleSetting('weatherMode', O.weatherModes, -1));
  bindBtn('pause-weather-next', () => cycleSetting('weatherMode', O.weatherModes, 1));
  bindBtn('pause-wfreq-prev', () => cycleSetting('weatherFrequency', O.weatherFrequencies, -1));
  bindBtn('pause-wfreq-next', () => cycleSetting('weatherFrequency', O.weatherFrequencies, 1));

  const startSlider = $('world-start-time-slider');
  if (startSlider) {
    startSlider.addEventListener('input', () => {
      const mins = parseFloat(startSlider.value) || 0;
      worldSettings.startTimeMinutes = mins;
      state.timeMinutes = mins;
      /* If user was on a preset time lock, switch to CUSTOM_LOCKED or keep DYNAMIC */
      if (worldSettings.dayNightMode !== 'DYNAMIC') {
        worldSettings.dayNightMode = 'CUSTOM_LOCKED';
      }
      applyWorldSettings(null, true, false);
    });
  }

  syncWorldSettingsUI();
}

function wireUI() {
  if (G.uiWired) return;
  G.uiWired = true;

  wireCharacterModal();
  wireSessionModal();
  wireWorldSettingsModal();

  $('start-btn').addEventListener('click', () => {
    if (G.mode !== 'menu') return;
    G.sound.init();
    G.sound.setMuted(G.muted);
    startGame();
    requestLock();
  });
  $('resume-btn').addEventListener('click', () => {
    if (G.mode !== 'paused') return;
    resumeGame();
  });
  $('pause-quit-btn').addEventListener('click', () => {
    if (G.mode === 'paused') toMenu();
  });
  if ($('pause-event-btn')) {
    $('pause-event-btn').addEventListener('click', () => {
      if (G.mode === 'paused') {
        resumeGame();
        triggerRandomEvent();
      }
    });
  }
  $('respawn-btn').addEventListener('click', () => {
    if (G.mode !== 'dead') return;
    respawn();
    requestLock();
  });
  $('death-menu-btn').addEventListener('click', () => {
    if (G.mode === 'dead') toMenu();
  });

  const sens = $('sens');
  const sensValue = $('sens-value');
  if (sens) {
    const stored = parseFloat(readStore('heartland26_sens', '1'));
    pointer.sensitivity = clamp(Number.isFinite(stored) ? stored : 1, 0.4, 2);
    sens.value = String(pointer.sensitivity);
    if (sensValue) sensValue.textContent = pointer.sensitivity.toFixed(1);
    sens.addEventListener('input', () => {
      pointer.sensitivity = clamp(parseFloat(sens.value) || 1, 0.4, 2);
      if (sensValue) sensValue.textContent = pointer.sensitivity.toFixed(1);
      writeStore('heartland26_sens', String(pointer.sensitivity));
    });
  }

  const todSlider = $('tod-slider');
  const todValue = $('tod-value');
  if (todSlider) {
    todSlider.addEventListener('input', () => {
      const mins = parseFloat(todSlider.value) || 0;
      state.timeMinutes = mins;
      worldSettings.startTimeMinutes = mins;
      if (worldSettings.dayNightMode !== 'DYNAMIC') {
        worldSettings.dayNightMode = 'CUSTOM_LOCKED';
      }
      if (todValue) todValue.textContent = formatClock(state.timeMinutes);
      applyWorldSettings(null, true, false);
    });
  }

  document.addEventListener('keydown', (e) => {
    /* Don't hijack typing inside input fields */
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;

    if (e.code === 'KeyM') {
      e.preventDefault();
      toggleMute();
      return;
    }
    if (G.mode === 'menu') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        G.sound.init();
        G.sound.setMuted(G.muted);
        startGame();
        requestLock();
      }
      return;
    }
    if (G.mode === 'dead') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        respawn();
        requestLock();
      }
      return;
    }
    if (G.mode === 'paused') {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
        e.preventDefault();
        resumeGame();
      }
      return;
    }
    if (G.mode !== 'playing') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'KeyT' && KC.multiplayer) {
      KC.multiplayer.setPushToTalk(true);
    }
    if (e.repeat) return;
    if (e.code === 'KeyE') {
      const canInteract = activeVehicle || nearestCar || !!findNearestVendorCart() || (state.contract.stage === 'travel' && state.contract.marker && contractDistance() < 7);
      if (canInteract && !player.aiming) interact();
    } else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyF') toggleFlashlight();
    else if (e.code === 'KeyV') toggleCameraMode();
    else if (e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') toggleCrouch();
    else if (e.code === 'KeyB') cycleZoom(1);
    else if (e.code === 'KeyN') cycleWeather();
    else if (e.code === 'KeyK') cycleTimeOfDay();
    else if (e.code === 'KeyJ') triggerRandomEvent();
    else if (e.code === 'KeyY' && KC.multiplayer) {
      const m = KC.multiplayer.toggleVoiceMode();
      notify('VOICE', m === 'open' ? 'OPEN MIC ENABLED (45m)' : 'PUSH-TO-TALK [T] (45m)');
    }
    else if (e.code === 'Digit1') switchWeapon(0);
    else if (e.code === 'Digit2') switchWeapon(1);
    else if (e.code === 'Escape') pauseGame();
  });

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyT' && KC.multiplayer) {
      KC.multiplayer.setPushToTalk(false);
    }
  });

  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    pointer.firing = false;
    pointer.aiming = false;
    if (KC.multiplayer) KC.multiplayer.setPushToTalk(false);
  });

  document.addEventListener('mousemove', (e) => {
    if (!pointer.locked || G.mode !== 'playing') return;
    const zoomScale = player.aiming ? (0.7 / (ZOOM_LEVELS[player.zoomIndex] || 1.25)) : 1.0;
    const sens = pointer.sensitivity * 0.0021 * zoomScale;
    if (activeVehicle) {
      player.carLookYaw = clamp(player.carLookYaw - e.movementX * sens, -2.5, 2.5);
      player.carLookPitch = clamp(player.carLookPitch - e.movementY * sens, -0.4, 0.4);
    } else {
      player.yaw -= e.movementX * sens;
      player.pitch = clamp(player.pitch - e.movementY * sens, -1.38, 1.38);
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (G.mode !== 'playing') return;
    if (e.target && e.target.closest && e.target.closest('button, input, label, .modal-panel')) return;
    if (!pointer.locked) {
      requestLock();
      return;
    }
    if (e.button === 0) {
      pointer.firing = true;
      state.firing = true;
      tryShoot();
    } else if (e.button === 2) {
      pointer.aiming = true;
      updateHUD();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      pointer.firing = false;
      state.firing = false;
    } else if (e.button === 2) {
      pointer.aiming = false;
      updateHUD();
    }
  });

  document.addEventListener('wheel', (e) => {
    if (G.mode !== 'playing' || activeVehicle) return;
    if (player.aiming) {
      cycleZoom(e.deltaY < 0 ? 1 : -1);
    } else {
      switchWeapon(state.weapon === 0 ? 1 : 0);
    }
  }, { passive: true });

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    pointer.locked = document.pointerLockElement === renderer.domElement;
    if (pointer.locked) {
      $('pointer-hint').classList.add('hidden');
    } else if (G.mode === 'playing') {
      pauseGame();
    }
  });

  document.addEventListener('pointerlockerror', () => {
    if (G.mode === 'playing') $('pointer-hint').classList.remove('hidden');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.mode === 'playing') pauseGame();
  });

  window.addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    weaponCamera.aspect = window.innerWidth / window.innerHeight;
    weaponCamera.updateProjectionMatrix();
  });
}

/* ============================================================
   Main Loop & Initialization
   ============================================================ */
let updaterTime = 0;
const loopClock = new THREE.Clock();

function updateWorldUpdaters(dt) {
  if (!city) return;
  updaterTime += dt;
  for (const fn of city.updaters) fn(updaterTime);
}

function updateDamageFlash(dt) {
  if (state.damageFlash <= 0) return;
  state.damageFlash = Math.max(0, state.damageFlash - dt * 3.2);
  const el = $('damage-flash');
  if (el) el.style.opacity = state.damageFlash.toFixed(3);
}

function tickHUD(dt) {
  hudTimer += dt;
  if (hudTimer >= 0.11) {
    hudTimer = 0;
    updateHUD();
    updateObjectiveDistance();
    updateRandomEventHUD();
  }
  if (activeVehicle) updateSpeedHUD();
  minimapTimer += dt;
  if (minimapTimer >= 1 / 18) {
    minimapTimer = 0;
    drawMinimap();
  }
  areaTimer += dt;
  if (areaTimer >= 0.7) {
    areaTimer = 0;
    updateArea();
  }
}

function renderFrame() {
  renderer.clear();
  renderer.render(scene, camera);
  if (G.mode === 'playing' && player.cameraMode === '1p' && (weaponRoot.visible || carCockpitRoot.visible)) {
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCamera);
  }
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(loopClock.getDelta(), 0.05);

  pollGamepad(dt);
  updateDayNightCycle(dt);
  updateWeather(dt);

  if (G.mode === 'menu') {
    updateMenuCamera(dt);
    updateCars(dt);
    updatePeds(dt);
    updatePedBubbles(dt);
    updateVendorBubbles(dt);
    if (KC.multiplayer) KC.multiplayer.update(dt, null, state.nightFactor);
    updateEffects(dt);
    updateWorldUpdaters(dt);
    renderFrame();
    return;
  }

  if (G.mode === 'playing') {
    gameTime += dt;
    updatePlayer(dt);
    updateWeaponState(dt);
    updateWeaponView(dt);
    updateCarCockpitView(dt);
    updateCars(dt);
    updatePeds(dt);
    updatePedBubbles(dt);
    updateVendorBubbles(dt);
    updateCops(dt);
    updateThugs(dt);
    updateWanted(dt);
    updateContract(dt);
    updateRandomEvent(dt);
    updateWorldPickups(dt);
    updateCorpses(dt);
    if (KC.multiplayer) {
      const px = activeVehicle ? activeVehicle.x : player.pos.x;
      const pz = activeVehicle ? activeVehicle.z : player.pos.z;
      KC.multiplayer.update(dt, {
        x: px,
        y: player.pos.y + 0.14,
        z: pz,
        yaw: activeVehicle ? activeVehicle.heading : player.yaw,
        pitch: player.pitch,
        crouching: player.crouching,
        sliding: player.slideTimer > 0,
        onGround: player.onGround,
        lean: player.leanAmount,
        aiming: player.aiming,
        reloading: state.reloading,
        weaponIndex: state.weapon,
        flashlightOn: player.flashlightOn,
        inCar: !!activeVehicle
      }, state.nightFactor);
    }
    updateEffects(dt);
    updateWorldUpdaters(dt);
    updateDamageFlash(dt);
    tickHUD(dt);
    renderFrame();
    return;
  }

  if (G.mode === 'dead') {
    updateWeaponView(dt);
    updateEffects(dt * 0.45);
    updateWorldUpdaters(dt * 0.35);
    updateDamageFlash(dt);
    renderFrame();
    return;
  }

  if (G.mode === 'paused') {
    updateWeaponView(dt);
    renderFrame();
    return;
  }

  renderFrame();
}

function init() {
  const storedBest = parseInt(readStore('heartland26_best', '0'), 10);
  state.bestCash = Number.isFinite(storedBest) ? storedBest : 0;
  const storedMuted = readStore('heartland26_muted', '0') === '1';
  G.muted = storedMuted;
  G.sound.muted = storedMuted;
  G.sound.setMuted(storedMuted);

  city = KC.buildCity(scene);
  G.city = city;
  setupWeapons();
  rebuildPlayerRig();
  spawnCars();
  spawnVehicles();
  spawnPeds(82);
  spawnGangsters(8);
  spawnCityPickups();
  buildMinimap();
  if (KC.multiplayer) KC.multiplayer.init(scene, G.sound);
  const spawn = findSafeSpawn();
  resetPlayer(spawn);
  applyWorldSettings(null, false, true);
  updateDayNightCycle(0.01);
  updateMenuCamera(0);
  updateClock();
  updateArea();
  updateWantedUI();
  $('hud').classList.add('hidden');
  $('pointer-hint').classList.add('hidden');
  wireUI();
  loopClock.start();
  requestAnimationFrame(loop);
  console.info('HEARTLAND 26 Extended ready //', city.blockData.length, 'blocks //', cars.length, 'vehicles //', peds.length, 'pedestrians');
}

async function boot() {
  const btn = $('start-btn');
  const label = btn ? btn.querySelector('.btn-label') : null;
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'BUILDING CITY...';
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (err) {}
  try {
    init();
    if (btn) btn.disabled = false;
    if (label) label.textContent = 'ENTER THE CITY';
  } catch (err) {
    G.loadError = err;
    console.error('HEARTLAND 26 failed to initialize:', err);
    if (label) label.textContent = 'CITY BUILD FAILED';
    if (btn) btn.disabled = true;
  }
}

window.HEARTLAND = {
  G,
  state,
  player,
  renderer,
  scene,
  camera,
  weaponRoot,
  carCockpitRoot,
  get carCockpit() { return carCockpit; },
  weaponScene,
  weaponCamera,
  weaponGroups,
  keys,
  pointer,
  gamepadState,
  get city() { return city; },
  get activeVehicle() { return activeVehicle; },
  get nearestCar() { return nearestCar; },
  get helis() { return helis; },
  get planes() { return planes; },
  get boats() { return boats; },
  get contractMarker() { return contractMarker; },
  get playerRig() { return playerRig; },
  get cars() { return cars; },
  get peds() { return peds; },
  get cops() { return cops; },
  get thugs() { return thugs; },
  get pedBubbles() { return pedBubbles; },
  spawnPedBubble,
  randomEvent,
  RANDOM_EVENT_DEFS,
  triggerRandomEvent,
  completeRandomEvent,
  clearRandomEvent,
  tryShoot,
  interact,
  startReload,
  switchWeapon,
  toggleFlashlight,
  toggleCameraMode,
  toggleCrouch,
  cycleZoom,
  cycleWeather,
  setWeather,
  cycleTimeOfDay,
  worldSettings,
  WORLD_SETTINGS_OPTIONS,
  applyWorldSettings,
  syncWorldSettingsUI,
  addTracer,
  enterCar,
  exitCar,
  findNearestVehicle,
  startGame,
  pauseGame,
  resumeGame,
  respawn,
  toMenu,
  die,
  addWanted,
  clearWanted,
  startTravel,
  startFight,
  nextContract,
  spawnCopResponse,
  spawnThugs,
  teleport(x, z) {
    if (!city) return;
    if (activeVehicle) {
      activeVehicle.x = x;
      activeVehicle.z = z;
      activeVehicle.group.position.set(x, 0.03, z);
      player.pos.set(x, 0, z);
    } else {
      player.pos.set(x, 0, z);
    }
  },
  setWanted(n) {
    state.wanted = clamp(n, 0, 5);
    state.evadeTimer = 0;
    updateWantedUI();
    if (state.wanted > 0) {
      G.sound.startSiren();
      spawnCopResponse();
    } else {
      clearWanted(true);
    }
  },
  giveCash(n) {
    state.cash += n;
    updateHUD();
  },
  setHealth(n) {
    state.health = clamp(n, 0, 100);
    updateHUD();
  },
  setTime(hours) {
    state.timeMinutes = ((hours * 60) % 1440 + 1440) % 1440;
    updateDayNightCycle(0);
    updateClock();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
