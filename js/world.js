'use strict';

/* ============================================================
   HEARTLAND 26 — extended low-poly Kansas City world core
   Performance-optimized: instanced geometry, spatial hash grid,
   distance + frustum detail culling, dynamic day/night hooks.
   ============================================================ */
const KC = (window.KC = window.KC || {});

KC.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
KC.lerp = (a, b, t) => a + (b - a) * t;
KC.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
KC.randInt = (a, b) => Math.floor(KC.rand(a, b + 1));
KC.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
KC.dist2 = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);
KC.formatMoney = (n) => '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');

/* Extended 10x10 road grid -> 9x9 = 81 city blocks */
KC.ROAD_LINES = [-180, -140, -100, -60, -20, 20, 60, 100, 140, 180];
KC.ROAD_HALF = 5;
KC.BLOCK_SIZE = 30;
KC.WORLD_LIMIT = 260;
KC.WINDOW_UNIT = 8;

KC.makeCanvasTexture = function (canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
};

KC.makeGlowTexture = function (soft = 0.35) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(soft, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return KC.makeCanvasTexture(c, false);
};

KC.makeLightPoolTexture = function () {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return KC.makeCanvasTexture(c, false);
};

KC.makeWindowTexture = function (facade, win, lit, litChance) {
  const W = 128, H = 256, cols = 4, rows = 7;
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const b = base.getContext('2d');
  b.fillStyle = facade;
  b.fillRect(0, 0, W, H);

  /* Subtle low-poly masonry / precast panel noise & vertical pilaster seams */
  for (let i = 0; i < 240; i++) {
    b.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    b.fillRect((i * 37) % W, (i * 53) % H, 6, 3);
  }
  const cellW = W / cols, cellH = H / rows;
  for (let x = 0; x <= cols; x++) {
    b.fillStyle = 'rgba(0,0,0,0.14)';
    b.fillRect(x * cellW - 1, 0, 2, H);
    b.fillStyle = 'rgba(255,255,255,0.04)';
    b.fillRect(x * cellW + 1, 0, 1, H);
  }
  for (let y = 0; y < rows; y++) {
    b.fillStyle = 'rgba(0,0,0,0.22)';
    b.fillRect(0, y * cellH, W, 3);
    b.fillStyle = 'rgba(255,255,255,0.06)';
    b.fillRect(0, y * cellH + 3, W, 1);
  }

  const bump = document.createElement('canvas');
  bump.width = W; bump.height = H;
  const bm = bump.getContext('2d');
  bm.fillStyle = '#c8c8c8';
  bm.fillRect(0, 0, W, H);
  for (let y = 0; y < rows; y++) {
    bm.fillStyle = '#909090';
    bm.fillRect(0, y * cellH, W, 3);
  }

  const em = document.createElement('canvas');
  em.width = W; em.height = H;
  const e = em.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cellW + 5, py = y * cellH + 5;
      const w = cellW - 10, h = cellH - 11;
      b.fillStyle = win;
      b.fillRect(px, py, w, h);
      /* Recessed window depth in bump map */
      bm.fillStyle = '#383838';
      bm.fillRect(px, py, w, h);
      bm.fillStyle = '#efefef';
      bm.fillRect(px - 1, py + h, w + 2, 2);

      /* Sill & mullion bars */
      b.fillStyle = 'rgba(255,255,255,0.07)';
      b.fillRect(px + 1, py + 1, w - 2, 2);
      b.fillRect(px - 1, py + h, w + 2, 2);
      b.fillStyle = 'rgba(0,0,0,0.26)';
      b.fillRect(px + w / 2, py, 1, h);
      b.fillRect(px, py + Math.floor(h * 0.55), w, 1);
      if (Math.random() < litChance) {
        e.fillStyle = lit;
        e.fillRect(px + 1, py + 1, w - 2, h - 2);
        e.fillStyle = 'rgba(255,255,255,0.38)';
        e.fillRect(px + 2, py + 2, w - 4, 3);
        /* Occasional half-drawn window blind for interior depth */
        if (Math.random() < 0.35) {
          e.fillStyle = 'rgba(20,16,24,0.45)';
          e.fillRect(px + 1, py + 1, w - 2, Math.floor(h * 0.38));
        }
      }
    }
  }
  const map = KC.makeCanvasTexture(base, true);
  const emissiveMap = KC.makeCanvasTexture(em, true);
  const bumpMap = KC.makeCanvasTexture(bump, false);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, emissiveMap, bumpMap };
};

/* ============================================================
   Procedural Low-Poly Surface & Material Texture Suite
   ============================================================ */
KC.makeTiledCanvasTexture = function (w, h, drawFn, repeatX = 1, repeatY = 1, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  drawFn(ctx, w, h);
  const tex = KC.makeCanvasTexture(c, srgb);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
};

KC.makeAsphaltTextures = function (repX = 3, repY = 110) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#808080' : '#1d1c23';
    ctx.fillRect(0, 0, W, H);
    /* Low-poly aggregate stone speckle */
    for (let i = 0; i < 650; i++) {
      const x = (i * 73) % W;
      const y = (i * 41) % H;
      const bright = i % 3 === 0;
      ctx.fillStyle = isBump
        ? (bright ? '#a8a8a8' : '#585858')
        : (bright ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.12)');
      ctx.fillRect(x, y, 2 + (i % 2), 2 + ((i + 1) % 2));
    }
    /* Subtle tire-wear longitudinal tracks */
    ctx.fillStyle = isBump ? 'rgba(110,110,110,0.35)' : 'rgba(0,0,0,0.11)';
    ctx.fillRect(W * 0.2, 0, W * 0.14, H);
    ctx.fillRect(W * 0.66, 0, W * 0.14, H);
    /* Tar seam lines */
    ctx.fillStyle = isBump ? '#4a4a4a' : 'rgba(10,10,14,0.35)';
    ctx.fillRect(W * 0.5 - 1, 0, 2, H);
    ctx.fillRect(0, H * 0.5, W, 2);
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeSidewalkTextures = function (repX = 10, repY = 10) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#969696' : '#434148';
    ctx.fillRect(0, 0, W, H);
    const step = W / 4;
    /* Subtle concrete slab tone variation */
    for (let gx = 0; gx < 4; gx++) {
      for (let gz = 0; gz < 4; gz++) {
        const shade = ((gx + gz * 3) % 3) - 1;
        if (!isBump && shade !== 0) {
          ctx.fillStyle = shade > 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(gx * step, gz * step, step, step);
        }
      }
    }
    /* Concrete grain */
    for (let i = 0; i < 320; i++) {
      ctx.fillStyle = isBump
        ? (i % 2 === 0 ? '#b2b2b2' : '#767676')
        : (i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)');
      ctx.fillRect((i * 59) % W, (i * 83) % H, 2, 2);
    }
    /* Expansion joint grid lines */
    for (let g = 0; g <= 4; g++) {
      const p = g * step;
      ctx.fillStyle = isBump ? '#3a3a3a' : 'rgba(18,17,22,0.42)';
      ctx.fillRect(p - 1, 0, 2, H);
      ctx.fillRect(0, p - 1, W, 2);
      ctx.fillStyle = isBump ? '#c8c8c8' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(p + 1, 0, 1, H);
      ctx.fillRect(0, p + 1, W, 1);
    }
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeBrickTextures = function (baseHex = '#5b362f', mortarHex = '#2c2220', repX = 4, repY = 4) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#454545' : mortarHex;
    ctx.fillRect(0, 0, W, H);
    const rows = 8, cols = 4;
    const rh = H / rows, cw = W / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * cw + off + 2;
        const by = r * rh + 2;
        const bw = cw - 3;
        const bh = rh - 3;
        if (isBump) {
          ctx.fillStyle = '#bcbcbc';
          ctx.fillRect(bx, by, bw, bh);
        } else {
          ctx.fillStyle = baseHex;
          ctx.fillRect(bx, by, bw, bh);
          const v = ((r * 7 + c * 13) & 3);
          if (v === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(bx, by, bw, bh);
          } else if (v === 1) {
            ctx.fillStyle = 'rgba(255,215,180,0.07)';
            ctx.fillRect(bx, by, bw, bh);
          }
        }
      }
    }
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeStoneTextures = function (baseHex = '#8a7b66', repX = 3, repY = 3) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#989898' : baseHex;
    ctx.fillRect(0, 0, W, H);
    const rows = 4, cols = 2;
    const rh = H / rows, cw = W / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const bx = c * cw + off;
        const by = r * rh;
        if (!isBump && ((r + c) & 1)) {
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(bx + 2, by + 2, cw - 4, rh - 4);
        }
        ctx.fillStyle = isBump ? '#4c4c4c' : 'rgba(0,0,0,0.22)';
        ctx.fillRect(bx, by, cw, 2);
        ctx.fillRect(bx, by, 2, rh);
      }
    }
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = isBump ? '#b4b4b4' : 'rgba(0,0,0,0.05)';
      ctx.fillRect((i * 43) % W, (i * 67) % H, 3, 2);
    }
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeGrassTextures = function (repX = 6, repY = 6) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#808080' : '#263c2b';
    ctx.fillRect(0, 0, W, H);
    /* Low-poly stylized mowing stripes & grass tufts */
    if (!isBump) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(0, 0, W * 0.5, H);
    }
    for (let i = 0; i < 360; i++) {
      const x = (i * 47) % W;
      const y = (i * 71) % H;
      ctx.fillStyle = isBump
        ? (i % 2 === 0 ? '#b4b4b4' : '#585858')
        : (i % 3 === 0 ? '#324f38' : i % 3 === 1 ? '#1e3022' : '#3b5c3e');
      ctx.fillRect(x, y, 2, 4);
    }
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeWoodTextures = function (baseHex = '#523828', repX = 2, repY = 2) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#888888' : baseHex;
    ctx.fillRect(0, 0, W, H);
    const planks = 6;
    const ph = H / planks;
    for (let p = 0; p < planks; p++) {
      if (!isBump && (p & 1)) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(0, p * ph, W, ph);
      }
      ctx.fillStyle = isBump ? '#3a3a3a' : 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, p * ph, W, 2);
      /* Wood grain streaks */
      for (let g = 0; g < 12; g++) {
        ctx.fillStyle = isBump ? '#a6a6a6' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(((p * 29 + g * 19) % W), p * ph + 4 + (g % 3) * 4, 18, 1);
      }
    }
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeStripedAwningTexture = function (hexA = '#b82028', hexB = '#f2e8d5') {
  return KC.makeTiledCanvasTexture(128, 64, (ctx, W, H) => {
    const stripes = 8;
    const sw = W / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? hexA : hexB;
      ctx.fillRect(i * sw, 0, sw, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, H - 6, W, 6);
  }, 1, 1, true);
};

KC.makeWaterRippleTextures = function (repX = 14, repY = 6) {
  const draw = (ctx, W, H, isBump) => {
    ctx.fillStyle = isBump ? '#787878' : '#0b1d29';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      const x = (i * 53) % W;
      const y = (i * 31) % H;
      ctx.fillStyle = isBump
        ? (i % 2 === 0 ? '#c4c4c4' : '#484848')
        : (i % 2 === 0 ? 'rgba(87,230,194,0.11)' : 'rgba(255,255,255,0.06)');
      ctx.fillRect(x, y, 14 + (i % 8), 2);
    }
  };
  return {
    map: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, false), repX, repY, true),
    bumpMap: KC.makeTiledCanvasTexture(128, 128, (ctx, w, h) => draw(ctx, w, h, true), repX, repY, false)
  };
};

KC.makeMicroBumpTexture = function (repX = 4, repY = 4) {
  return KC.makeTiledCanvasTexture(64, 64, (ctx, W, H) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        ctx.fillStyle = ((x + y) & 2) ? '#9a9a9a' : '#686868';
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }, repX, repY, false);
};

KC.makeSignTexture = function (text, color = '#ffb13b', bg = null) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '74px Anton, Impact, sans-serif';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = 'rgba(8,7,10,0.85)';
  ctx.lineWidth = 8;
  ctx.strokeText(text, 256, 66);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 66);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(text, 256, 66);
  return KC.makeCanvasTexture(c, true);
};

KC.scaleBoxUV = function (geo, w, h, d, unit = KC.WINDOW_UNIT) {
  const uv = geo.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const sx = sizes[f][0] / unit, sy = sizes[f][1] / unit;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * sx, uv.getY(idx) * sy);
    }
  }
  uv.needsUpdate = true;
};

/* ============================================================
   Animated PS1 / Tactical Water Shader (Missouri River)
   Multi-wave ripples, Fresnel sky reflection, sun glint & shore foam
   ============================================================ */
KC.createWaterSurface = function (width, depth, opts = {}) {
  const shoreAxis = opts.shoreAxis === 'x' ? 0.0 : 1.0; // 0 = X (BF river west), 1 = Z (RP river north)
  const shoreEdge = opts.shoreEdge != null ? opts.shoreEdge : -194.0;
  const uniforms = {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x0b2234) },
    uShallowColor: { value: new THREE.Color(0x1f5568) },
    uSkyColor: { value: new THREE.Color(0x527598) },
    uSunColor: { value: new THREE.Color(0xffe1a8) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.5, -0.5).normalize() },
    uShoreAxis: { value: shoreAxis },
    uShoreEdge: { value: shoreEdge },
    uFogColor: { value: new THREE.Color(0x527598) },
    uFogDensity: { value: 0.0028 }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: true,
    vertexShader: [
      'uniform float uTime;',
      'varying vec3 vWorldPos;',
      'varying float vWave;',
      'void main() {',
      '  vec4 wp = modelMatrix * vec4(position, 1.0);',
      '  float w = sin(wp.x * 0.16 + uTime * 1.45) * 0.065 + cos(wp.z * 0.14 - uTime * 1.2) * 0.055 + sin((wp.x + wp.z) * 0.25 + uTime * 1.9) * 0.03;',
      '  wp.y += w;',
      '  vWave = w;',
      '  vWorldPos = wp.xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'uniform vec3 uDeepColor;',
      'uniform vec3 uShallowColor;',
      'uniform vec3 uSkyColor;',
      'uniform vec3 uSunColor;',
      'uniform vec3 uSunDir;',
      'uniform float uShoreAxis;',
      'uniform float uShoreEdge;',
      'uniform vec3 uFogColor;',
      'uniform float uFogDensity;',
      'varying vec3 vWorldPos;',
      'varying float vWave;',
      'float hash21(vec2 p) {',
      '  p = fract(p * vec2(123.34, 456.21));',
      '  p += dot(p, p + 45.32);',
      '  return fract(p.x * p.y);',
      '}',
      'float vnoise(vec2 p) {',
      '  vec2 i = floor(p); vec2 f = fract(p);',
      '  f = f * f * (3.0 - 2.0 * f);',
      '  float a = hash21(i); float b = hash21(i + vec2(1.0, 0.0));',
      '  float c = hash21(i + vec2(0.0, 1.0)); float d = hash21(i + vec2(1.0, 1.0));',
      '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
      '}',
      'void main() {',
      '  vec2 uv = vWorldPos.xz;',
      '  /* Quantized subtle PS1 ripple grid + flowing river currents */',
      '  vec2 qUv = floor(uv * 2.2) / 2.2;',
      '  float n1 = vnoise(qUv * 0.22 + vec2(uTime * 0.18, uTime * 0.34));',
      '  float n2 = vnoise(qUv * 0.48 - vec2(uTime * 0.28, -uTime * 0.22));',
      '  float n3 = vnoise(uv * 0.95 + vec2(uTime * 0.55, uTime * 0.38));',
      '  float ripple = n1 * 0.5 + n2 * 0.35 + n3 * 0.15;',
      '  vec3 N = normalize(vec3((n1 - 0.5) * 0.36 + (n3 - 0.5) * 0.14, 1.0, (n2 - 0.5) * 0.36 + (n3 - 0.5) * 0.14));',
      '  vec3 V = normalize(cameraPosition - vWorldPos);',
      '  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);',
      '  float coord = mix(vWorldPos.x, vWorldPos.z, uShoreAxis);',
      '  float shoreDist = max(0.0, uShoreEdge - coord);',
      '  float shallow = exp(-shoreDist * 0.055);',
      '  vec3 baseCol = mix(uDeepColor, uShallowColor, clamp(shallow * 0.85 + ripple * 0.28, 0.0, 1.0));',
      '  vec3 col = mix(baseCol, uSkyColor * 0.92, clamp(fresnel * 0.78 + 0.08, 0.0, 0.88));',
      '  /* Crisp dancing sun/moon specular glint */',
      '  vec3 H = normalize(normalize(uSunDir) + V);',
      '  float spec = pow(max(dot(N, H), 0.0), 68.0);',
      '  float sparkle = smoothstep(0.68, 0.92, n2 * n3 * 1.45) * pow(max(dot(N, H), 0.0), 16.0);',
      '  col += uSunColor * (spec * 1.15 + sparkle * 0.75);',
      '  /* Animated whitewater shoreline foam band & crest highlights */',
      '  float shoreWave = sin(shoreDist * 1.4 - uTime * 2.8 + n1 * 4.0) * 0.5 + 0.5;',
      '  float foam = smoothstep(6.2, 0.4, shoreDist) * smoothstep(0.32, 0.78, shoreWave * 0.75 + n2 * 0.5);',
      '  float crestFoam = smoothstep(0.76, 0.94, ripple + vWave * 1.8) * 0.22;',
      '  col = mix(col, vec3(0.88, 0.94, 0.97), clamp(foam * 0.78 + crestFoam, 0.0, 0.88));',
      '  /* Exponential squared fog matching scene.fog */',
      '  float dist = length(cameraPosition - vWorldPos);',
      '  float fogFactor = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));',
      '  col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));',
      '  gl_FragColor = vec4(col, mix(0.88, 0.96, 1.0 - shallow * 0.4));',
      '}'
    ].join('\n')
  });

  const segX = Math.max(12, Math.min(48, Math.round(width / 12)));
  const segZ = Math.max(12, Math.min(48, Math.round(depth / 12)));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, segX, segZ), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return { mesh, uniforms };
};

KC.buildCity = function (scene) {
  KC.WORLD_LIMIT = 260;
  const city = {
    gameMode: 'gtb',
    scene,
    colliders: [],
    propColliders: [],
    destructibleProps: [],
    spatialGrid: new Map(),
    gridCellSize: 24,
    rayMeshes: [],
    blocks: [],
    landmarks: {},
    updaters: [],
    trafficSpots: [],
    parkedSpots: [],
    pedSpots: [],
    signs: [],
    lampGlows: [],
    lightPools: [],
    streetLamps: [],
    cullItems: [],
    facadeMats: [],
    mapData: null
  };

  const glowTex = KC.makeGlowTexture();
  const poolTex = KC.makeLightPoolTexture();
  const asphaltTex = KC.makeAsphaltTextures(2, 76);
  const sidewalkTex = KC.makeSidewalkTextures(8, 8);
  const curbTex = KC.makeStoneTextures('#58545c', 12, 12);
  const roofTex = KC.makeAsphaltTextures(4, 4);
  const brickTex = KC.makeBrickTextures('#5b362f', '#281e1c', 4, 4);
  const darkBrickTex = KC.makeBrickTextures('#3e2826', '#1e1615', 4, 4);
  const stoneTex = KC.makeStoneTextures('#736353', 3, 3);
  const paleStoneTex = KC.makeStoneTextures('#948570', 3, 3);
  const grassTex = KC.makeGrassTextures(6, 6);
  const woodTex = KC.makeWoodTextures('#523828', 2, 2);
  const waterTex = KC.makeWaterRippleTextures(16, 6);
  const microBump = KC.makeMicroBumpTexture(5, 5);
  KC.sharedMicroBump = microBump;

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x24252d, roughness: 0.48, metalness: 0.68, bumpMap: microBump, bumpScale: 0.015 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x17171e, roughness: 0.65, metalness: 0.45, bumpMap: microBump, bumpScale: 0.015 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2b33, map: roofTex.map, bumpMap: roofTex.bumpMap, bumpScale: 0.04, roughness: 0.9, metalness: 0.08 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xa8a3ab, map: curbTex.map, bumpMap: curbTex.bumpMap, bumpScale: 0.035, roughness: 0.92 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb8b4bc, map: sidewalkTex.map, bumpMap: sidewalkTex.bumpMap, bumpScale: 0.038, roughness: 0.92 });
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0xb5b3bc, map: asphaltTex.map, bumpMap: asphaltTex.bumpMap, bumpScale: 0.045, roughness: 0.86, metalness: 0.08 });
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xd4be8a, toneMapped: false });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe2dac8, toneMapped: false });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x162530, roughness: 0.16, metalness: 0.68, emissive: 0x0d1b24, emissiveIntensity: 0.62 });
  const warmGlassMat = new THREE.MeshStandardMaterial({ color: 0x2d221d, roughness: 0.3, metalness: 0.35, emissive: 0xffb45e, emissiveIntensity: 0.2 });
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7d5d4b, map: woodTex.map, bumpMap: woodTex.bumpMap, bumpScale: 0.04, roughness: 0.95 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x8fb896, map: grassTex.map, bumpMap: grassTex.bumpMap, bumpScale: 0.04, roughness: 0.95 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0xc89f96, map: brickTex.map, bumpMap: brickTex.bumpMap, bumpScale: 0.055, roughness: 0.9 });
  const darkBrickMat = new THREE.MeshStandardMaterial({ color: 0xb08b86, map: darkBrickTex.map, bumpMap: darkBrickTex.bumpMap, bumpScale: 0.055, roughness: 0.92 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc4b6a4, map: stoneTex.map, bumpMap: stoneTex.bumpMap, bumpScale: 0.05, roughness: 0.86 });
  const paleStoneMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb8, map: paleStoneTex.map, bumpMap: paleStoneTex.bumpMap, bumpScale: 0.045, roughness: 0.8 });
  const benchWoodMat = new THREE.MeshStandardMaterial({ color: 0xb88d70, map: woodTex.map, bumpMap: woodTex.bumpMap, bumpScale: 0.04, roughness: 0.88 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x294831, roughness: 0.9, flatShading: true, bumpMap: microBump, bumpScale: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x345738, roughness: 0.9, flatShading: true, bumpMap: microBump, bumpScale: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x203e2b, roughness: 0.9, flatShading: true, bumpMap: microBump, bumpScale: 0.02 })
  ];
  city.materials = {
    metalMat, darkMetal, roofMat, curbMat, sidewalkMat, asphaltMat, glassMat, warmGlassMat,
    leafMats, treeTrunkMat, grassMat, brickMat, darkBrickMat, stoneMat, paleStoneMat, benchWoodMat,
    waterTex, microBump
  };

  const windowStyles = [
    KC.makeWindowTexture('#2d3644', '#0b111c', '#ffcf85', 0.34),
    KC.makeWindowTexture('#4a302b', '#150d11', '#ffb45e', 0.3),
    KC.makeWindowTexture('#3d3c44', '#101018', '#cfe4ff', 0.32),
    KC.makeWindowTexture('#1d2d39', '#091219', '#7fe8ff', 0.42),
    KC.makeWindowTexture('#372e40', '#120e18', '#ffd6a0', 0.36)
  ];
  const facadeMats = windowStyles.map((w) => new THREE.MeshStandardMaterial({
    map: w.map, emissiveMap: w.emissiveMap, bumpMap: w.bumpMap, bumpScale: 0.055,
    emissive: 0xffffff, emissiveIntensity: 1.28,
    roughness: 0.68, metalness: 0.18
  }));
  city.facadeMats = facadeMats;

  const awningMats = [
    new THREE.MeshStandardMaterial({ map: KC.makeStripedAwningTexture('#b82028', '#f2e8d5'), bumpMap: microBump, bumpScale: 0.02, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: KC.makeStripedAwningTexture('#1e5b40', '#f2e8d5'), bumpMap: microBump, bumpScale: 0.02, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: KC.makeStripedAwningTexture('#d98a26', '#1c1a22'), bumpMap: microBump, bumpScale: 0.02, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: KC.makeStripedAwningTexture('#243b5a', '#f2e8d5'), bumpMap: microBump, bumpScale: 0.02, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: KC.makeStripedAwningTexture('#7a283b', '#f5d799'), bumpMap: microBump, bumpScale: 0.02, roughness: 0.85 })
  ];
  city.awningMats = awningMats;

  /* Spatial grid indexing for O(1) collision queries */
  function insertColliderToGrid(c) {
    const cs = city.gridCellSize;
    const x0 = Math.floor(c.minX / cs), x1 = Math.floor(c.maxX / cs);
    const z0 = Math.floor(c.minZ / cs), z1 = Math.floor(c.maxZ / cs);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = gx + ',' + gz;
        let bucket = city.spatialGrid.get(key);
        if (!bucket) {
          bucket = [];
          city.spatialGrid.set(key, bucket);
        }
        bucket.push(c);
      }
    }
  }

  city.getNearbyColliders = function (x, z, r = 4) {
    const cs = city.gridCellSize;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const z0 = Math.floor((z - r) / cs), z1 = Math.floor((z + r) / cs);
    if (x0 === x1 && z0 === z1) {
      return city.spatialGrid.get(x0 + ',' + z0) || [];
    }
    const out = [];
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const bucket = city.spatialGrid.get(gx + ',' + gz);
        if (bucket) {
          for (let i = 0; i < bucket.length; i++) {
            const c = bucket[i];
            if (out.indexOf(c) === -1) out.push(c);
          }
        }
      }
    }
    return out;
  };

  const addCollider = (x, z, w, d, h = 10, tag = 'building') => {
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, x, z, w, d, h, tag, active: true };
    city.colliders.push(c);
    insertColliderToGrid(c);
    return c;
  };

  const registerCullItem = (mesh, x, z, maxDist = 145) => {
    city.cullItems.push({ mesh, x, z, maxDistSq: maxDist * maxDist });
  };
  city.registerCullItem = registerCullItem;

  const addBox = (w, h, d, mat, x, y, z, rotY = 0, opts = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (opts.windowUV) KC.scaleBoxUV(geo, w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    scene.add(mesh);
    if (opts.ray) city.rayMeshes.push(mesh);
    if (opts.cullDist) registerCullItem(mesh, x, z, opts.cullDist);
    return mesh;
  };

  const addCylinder = (rt, rb, h, seg, mat, x, y, z, opts = {}) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    scene.add(mesh);
    if (opts.ray) city.rayMeshes.push(mesh);
    if (opts.cullDist) registerCullItem(mesh, x, z, opts.cullDist);
    return mesh;
  };

  const addSign = (text, color, x, y, z, rotY, w = 8, h = 2, opts = {}) => {
    const tex = KC.makeSignTexture(text, color, opts.bg || null);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.renderOrder = 4;
    scene.add(mesh);
    registerCullItem(mesh, x, z, 155);
    let glow = null, gmat = null;
    if (opts.glow !== false) {
      gmat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.14, h * 1.5), gmat);
      glow.position.copy(mesh.position);
      glow.rotation.copy(mesh.rotation);
      glow.translateZ(-0.03);
      glow.renderOrder = 3;
      scene.add(glow);
      registerCullItem(glow, x, z, 135);
    }
    city.signs.push({ mesh, mat, glow, gmat, tex, baseOpacity: 1, baseGlow: 0.22 });
    return mesh;
  };

  const addGlowSprite = (color, x, y, z, scale, opacity = 0.5) => {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(scale, scale, 1);
    scene.add(s);
    city.lampGlows.push({ sprite: s, mat, baseOpacity: opacity });
    registerCullItem(s, x, z, 150);
    return s;
  };

  const addLightPool = (x, y, z, color, size, opacity = 0.24) => {
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    scene.add(mesh);
    city.lightPools.push({ mesh, mat, baseOpacity: opacity, x, z });
    registerCullItem(mesh, x, z, 135);
    return mesh;
  };

  /* Extended textured city ground (trimmed cleanly at Berkley Riverfront z = -194 so Missouri River is 100% visible!) */
  const cityGroundTex = KC.makePS1Texture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#25262c';
    ctx.fillRect(0, 0, w, h);
    let s = 307;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 360; i++) {
      ctx.fillStyle = r() < 0.5 ? '#1f2026' : '#2d2f36';
      ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 3), 2 + Math.floor(r() * 3));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
  }, 56, 46);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(680, 560),
    new THREE.MeshStandardMaterial({ map: cityGroundTex, roughness: 0.94, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.06, 86); // covers z from -194 to +366 (leaves Missouri River north of z = -194 wide open!)
  ground.receiveShadow = true;
  scene.add(ground);
  city.rayMeshes.push(ground);
  city.ground = ground;

  /* Sloping rocky/sandy Missouri River riverbed & Berkley Riverfront seawall embankment */
  const riverBedMat = new THREE.MeshStandardMaterial({ color: 0x2a2924, roughness: 0.98, flatShading: true });
  const riverBed = new THREE.Mesh(new THREE.PlaneGeometry(680, 290), riverBedMat);
  riverBed.rotation.x = -Math.PI / 2;
  riverBed.position.set(0, -1.75, -338);
  scene.add(riverBed);

  /* Sloped riprap embankment along z = -194..-204 */
  const bankSlope = new THREE.Mesh(new THREE.PlaneGeometry(680, 12), stoneMat);
  bankSlope.rotation.x = -Math.PI / 2 + 0.16;
  bankSlope.position.set(0, -0.88, -199.5);
  scene.add(bankSlope);

  /* Stone Berkley Riverfront Seawall with open marina access gaps at x = 40 and x = -56 */
  for (const seg of [{ x: -206, w: 266 }, { x: -8, w: 72 }, { x: 206, w: 300 }]) {
    addBox(seg.w, 1.15, 2.2, stoneMat, seg.x, 0.25, -193.2, 0, { collide: false, ray: true });
  }

  const roadSpan = 396;
  const roadGeoV = new THREE.PlaneGeometry(10, roadSpan);
  const roadGeoH = new THREE.PlaneGeometry(roadSpan, 10);
  for (const line of KC.ROAD_LINES) {
    const v = new THREE.Mesh(roadGeoV, asphaltMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(line, 0.005, 0);
    v.receiveShadow = true;
    scene.add(v);
    city.rayMeshes.push(v);
    const h = new THREE.Mesh(roadGeoH, asphaltMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.006, line);
    h.receiveShadow = true;
    scene.add(h);
    city.rayMeshes.push(h);
  }

  const dashGeo = new THREE.BoxGeometry(0.14, 0.02, 2.6);
  const dashes = [];
  for (const line of KC.ROAD_LINES) {
    for (let p = -188; p < 188; p += 8) {
      if (KC.ROAD_LINES.some((l) => Math.abs(p - l) < 6)) continue;
      dashes.push({ x: line, z: p, rot: 0 });
      dashes.push({ x: p, z: line, rot: Math.PI / 2 });
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, laneMat, dashes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  dashes.forEach((d, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
    m4.compose(new THREE.Vector3(d.x, 0.018, d.z), q, one);
    dashMesh.setMatrixAt(i, m4);
  });
  scene.add(dashMesh);

  const crossItems = [];
  for (const x of KC.ROAD_LINES) {
    for (const z of KC.ROAD_LINES) {
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 5; i++) {
          crossItems.push({ x: x + s * 6.3, z: z - 3.2 + i * 1.6, w: 2.8, d: 0.5 });
          crossItems.push({ x: x - 3.2 + i * 1.6, z: z + s * 6.3, w: 0.5, d: 2.8 });
        }
      }
    }
  }
  const crossGeo = new THREE.PlaneGeometry(1, 1);
  crossGeo.rotateX(-Math.PI / 2);
  const crossMesh = new THREE.InstancedMesh(crossGeo, crossMat, crossItems.length);
  crossItems.forEach((c, i) => {
    q.identity();
    m4.compose(new THREE.Vector3(c.x, 0.02, c.z), q, new THREE.Vector3(c.w, 1, c.d));
    crossMesh.setMatrixAt(i, m4);
  });
  scene.add(crossMesh);

  /* Instanced Sidewalk Slabs & Curbs (81 blocks in 2 draw calls!) */
  const blockData = [];
  const totalBlocks = (KC.ROAD_LINES.length - 1) * (KC.ROAD_LINES.length - 1);
  const slabInstanced = new THREE.InstancedMesh(new THREE.BoxGeometry(30, 0.14, 30), sidewalkMat, totalBlocks);
  const curbInstanced = new THREE.InstancedMesh(new THREE.BoxGeometry(30.5, 0.08, 30.5), curbMat, totalBlocks);
  slabInstanced.receiveShadow = true;
  curbInstanced.receiveShadow = true;
  let bIdx = 0;
  for (let i = 0; i < KC.ROAD_LINES.length - 1; i++) {
    for (let j = 0; j < KC.ROAD_LINES.length - 1; j++) {
      const cx = (KC.ROAD_LINES[i] + KC.ROAD_LINES[i + 1]) / 2;
      const cz = (KC.ROAD_LINES[j] + KC.ROAD_LINES[j + 1]) / 2;
      q.identity();
      m4.compose(new THREE.Vector3(cx, 0.07, cz), q, one);
      slabInstanced.setMatrixAt(bIdx, m4);
      m4.compose(new THREE.Vector3(cx, 0.03, cz), q, one);
      curbInstanced.setMatrixAt(bIdx, m4);
      bIdx++;
      const legacyKey = (i - 2) + ',' + (j - 2);
      blockData.push({ i, j, legacyKey, cx, cz, size: 30, landmark: null, name: null });
    }
  }
  scene.add(slabInstanced);
  scene.add(curbInstanced);

  const styles = facadeMats;
  const waterTowerMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2f, roughness: 0.9, metalness: 0.15 });

  function createBuilding(x, z, w, d, h, opts = {}) {
    const style = opts.style != null ? opts.style : KC.randInt(0, styles.length - 1);
    const side = styles[style];
    const geo = new THREE.BoxGeometry(w, h, d);
    KC.scaleBoxUV(geo, w, h, d);
    const mesh = new THREE.Mesh(geo, [side, side, roofMat, roofMat, side, side]);
    mesh.position.set(x, 0.14 + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    city.rayMeshes.push(mesh);
    addCollider(x, z, w, d, h);
    city.blocks.push({ x, z, w, d, h, style, kind: 'building', mesh });

    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 3.1, d + 0.25), glassMat);
    band.position.set(x, 1.69, z);
    band.receiveShadow = true;
    scene.add(band);
    registerCullItem(band, x, z, 155);

    /* Storefront striped awnings & ground-floor KC business trim for street-level life */
    const awningMat = KC.pick(awningMats);
    const sideChoice = opts.signSide || KC.pick(['n', 's', 'e', 'w']);
    if (Math.random() < 0.76) {
      let ax = x, az = z, aw = w * 0.78, ad = 1.45;
      if (sideChoice === 'n') { az = z - d / 2 - 0.65; }
      else if (sideChoice === 's') { az = z + d / 2 + 0.65; }
      else if (sideChoice === 'e') { ax = x + w / 2 + 0.65; aw = 1.45; ad = d * 0.78; }
      else if (sideChoice === 'w') { ax = x - w / 2 - 0.65; aw = 1.45; ad = d * 0.78; }
      addBox(aw, 0.26, ad, awningMat, ax, 3.25, az, 0, { cast: false, cullDist: 130 });
    }

    if (h > 12) {
      const count = KC.randInt(1, 2);
      for (let k = 0; k < count; k++) {
        const bw = KC.rand(1.2, 3.4), bd = KC.rand(1.2, 3), bh = KC.rand(0.6, 1.6);
        addBox(bw, bh, bd, metalMat, x + KC.rand(-w * 0.3, w * 0.3), 0.14 + h + bh / 2, z + KC.rand(-d * 0.3, d * 0.3), 0, { cast: false, cullDist: 120 });
      }
      if (h > 34 && Math.random() < 0.5) {
        addCylinder(0.06, 0.09, KC.rand(5, 11), 4, darkMetal, x, 0.14 + h + 4, z, { cast: false, cullDist: 140 });
        addGlowSprite(0xff3b3b, x, 0.14 + h + 9, z, 0.9, 0.7);
      }
    }
    if (h < 18 && Math.random() < 0.24) {
      const tx = x + KC.rand(-w * 0.25, w * 0.25), tz = z + KC.rand(-d * 0.25, d * 0.25);
      addCylinder(1.3, 1.3, 2.4, 7, waterTowerMat, tx, 0.14 + h + 3.2, tz, { cast: false, cullDist: 125 });
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 7), roofMat);
      cap.position.set(tx, 0.14 + h + 4.85, tz);
      scene.add(cap);
      registerCullItem(cap, tx, tz, 125);
    }

    if (opts.sign) {
      const colors = ['#ffb13b', '#ff5f8f', '#57e6c2', '#65b8ff', '#ff4b3a', '#9df5c8'];
      const color = opts.signColor || KC.pick(colors);
      let sx = x, sz = z, ry = 0, sw = Math.min(w * 0.82, 10.5), sh = Math.min(2.3, h * 0.2);
      const yy = opts.signY || Math.min(0.14 + h - 2.2, KC.rand(4.5, 14.5));
      if (sideChoice === 'n') { sz = z - d / 2 - 0.16; ry = Math.PI; }
      if (sideChoice === 's') { sz = z + d / 2 + 0.16; ry = 0; }
      if (sideChoice === 'e') { sx = x + w / 2 + 0.16; ry = Math.PI / 2; sw = Math.min(d * 0.82, 10.5); }
      if (sideChoice === 'w') { sx = x - w / 2 - 0.16; ry = -Math.PI / 2; sw = Math.min(d * 0.82, 10.5); }
      addSign(opts.sign, color, sx, yy, sz, ry, sw, sh, { bg: opts.signBg || null });
    }
    return mesh;
  }

  /* 9 original KC landmarks + 6 new extended map landmarks = 15 KC landmarks! */
  const landmarkSlots = {
    '2,2': 'Power & Light',
    '3,3': 'Kauffman Center',
    '2,4': 'Union Station',
    '1,4': 'Liberty Memorial',
    '3,2': 'T-Mobile Center',
    '2,0': 'River Market',
    '4,3': '18th & Vine',
    '0,3': 'Westport',
    '3,4': 'Crown Center',
    '1,2': 'Bartle Hall',
    '2,-2': 'Berkley Riverfront',
    '-2,1': 'West Bottoms',
    '0,6': 'Country Club Plaza',
    '5,1': 'East Crossroads',
    '4,-1': 'Columbus Park'
  };

  const signWords = [
    'ARTHUR BRYANT BBQ', 'GATES BAR-B-Q', 'JOES KC BBQ', 'Q39 BBQ & GRILL',
    'JACK STACK BBQ', 'BOULEVARD BREW', 'THE ROASTERIE', 'GREEN LADY JAZZ',
    'TOWN TOPIC 24H', 'WINSTEADS DINER', 'HALLMARK CARDS', 'H&R BLOCK HQ',
    'GARMIN KC', 'COMMERCE BANK', 'UMB FINANCIAL', 'CHARLIE HUSTLE',
    'MESSENGER CAFE', 'KELLYS WESTPORT', 'MIDLAND THEATRE', 'UP-DOWN ARCADE',
    'ALAMO DRAFTHOUSE', 'BLUE ROOM JAZZ', 'LC BAR-B-Q', 'SAVOY GRILL',
    'PHOENIX JAZZ', 'BROADWAY CAFE', 'RIVERFRONT LOFTS', 'CROSSROADS ART'
  ];

  for (const b of blockData) {
    const key = b.legacyKey;
    if (landmarkSlots[key]) {
      b.landmark = landmarkSlots[key];
      b.name = landmarkSlots[key];
      continue;
    }
    b.name = 'BLOCK ' + b.i + '-' + b.j;
    const isOuter = Math.abs(b.cx) > 100 || Math.abs(b.cz) > 100;
    const isPark = Math.random() < (isOuter ? 0.14 : 0.08);
    if (isPark) {
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(25, 0.08, 25), grassMat);
      lawn.position.set(b.cx, 0.17, b.cz);
      lawn.receiveShadow = true;
      scene.add(lawn);
      /* Diagonal stone park walkways & "City of Fountains" centerpiece */
      addBox(2.0, 0.04, 24.6, curbMat, b.cx, 0.215, b.cz, 0, { cast: false, cullDist: 135 });
      addBox(24.6, 0.04, 2.0, curbMat, b.cx, 0.216, b.cz, 0, { cast: false, cullDist: 135 });
      addCylinder(2.4, 2.6, 0.48, 10, stoneMat, b.cx, 0.38, b.cz, { cast: true, cullDist: 135 });
      addCylinder(2.0, 2.0, 0.12, 10, new THREE.MeshBasicMaterial({ color: 0x39b8b8, toneMapped: false }), b.cx, 0.62, b.cz, { cast: false, cullDist: 135 });
      addCylinder(0.55, 0.75, 1.4, 8, paleStoneMat, b.cx, 0.95, b.cz, { cast: true, cullDist: 130 });
      const jet = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 1.65, 7),
        new THREE.MeshBasicMaterial({ color: 0x7ff5e6, transparent: true, opacity: 0.78, toneMapped: false })
      );
      jet.position.set(b.cx, 2.0, b.cz);
      scene.add(jet);
      registerCullItem(jet, b.cx, b.cz, 125);
      addCollider(b.cx, b.cz, 4.6, 4.6, 1.8, 'landmark');
      city.updaters.push((t) => {
        if (!jet.visible) return;
        const pulse = 0.85 + Math.sin(t * 7.5 + b.cx) * 0.18;
        jet.scale.set(pulse, 0.9 + Math.cos(t * 9.2 + b.cz) * 0.22, pulse);
        jet.rotation.y = t * 1.8;
      });
      b.park = true;
      continue;
    }

    const dist = Math.hypot(b.cx, b.cz + 20);
    const tallness = KC.clamp(1 - dist / 210, 0.04, 1);
    const countRoll = Math.random();
    let slots;
    if (countRoll < 0.3) slots = [[0, 0]];
    else if (countRoll < 0.64) slots = Math.random() < 0.5 ? [[-7.5, 0], [7.5, 0]] : [[0, -7.5], [0, 7.5]];
    else if (countRoll < 0.86) slots = [[-7.5, -7.5], [7.5, -7.5], [0, 7.5]];
    else slots = [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]];

    for (let si = 0; si < slots.length; si++) {
      const [ox, oz] = slots[si];
      const big = slots.length === 1;
      const w = big ? KC.rand(18, 22) : KC.rand(10, 12.5);
      const d = big ? KC.rand(17, 21) : KC.rand(10, 12.5);
      let h = (big ? KC.rand(12, 26) : KC.rand(7, 17)) + tallness * KC.rand(10, 48);
      if (tallness > 0.65 && Math.random() < 0.22) h += KC.rand(12, 28);
      h = Math.min(h, 76);
      const x = b.cx + ox, z = b.cz + oz;
      const sign = Math.random() < 0.72 ? KC.pick(signWords) : null;
      const signSide = ox > 3 ? 'e' : ox < -3 ? 'w' : (oz > 3 ? 's' : 'n');
      createBuilding(x, z, w, d, h, { sign, signSide, style: KC.randInt(0, 4) });
    }

    if (Math.random() < 0.5) {
      for (let k = 0; k < 2; k++) {
        const side = KC.randInt(0, 3);
        const off = 14.1;
        const t = KC.rand(-12, 12);
        let px = b.cx, pz = b.cz;
        if (side === 0) { px += t; pz -= off; }
        if (side === 1) { px += t; pz += off; }
        if (side === 2) { px += off; pz += t; }
        if (side === 3) { px -= off; pz += t; }
        city.pedSpots.push({ x: px, z: pz });
      }
    }
  }

  /* Distance & frustum culling to ensure no unwanted off-range detail assets render */
  city.updateCulling = function (px, pz) {
    const items = city.cullItems;
    for (let i = 0, len = items.length; i < len; i++) {
      const it = items[i];
      if (!it.mesh || it.mesh.userData.destroyed) continue;
      const dx = it.x - px, dz = it.z - pz;
      it.mesh.visible = (dx * dx + dz * dz) <= it.maxDistSq;
    }
  };

  city.blockData = blockData;
  city.addBox = addBox;
  city.addCylinder = addCylinder;
  city.addSign = addSign;
  city.addGlowSprite = addGlowSprite;
  city.addLightPool = addLightPool;
  city.addCollider = addCollider;
  city.insertColliderToGrid = insertColliderToGrid;
  city.createBuilding = createBuilding;
  city.glowTex = glowTex;
  city.poolTex = poolTex;
  city.landmarkSlots = landmarkSlots;

  KC.buildLandmarks(city, blockData);
  KC.buildProps(city, blockData);

  return city;
};

/* ============================================================
   PS1 Procedural Pixel-Art Texture Helpers (NearestFilter)
   ============================================================ */
KC.makePS1Texture = function (w, h, drawFn, repX = 1, repY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  drawFn(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.needsUpdate = true;
  return t;
};

KC.makeCamoTexture = function (palette = ['#3b4931', '#283322', '#525838', '#1e241a']) {
  return KC.makePS1Texture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, w, h);
    let seed = 1337;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 42; i++) {
      ctx.fillStyle = palette[1 + Math.floor(rng() * (palette.length - 1))];
      const x = Math.floor(rng() * w);
      const y = Math.floor(rng() * h);
      const bw = 3 + Math.floor(rng() * 7);
      const bh = 2 + Math.floor(rng() * 6);
      ctx.fillRect(x, y, bw, bh);
      if (x + bw > w) ctx.fillRect(x - w, y, bw, bh);
      if (y + bh > h) ctx.fillRect(x, y - h, bw, bh);
    }
    /* Subtle fabric weave grain */
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        ctx.fillStyle = (x + y) % 4 === 0 ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.04)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, 1, 1);
};

/* ============================================================
   BATTLEFIELD MODE — Operation Heartland (Missouri Riverfront)
   Full combined-arms land / sea / air conquest map overhaul
   ============================================================ */
KC.buildBattlefield = function (scene) {
  const city = {
    gameMode: 'bf',
    scene,
    colliders: [],
    propColliders: [],
    destructibleProps: [],
    spatialGrid: new Map(),
    gridCellSize: 28,
    rayMeshes: [],
    blocks: [],
    landmarks: {},
    updaters: [],
    trafficSpots: [],
    parkedSpots: [],
    pedSpots: [],
    signs: [],
    lampGlows: [],
    lightPools: [],
    streetLamps: [],
    cullItems: [],
    facadeMats: [],
    mapData: null,
    vehicleSpots: [],
    shops: [],
    vendorCarts: [],
    glowTex: null,
    poolTex: null,
    water: null,
    zones: []
  };

  /* Fast Spatial Collider Grid */
  const cellSize = city.gridCellSize;
  const gridKey = (cx, cz) => cx + ',' + cz;
  function insertColliderToGrid(c) {
    const minCX = Math.floor(c.minX / cellSize);
    const maxCX = Math.floor(c.maxX / cellSize);
    const minCZ = Math.floor(c.minZ / cellSize);
    const maxCZ = Math.floor(c.maxZ / cellSize);
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const k = gridKey(cx, cz);
        let bucket = city.spatialGrid.get(k);
        if (!bucket) { bucket = []; city.spatialGrid.set(k, bucket); }
        bucket.push(c);
      }
    }
  }
  city.insertColliderToGrid = insertColliderToGrid;

  const queryStamp = { v: 1 };
  city.getNearbyColliders = function (x, z, r) {
    const stamp = ++queryStamp.v;
    const out = [];
    const minCX = Math.floor((x - r) / cellSize);
    const maxCX = Math.floor((x + r) / cellSize);
    const minCZ = Math.floor((z - r) / cellSize);
    const maxCZ = Math.floor((z + r) / cellSize);
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = city.spatialGrid.get(gridKey(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const c = bucket[i];
          if (c._q === stamp) continue;
          c._q = stamp;
          out.push(c);
        }
      }
    }
    return out;
  };

  function addCollider(x, z, w, d, h = 10, tag = 'building') {
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, x, z, w, d, h, tag, active: true, _q: 0 };
    city.colliders.push(c);
    insertColliderToGrid(c);
    return c;
  }
  city.addCollider = addCollider;

  const addBox = (w, h, d, mat, x, y, z, rotY = 0, opts = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    scene.add(mesh);
    if (opts.ray !== false) city.rayMeshes.push(mesh);
    if (opts.collide) {
      /* Match exact world footprint for 90-degree rotations */
      const swapped = Math.abs(Math.sin(rotY)) > 0.707;
      addCollider(x, z, swapped ? d : w, swapped ? w : d, h, opts.tag || 'building');
    }
    return mesh;
  };
  city.addBox = addBox;

  const addCylinder = (rt, rb, h, seg, mat, x, y, z, opts = {}) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    scene.add(mesh);
    if (opts.ray !== false) city.rayMeshes.push(mesh);
    if (opts.collide) {
      const r = Math.max(rt, rb) * 2;
      addCollider(x, z, r, r, h, opts.tag || 'prop');
    }
    return mesh;
  };
  city.addCylinder = addCylinder;

  const addSign = (text, color, x, y, z, rotY, w = 8, h = 2, opts = {}) => {
    const tex = KC.makeSignTexture(text, color, opts.bg || null);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    city.signs.push({ mesh, gmat: null, baseGlow: 0 });
    return mesh;
  };
  city.addSign = addSign;

  const glowTex = KC.makeGlowTexture();
  const poolTex = KC.makeLightPoolTexture();
  city.glowTex = glowTex;
  city.poolTex = poolTex;

  const addGlowSprite = (color, x, y, z, scale, opacity = 0.5, nightOnly = false) => {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(scale, scale, 1);
    scene.add(s);
    if (nightOnly) city.lampGlows.push({ mat, baseOpacity: opacity });
    return s;
  };
  city.addGlowSprite = addGlowSprite;

  const addLightPool = (x, y, z, color, size, opacity = 0.24) => {
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    city.lightPools.push({ mat, baseOpacity: opacity });
    return mesh;
  };
  city.addLightPool = addLightPool;
  city.registerCullItem = function () {};
  city.createBuilding = function () {};

  /* ---------- Authentic PS1 Pixelated Procedural Materials (128x128 Rich Detail) ---------- */
  const terrainTex = KC.makePS1Texture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3d4c30';
    ctx.fillRect(0, 0, w, h);
    let s = 901;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    /* Layered turf blotches, prairie grass, damp mud patches & gravel pebbles */
    const blotches = ['#314026', '#465836', '#4c5234', '#38452a', '#554d38', '#2c3821'];
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = blotches[Math.floor(r() * blotches.length)];
      ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 3 + Math.floor(r() * 8), 3 + Math.floor(r() * 7));
    }
    /* Crisp grass blades & micro-pebbles */
    for (let i = 0; i < 900; i++) {
      const x = Math.floor(r() * w), y = Math.floor(r() * h);
      const roll = r();
      ctx.fillStyle = roll < 0.45 ? '#586c3e' : roll < 0.78 ? '#27311d' : '#6c634a';
      ctx.fillRect(x, y, roll < 0.7 ? 1 : 2, roll < 0.45 ? 3 : 2);
    }
  }, 46, 56);

  const sandTex = KC.makePS1Texture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#9b8d69';
    ctx.fillRect(0, 0, w, h);
    let s = 412;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 520; i++) {
      const roll = r();
      ctx.fillStyle = roll < 0.4 ? '#847656' : roll < 0.8 ? '#afa17d' : '#655c48';
      ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2 + Math.floor(r() * 3), 2);
    }
    /* Wind/tide ripple lines */
    ctx.fillStyle = 'rgba(72, 60, 40, 0.16)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
  }, 6, 48);

  const woodTex = KC.makePS1Texture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#5e4833';
    ctx.fillRect(0, 0, w, h);
    let s = 519;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? '#67503a' : '#533e2b';
      ctx.fillRect(0, y, w, 7);
      ctx.fillStyle = '#2d2116';
      ctx.fillRect(0, y + 7, w, 1);
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,235,205,0.08)';
      ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 5 + Math.floor(r() * 8), 1);
    }
  }, 4, 2);

  const concreteTex = KC.makePS1Texture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#65696e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < 380; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.09)';
      ctx.fillRect((i * 19) % w, (i * 29) % h, 2, 2);
    }
  }, 2, 2);

  const roadTex = KC.makePS1Texture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2c2f34';
    ctx.fillRect(0, 0, w, h);
    /* Gravel shoulders & worn wheel ruts */
    ctx.fillStyle = '#3b3b38';
    ctx.fillRect(0, 0, 4, h);
    ctx.fillRect(w - 4, 0, 4, h);
    ctx.fillStyle = '#24272c';
    ctx.fillRect(14, 0, 9, h);
    ctx.fillRect(w - 23, 0, 9, h);
    for (let i = 0; i < 540; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#23262b' : '#393d44';
      ctx.fillRect((i * 17) % w, (i * 31) % h, 2, 3);
    }
    /* Edge lines */
    ctx.fillStyle = '#908f84';
    ctx.fillRect(5, 0, 2, h);
    ctx.fillRect(w - 7, 0, 2, h);
    /* Dashed yellow centerline */
    ctx.fillStyle = '#d4a93c';
    ctx.fillRect(w / 2 - 1, 10, 3, 40);
    ctx.fillRect(w / 2 - 1, 74, 3, 40);
  }, 1, 20);

  const runwayTex = KC.makePS1Texture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#292c30';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#23262a' : '#32363b';
      ctx.fillRect((i * 23) % w, (i * 41) % h, 2, 3);
    }
    ctx.fillStyle = '#cfd3d8';
    ctx.fillRect(4, 0, 2, h);
    ctx.fillRect(w - 6, 0, 2, h);
    ctx.fillRect(w / 2 - 2, 8, 4, 24);
    ctx.fillRect(w / 2 - 2, 42, 4, 18);
  }, 1, 9);

  const sandbagTex = KC.makePS1Texture(32, 16, (ctx, w, h) => {
    ctx.fillStyle = '#8b7b59';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = (row % 2) * 4;
      for (let x = -4; x < w + 4; x += 8) {
        ctx.fillStyle = (x + row) % 3 === 0 ? '#978663' : '#7f7050';
        ctx.fillRect(x + off + 1, y + 1, 6, 3);
        ctx.fillStyle = '#594e38';
        ctx.fillRect(x + off, y, 8, 1);
      }
    }
  }, 2, 1);

  const makeContainerMat = (baseHex, darkHex) => {
    const tex = KC.makePS1Texture(32, 16, (ctx, w, h) => {
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = darkHex;
        ctx.fillRect(x, 0, 2, h);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h - 2, w, 2);
    }, 2, 1);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.35, flatShading: true });
  };

  const groundMat = new THREE.MeshStandardMaterial({ map: terrainTex, vertexColors: true, roughness: 0.95, flatShading: true });
  const hillMat = new THREE.MeshStandardMaterial({ map: terrainTex, color: 0x6f765a, roughness: 0.96, flatShading: true });
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0x706c64, roughness: 0.94, flatShading: true });
  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.88, metalness: 0.12, flatShading: true });
  const darkConcreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0x7a7e84, roughness: 0.9, metalness: 0.15, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x38414a, roughness: 0.52, metalness: 0.65, flatShading: true });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x5d3928, roughness: 0.88, metalness: 0.35, flatShading: true });
  const oliveMat = new THREE.MeshStandardMaterial({ map: KC.makeCamoTexture(), roughness: 0.86, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.92, flatShading: true });
  const sandbagMat = new THREE.MeshStandardMaterial({ map: sandbagTex, roughness: 0.96, flatShading: true });
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, flatShading: true });
  const runwayMat = new THREE.MeshStandardMaterial({ map: runwayTex, roughness: 0.9, flatShading: true });
  const containerRed = makeContainerMat('#7a322c', '#59221d');
  const containerBlue = makeContainerMat('#2b4a68', '#1d344a');
  const containerOlive = makeContainerMat('#425134', '#2e3a24');
  const containerTan = makeContainerMat('#8b7854', '#695a3d');
  const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xffd39a, toneMapped: false });
  city.lampBulbMat = lampBulbMat;
  city.materials = { waterTex: null, microBump: null };

  /* ---------- Sculpted Vertex-Colored Terrain, Missouri Riverbed & Animated Water ---------- */
  const terrainGeo = new THREE.PlaneGeometry(580, 760, 76, 96);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  const tCols = new Float32Array(tPos.count * 3);
  const cGrass = new THREE.Color(0x9cb383);
  const cMud = new THREE.Color(0x887b5e);
  const cSand = new THREE.Color(0xcab991);
  const cRock = new THREE.Color(0x8c877c);
  const cDarkBed = new THREE.Color(0x3a3a33);
  const tmpC = new THREE.Color();

  for (let i = 0; i < tPos.count; i++) {
    const lx = tPos.getX(i);
    const lz = tPos.getZ(i);
    /* World coords when mesh placed at x = 132 (spans x: -158 .. +422) */
    const wx = lx + 132;
    const wz = lz;

    let y = -0.05;
    tmpC.copy(cGrass);

    /* Organic biome color variation across combat valley */
    const nA = Math.sin(wx * 0.042 + wz * 0.031) * 0.5 + Math.cos(wx * 0.023 - wz * 0.052) * 0.5;
    if (nA > 0.25) tmpC.lerp(cMud, (nA - 0.25) * 0.6);

    /* Western Missouri Riverbank: smoothly slopes down below water level (-0.16) into submerged riverbed (-1.75) */
    if (wx < -130) {
      const t = KC.clamp((-130 - wx) / 26, 0, 1);
      y = -0.05 - t * t * 1.75;
      tmpC.copy(cSand).lerp(cDarkBed, KC.clamp((t - 0.35) / 0.65, 0, 1));
    } else if (wx < -118) {
      const t = KC.clamp((-118 - wx) / 12, 0, 1);
      tmpC.lerp(cSand, t * 0.72);
    } else {
      /* Sculpted Eastern Limestone Bluffs & Rolling Valley Perimeter Hills (outside playable runway/base grid) */
      let hillH = 0;
      if (wx > 236) {
        const et = KC.clamp((wx - 236) / 68, 0, 1);
        hillH = Math.max(hillH, et * et * (16 + Math.sin(wz * 0.032) * 6.5 + Math.cos(wx * 0.05 + wz * 0.02) * 4.5));
      }
      if (Math.abs(wz) > 232) {
        const nt = KC.clamp((Math.abs(wz) - 232) / 64, 0, 1);
        hillH = Math.max(hillH, nt * nt * (14 + Math.cos(wx * 0.035) * 5.5 + Math.sin(wz * 0.045) * 3.5));
      }
      if (hillH > 0.05) {
        y = -0.05 + hillH;
        tmpC.lerp(cRock, KC.clamp(hillH / 12, 0, 0.85));
      }
    }

    tPos.setY(i, y);
    tCols[i * 3] = tmpC.r;
    tCols[i * 3 + 1] = tmpC.g;
    tCols[i * 3 + 2] = tmpC.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCols, 3));
  terrainGeo.computeVertexNormals();

  const ground = new THREE.Mesh(terrainGeo, groundMat);
  ground.position.set(132, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  city.rayMeshes.push(ground);

  /* Submerged Western Riverbed Extension (x = -460 .. -150 at y = -1.8) */
  const riverBed = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 780),
    new THREE.MeshStandardMaterial({ color: 0x242622, roughness: 0.98, flatShading: true })
  );
  riverBed.rotation.x = -Math.PI / 2;
  riverBed.position.set(-310, -1.82, 0);
  scene.add(riverBed);

  /* Missouri River Animated GLSL Water Surface (x = -450 .. -140, completely UNCOVERED at y = -0.16!) */
  const waterObj = KC.createWaterSurface(316, 780, { shoreAxis: 'x', shoreEdge: -140 });
  const sea = waterObj.mesh;
  sea.position.set(-296, -0.16, 0);
  scene.add(sea);
  city.water = sea;
  city.waterUniforms = waterObj.uniforms;
  city.updaters.push((t) => {
    waterObj.uniforms.uTime.value = t;
  });

  /* Natural Shoreline Boulders & River Reeds along the Missouri Riverbank */
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x455a2c, roughness: 0.95, flatShading: true });
  for (let bz = -220; bz <= 220; bz += 18) {
    /* Leave clear landings at the piers and central beach */
    if (Math.abs(bz - 110) < 16 || Math.abs(bz + 20) < 12 || Math.abs(bz + 142) < 14 || Math.abs(bz - 18) < 16) continue;
    const rx = -139 - ((Math.abs(bz * 7) % 6));
    const rs = 0.8 + ((Math.abs(bz * 13) % 10) * 0.14);
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), rockMat);
    boulder.position.set(rx, rs * 0.35 - 0.15, bz);
    boulder.scale.set(1.2, 0.72, 1.0);
    boulder.rotation.set(bz * 0.2, bz * 0.5, 0);
    boulder.receiveShadow = true;
    scene.add(boulder);
    if (Math.abs(bz) % 36 === 0) {
      for (let k = 0; k < 4; k++) {
        const reed = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35 + (k % 2) * 0.35, 0.12), reedMat);
        reed.position.set(rx + 2.2 + k * 0.45, 0.55, bz + (k - 1.5) * 0.5);
        reed.rotation.z = (k - 1.5) * 0.12;
        scene.add(reed);
      }
    }
  }

  /* Concrete river seawall segments (with wide open beach & pier landing gaps) */
  for (const seg of [{ z: -200, l: 74 }, { z: -80, l: 78 }, { z: 205, l: 110 }]) {
    addBox(2.2, 1.4, seg.l, darkConcreteMat, -133, 0.65, seg.z, 0, { collide: true, tag: 'wall' });
  }

  /* Paved Main Highway (North-South at x = 20) & Crossroad (East-West at z = 0) */
  const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(14, 460), roadMat);
  nsRoad.rotation.x = -Math.PI / 2;
  nsRoad.position.set(20, 0.015, 0);
  nsRoad.receiveShadow = true;
  scene.add(nsRoad);

  const ewRoadTex = roadTex.clone();
  ewRoadTex.needsUpdate = true;
  ewRoadTex.repeat.set(1, 16);
  const ewRoad = new THREE.Mesh(new THREE.PlaneGeometry(14, 340), new THREE.MeshStandardMaterial({ map: ewRoadTex, roughness: 0.92, flatShading: true }));
  ewRoad.rotation.x = -Math.PI / 2;
  ewRoad.rotation.z = Math.PI / 2;
  ewRoad.position.set(20, 0.02, 0);
  ewRoad.receiveShadow = true;
  scene.add(ewRoad);

  /* Spur roads to ECHO (south-east), ALPHA (north-west), DELTA (south-west), BRAVO (north-east) */
  const addSpur = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x33353a, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  addSpur(72, 145, 108, 10);    /* Highway -> ECHO */
  addSpur(-15, -185, 82, 10);   /* Highway -> ALPHA */
  addSpur(-45, 110, 134, 10);   /* Highway -> DELTA */
  addSpur(85, -105, 134, 10);   /* Highway -> BRAVO */
  addSpur(105, 25, 165, 10);    /* Highway -> FOXTROT Airfield */

  /* Helper: Floodlight Tower */
  function addFloodlight(x, z, color = 0xffe4b2) {
    addCylinder(0.14, 0.22, 9.5, 6, metalMat, x, 4.75, z, { collide: true, tag: 'prop' });
    addBox(1.4, 0.38, 0.45, metalMat, x, 9.5, z);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.16), lampBulbMat);
    bulb.position.set(x, 9.45, z);
    scene.add(bulb);
    addGlowSprite(color, x, 9.4, z, 5.5, 0.42, true);
    addLightPool(x, 0.06, z, color, 16, 0.22);
    city.streetLamps.push({ x, z });
  }

  /* Helper: Sandbag Cover Wall (exact axis-aligned collider) */
  function addSandbagWall(x, z, len = 6, alongZ = false) {
    const w = alongZ ? 0.9 : len;
    const d = alongZ ? len : 0.9;
    addBox(w, 1.15, d, sandbagMat, x, 0.575, z, 0, { collide: true, tag: 'prop' });
  }

  /* Helper: Guard Watchtower */
  function addWatchtower(x, z) {
    for (const ox of [-1.7, 1.7]) {
      for (const oz of [-1.7, 1.7]) {
        addBox(0.32, 6.2, 0.32, woodMat, x + ox, 3.1, z + oz, 0, { collide: true, tag: 'prop' });
      }
    }
    addBox(4.2, 0.35, 4.2, woodMat, x, 6.1, z);
    addBox(4.2, 1.1, 0.2, darkConcreteMat, x, 6.8, z - 2.0);
    addBox(4.2, 1.1, 0.2, darkConcreteMat, x, 6.8, z + 2.0);
    addBox(0.2, 1.1, 4.0, darkConcreteMat, x - 2.0, 6.8, z);
    addBox(0.2, 1.1, 4.0, darkConcreteMat, x + 2.0, 6.8, z);
    addBox(4.8, 0.28, 4.8, metalMat, x, 8.9, z);
    addGlowSprite(0xff5b3a, x, 9.2, z, 2.2, 0.65, false);
  }

  /* Helper: Open-doorway Tactical Bunker (players can enter and shoot out!) */
  function addBunker(x, z, w = 10, d = 8, h = 3.8, doorSide = 'south') {
    const t = 0.65;
    /* Roof */
    addBox(w + 0.5, 0.55, d + 0.5, darkConcreteMat, x, h + 0.25, z);
    /* Floor slab */
    addBox(w, 0.14, d, concreteMat, x, 0.05, z);
    /* North wall */
    if (doorSide === 'north') {
      addBox(w * 0.34, h, t, concreteMat, x - w * 0.33, h / 2, z - d / 2, 0, { collide: true });
      addBox(w * 0.34, h, t, concreteMat, x + w * 0.33, h / 2, z - d / 2, 0, { collide: true });
    } else {
      addBox(w, h, t, concreteMat, x, h / 2, z - d / 2, 0, { collide: true });
    }
    /* South wall */
    if (doorSide === 'south') {
      addBox(w * 0.34, h, t, concreteMat, x - w * 0.33, h / 2, z + d / 2, 0, { collide: true });
      addBox(w * 0.34, h, t, concreteMat, x + w * 0.33, h / 2, z + d / 2, 0, { collide: true });
    } else {
      addBox(w, h, t, concreteMat, x, h / 2, z + d / 2, 0, { collide: true });
    }
    /* West & East walls */
    addBox(t, h, d, concreteMat, x - w / 2, h / 2, z, 0, { collide: true });
    addBox(t, h, d, concreteMat, x + w / 2, h / 2, z, 0, { collide: true });
  }

  /* Helper: Helipad marking */
  function addHelipad(x, z) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.8, 0.2, 12), darkConcreteMat);
    pad.position.set(x, 0.08, z);
    pad.receiveShadow = true;
    scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 7.2, 16), new THREE.MeshBasicMaterial({ color: 0xe6b43c, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.2, z);
    scene.add(ring);
    const hMat = new THREE.MeshBasicMaterial({ color: 0xe6b43c, side: THREE.DoubleSide });
    for (const ox of [-1.8, 1.8]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 5.2), hMat);
      bar.rotation.x = -Math.PI / 2; bar.position.set(x + ox, 0.21, z); scene.add(bar);
    }
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), hMat);
    cross.rotation.x = -Math.PI / 2; cross.position.set(x, 0.21, z); scene.add(cross);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      addGlowSprite(0xffb13b, x + Math.cos(a) * 8.2, 0.6, z + Math.sin(a) * 8.2, 1.8, 0.65, false);
    }
  }

  /* ============================================================
     SECTOR STRUCTURES (6 Handcrafted Tactical Zones)
     ============================================================ */

  /* --- 1. SECTOR ALPHA: NORTH FORTRESS (OPFOR MAIN BASE, x: -50, z: -185) --- */
  addBunker(-68, -198, 14, 10, 4.2, 'south');
  addBunker(-32, -198, 12, 9, 3.8, 'south');
  addWatchtower(-82, -168);
  addWatchtower(-18, -168);
  /* Rotating Radar Dish on Alpha Bunker */
  const radarPivot = new THREE.Group();
  radarPivot.position.set(-68, 5.6, -198);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 0.4, 1.2, 8), metalMat);
  dish.rotation.x = Math.PI * 0.35;
  radarPivot.add(dish);
  scene.add(radarPivot);
  city.updaters.push((t) => { radarPivot.rotation.y = t * 0.9; });
  /* Perimeter blast walls with wide gates */
  addBox(22, 3.0, 1.0, darkConcreteMat, -74, 1.5, -162, 0, { collide: true });
  addBox(22, 3.0, 1.0, darkConcreteMat, -26, 1.5, -162, 0, { collide: true });
  addSandbagWall(-50, -169, 8, false);
  addHelipad(-88, -192);
  addFloodlight(-50, -166, 0xff8a7a);
  addSign('SECTOR ALPHA // FORTRESS', '#ff5b5b', -50, 5.2, -161.4, 0, 10, 2);

  /* --- 2. SECTOR BRAVO: ARTILLERY RIDGE (EAST HIGH GROUND, x: 145, z: -105) --- */
  /* Terraced low-poly rocky ridge backdrop (east side behind cover) */
  addBox(22, 7.5, 42, hillMat, 182, 3.6, -105, 0, { collide: true, tag: 'hill' });
  addBox(14, 4.2, 34, hillMat, 168, 2.0, -105, 0, { collide: true, tag: 'hill' });
  /* Two 155mm Howitzer Artillery Emplacements */
  for (const az of [-118, -92]) {
    addSandbagWall(132, az, 9, true);
    addSandbagWall(140, az - 5.5, 8, false);
    addSandbagWall(140, az + 5.5, 8, false);
    /* Gun carriage & long barrel */
    addBox(2.6, 1.1, 3.2, oliveMat, 144, 0.9, az, 0, { collide: true, tag: 'prop' });
    const barrel = addCylinder(0.22, 0.32, 7.2, 6, metalMat, 139.5, 2.1, az, { rotZ: Math.PI * 0.42 });
    barrel.castShadow = true;
  }
  addBunker(154, -124, 10, 8, 3.6, 'south');
  addWatchtower(158, -84);
  addFloodlight(135, -105);

  /* --- 3. SECTOR CHARLIE: INDUSTRIAL RAIL & WAREHOUSE DEPOT (CENTER, x: 0, z: 0) --- */
  /* Large open-bay Industrial Warehouse (walk right through front/back & sides!) */
  const whX = -26, whZ = -22;
  addBox(24, 0.5, 20, darkConcreteMat, whX, 7.2, whZ); /* roof */
  /* 4 structural corner walls leaving huge tactical entries */
  addBox(6, 7.0, 0.8, concreteMat, whX - 9, 3.5, whZ - 9.6, 0, { collide: true });
  addBox(6, 7.0, 0.8, concreteMat, whX + 9, 3.5, whZ - 9.6, 0, { collide: true });
  addBox(6, 7.0, 0.8, concreteMat, whX - 9, 3.5, whZ + 9.6, 0, { collide: true });
  addBox(6, 7.0, 0.8, concreteMat, whX + 9, 3.5, whZ + 9.6, 0, { collide: true });
  addBox(0.8, 7.0, 5.5, concreteMat, whX - 11.6, 3.5, whZ - 6.8, 0, { collide: true });
  addBox(0.8, 7.0, 5.5, concreteMat, whX - 11.6, 3.5, whZ + 6.8, 0, { collide: true });
  addBox(0.8, 7.0, 5.5, concreteMat, whX + 11.6, 3.5, whZ - 6.8, 0, { collide: true });
  addBox(0.8, 7.0, 5.5, concreteMat, whX + 11.6, 3.5, whZ + 6.8, 0, { collide: true });
  addSign('KC RAIL DEPOT', '#ffb13b', whX, 6.2, whZ + 10.1, 0, 10, 1.8);

  /* Rail tracks & 3 weathered steel boxcars running along x = -52 */
  for (const rx of [-53.2, -50.8]) {
    addBox(0.22, 0.12, 220, rustMat, rx, 0.06, 0, 0, { ray: false });
  }
  for (const bz of [-42, 8, 48]) {
    addBox(3.4, 3.6, 14.5, bz === 8 ? containerRed : rustMat, -52, 2.0, bz, 0, { collide: true, tag: 'building' });
    addBox(3.6, 0.25, 14.7, metalMat, -52, 3.9, bz);
  }

  /* Shipping Container CQB Yard around Central Plaza */
  addBox(3.0, 2.9, 8.2, containerBlue, -16, 1.45, 22, 0, { collide: true });
  addBox(3.0, 2.9, 8.2, containerRed, -16, 4.35, 22, 0); /* stacked top container */
  addBox(8.2, 2.9, 3.0, containerOlive, 24, 1.45, 26, 0, { collide: true });
  addBox(3.0, 2.9, 8.2, containerTan, 34, 1.45, -24, 0, { collide: true });
  addBox(8.2, 2.9, 3.0, containerBlue, -28, 1.45, 36, 0, { collide: true });
  addSandbagWall(0, -16, 8, false);
  addSandbagWall(0, 16, 8, false);
  addSandbagWall(-16, 0, 8, true);
  addSandbagWall(16, 0, 8, true);
  addFloodlight(12, 12);
  addFloodlight(-12, -12);

  /* --- 4. SECTOR DELTA: RIVERFRONT FUEL DOCKS (SOUTHWEST, x: -110, z: 110) --- */
  /* 3 Industrial Fuel Storage Tanks */
  for (const tz of [82, 100, 118]) {
    addCylinder(5.2, 5.2, 8.5, 10, concreteMat, -90, 4.25, tz, { collide: true, tag: 'building' });
    addCylinder(5.4, 5.4, 0.5, 10, rustMat, -90, 8.6, tz);
  }
  /* Naval Pier extending west into the Missouri River (walkable, no blocking collider!) */
  addBox(46, 0.45, 12, woodMat, -154, 0.14, 110);
  for (let px = -136; px >= -174; px -= 9) {
    addCylinder(0.35, 0.35, 2.6, 6, woodMat, px, -0.8, 104.5);
    addCylinder(0.35, 0.35, 2.6, 6, woodMat, px, -0.8, 115.5);
  }
  /* Central Boat Dock */
  addBox(38, 0.45, 9, woodMat, -151, 0.14, -20);
  for (let px = -136; px >= -168; px -= 8) {
    addCylinder(0.32, 0.32, 2.5, 6, woodMat, px, -0.8, -24);
    addCylinder(0.32, 0.32, 2.5, 6, woodMat, px, -0.8, -16);
  }
  /* North Cove Assault Pier (near ALPHA) */
  addBox(36, 0.45, 9, woodMat, -150, 0.14, -142);
  for (let px = -136; px >= -166; px -= 8) {
    addCylinder(0.32, 0.32, 2.5, 6, woodMat, px, -0.8, -146);
    addCylinder(0.32, 0.32, 2.5, 6, woodMat, px, -0.8, -138);
  }
  /* Dockside Cargo Crane & Warehouse */
  addBunker(-114, 134, 12, 9, 4.0, 'north');
  addBox(8.2, 2.9, 3.0, containerRed, -120, 1.45, 92, 0, { collide: true });
  addSandbagWall(-108, 96, 8, false);
  addFloodlight(-134, 110, 0x7fd4ff);
  addSign('MISSOURI RIVER DOCKS', '#65b8ff', -114, 5.0, 129.2, 0, 10, 1.8);

  /* --- 5. SECTOR ECHO: ALLIED FORWARD OPERATING BASE / HQ (SOUTH-EAST, x: 120, z: 145) --- */
  /* Perimeter walls leaving wide clear north & west exits */
  addBox(26, 2.8, 1.0, darkConcreteMat, 96, 1.4, 118, 0, { collide: true });
  addBox(26, 2.8, 1.0, darkConcreteMat, 144, 1.4, 118, 0, { collide: true });
  addBox(1.0, 2.8, 42, darkConcreteMat, 166, 1.4, 146, 0, { collide: true });
  addBox(56, 2.8, 1.0, darkConcreteMat, 126, 1.4, 174, 0, { collide: true });
  /* Command Bunker & Medical Tent */
  addBunker(146, 158, 12, 9, 4.0, 'north');
  addBox(10, 3.4, 7, oliveMat, 98, 1.7, 160, 0, { collide: true, tag: 'building' });
  /* Red cross decal on medical tent */
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
  addBox(1.8, 0.5, 0.1, crossMat, 98, 2.2, 156.4, 0, { ray: false });
  addBox(0.5, 1.8, 0.1, crossMat, 98, 2.2, 156.4, 0, { ray: false });
  addWatchtower(84, 124);
  addWatchtower(160, 124);
  /* Dual Allied Helipads */
  addHelipad(148, 134);
  addHelipad(84, 152);
  addFloodlight(120, 124, 0x8ad0ff);
  addSign('FOB HEARTLAND // ECHO', '#65b8ff', 120, 5.2, 118.6, 0, 10, 2);

  /* --- 6. SECTOR FOXTROT: HEARTLAND AIRFIELD (EAST FLIGHT LINE, x: 185, z: 25) --- */
  /* Paved 180m Runway running North-South at x = 212 */
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(24, 190), runwayMat);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(212, 0.03, 25);
  runway.receiveShadow = true;
  scene.add(runway);
  /* Runway edge lights */
  for (let rz = -62; rz <= 112; rz += 22) {
    addGlowSprite(0xffd266, 199.5, 0.55, rz, 1.5, 0.72, false);
    addGlowSprite(0xffd266, 224.5, 0.55, rz, 1.5, 0.72, false);
  }
  /* Open-front Curved Aircraft Hangar (x: 162, z: 48) */
  addBox(1.0, 7.5, 22, metalMat, 152, 3.75, 48, 0, { collide: true });
  addBox(18, 7.5, 1.0, metalMat, 161, 3.75, 59, 0, { collide: true });
  addBox(18, 7.5, 1.0, metalMat, 161, 3.75, 37, 0, { collide: true });
  addBox(19, 0.6, 23, darkConcreteMat, 161, 7.6, 48);
  /* Air Traffic Control Tower */
  addBox(6.5, 11, 6.5, concreteMat, 164, 5.5, 6, 0, { collide: true });
  addBox(8.2, 2.8, 8.2, new THREE.MeshStandardMaterial({ color: 0x1e4c44, emissive: 0x267565, emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.7 }), 164, 12.2, 6);
  addBox(8.8, 0.5, 8.8, metalMat, 164, 13.8, 6);
  addGlowSprite(0x57e6c2, 164, 14.6, 6, 3.5, 0.75, false);
  addSandbagWall(185, 8, 8, false);
  addFloodlight(185, 25, 0xffd266);
  addSign('HEARTLAND AIRFIELD', '#ffb13b', 164, 9.8, 2.6, 0, 8, 1.6);

  /* ============================================================
     CONQUEST ZONES (NO COLLIDERS! Pure Trigger Capture Radii)
     ============================================================ */
  const zoneDefs = [
    { name: 'ALPHA', code: 'A', label: 'NORTH FORTRESS', x: -50, z: -185, owner: 'enemy', color: 0xd94a4a, spawnOffsets: [[0, 12], [-10, 10], [10, 10], [0, -10]] },
    { name: 'BRAVO', code: 'B', label: 'ARTILLERY RIDGE', x: 145, z: -105, owner: 'neutral', color: 0x9aa4b2, spawnOffsets: [[-14, 0], [-12, 10], [-12, -10], [0, 14]] },
    { name: 'CHARLIE', code: 'C', label: 'RAIL DEPOT', x: 0, z: 0, owner: 'neutral', color: 0x9aa4b2, spawnOffsets: [[8, 8], [-8, 8], [8, -8], [-8, -8]] },
    { name: 'DELTA', code: 'D', label: 'RIVER DOCKS', x: -110, z: 110, owner: 'neutral', color: 0x9aa4b2, spawnOffsets: [[8, -8], [10, 6], [-8, -10], [-10, 6]] },
    { name: 'ECHO', code: 'E', label: 'FOB HEARTLAND', x: 120, z: 145, owner: 'player', color: 0x4a90d9, spawnOffsets: [[0, -10], [-10, -8], [10, -8], [0, 10]] },
    { name: 'FOXTROT', code: 'F', label: 'AIRFIELD', x: 185, z: 25, owner: 'neutral', color: 0x9aa4b2, spawnOffsets: [[-10, 0], [-8, -10], [-8, 10], [8, 0]] }
  ];

  for (const z of zoneDefs) {
    const zone = {
      name: z.name,
      code: z.code,
      label: z.label,
      x: z.x,
      z: z.z,
      radius: 18,
      owner: z.owner,
      progress: z.owner === 'player' ? 1 : z.owner === 'enemy' ? -1 : 0,
      capturing: null,
      spawnOffsets: z.spawnOffsets,
      mesh: null,
      ring: null,
      flag: null
    };

    /* Subtle ground tactical capture ring + translucent zone fill */
    const circle = new THREE.Mesh(
      new THREE.CircleGeometry(zone.radius, 32),
      new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(z.x, 0.055, z.z);
    scene.add(circle);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(zone.radius - 0.55, zone.radius, 32),
      new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(z.x, 0.065, z.z);
    scene.add(ring);

    /* Concrete flag pedestal (tiny visual center, NO giant zone collider!) */
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 8), darkConcreteMat);
    base.position.set(z.x, 0.175, z.z);
    scene.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9.5, 6), metalMat);
    pole.position.set(z.x, 4.9, z.z);
    scene.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 2.2),
      new THREE.MeshBasicMaterial({ color: z.color, side: THREE.DoubleSide, toneMapped: false })
    );
    flag.position.set(z.x + 1.95, 8.2, z.z);
    scene.add(flag);

    /* Beacon light atop flagpole for long-range orientation */
    const beacon = addGlowSprite(z.color, z.x, 9.8, z.z, 3.6, 0.65, false);

    /* Gentle waving flag animation */
    city.updaters.push((t) => {
      flag.rotation.y = Math.sin(t * 3.1 + z.x * 0.05) * 0.22;
      beacon.material.color.copy(flag.material.color);
    });

    zone.mesh = circle;
    zone.ring = ring;
    zone.flag = flag;
    zone.flagColor = z.color;
    city.zones.push(zone);
  }

  /* ============================================================
     STRATEGIC COVER, TREES, TANK TRAPS & WEAPON ATTACHMENTS
     ============================================================ */
  /* Tactical Roadblocks & Jersey Barriers along main approaches (strictly axis-aligned!) */
  const roadBlocks = [
    { x: 14, z: -72, w: 6.5, d: 0.9 },
    { x: 26, z: -48, w: 6.5, d: 0.9 },
    { x: 14, z: 54, w: 6.5, d: 0.9 },
    { x: 26, z: 82, w: 6.5, d: 0.9 },
    { x: -64, z: -6, w: 0.9, d: 6.5 },
    { x: 76, z: 6, w: 0.9, d: 6.5 },
    { x: 58, z: -58, w: 7.0, d: 0.9 },
    { x: -58, z: 68, w: 7.0, d: 0.9 }
  ];
  for (const rb of roadBlocks) {
    addBox(rb.w, 1.15, rb.d, darkConcreteMat, rb.x, 0.575, rb.z, 0, { collide: true, tag: 'prop' });
  }

  /* Czech Hedgehog Anti-Tank Obstacles along the Missouri River Beach */
  for (let hz = -120; hz <= 70; hz += 28) {
    const hx = -139 + (hz % 56 === 0 ? -4 : 3);
    const hg = new THREE.Group();
    hg.position.set(hx, 0.85, hz);
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), rustMat);
      beam.rotation.set(i === 0 ? 0.7 : -0.7, i * 1.05, 0.7);
      hg.add(beam);
    }
    scene.add(hg);
    addCollider(hx, hz, 1.6, 1.6, 1.6, 'prop');
  }

  /* Curated Low-Poly Pine & Woodland Groves (never overlapping roads, zones, or runway!) */
  const pineMat1 = new THREE.MeshStandardMaterial({ color: 0x223822, roughness: 0.94, flatShading: true });
  const pineMat2 = new THREE.MeshStandardMaterial({ color: 0x2c4628, roughness: 0.94, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x433322, roughness: 0.95, flatShading: true });
  const groveCenters = [
    [-95, -90], [-85, -35], [-80, 42], [72, -165], [88, -42],
    [76, 78], [-35, 168], [32, -140], [132, -32], [-108, -142]
  ];
  let treeSeed = 2026;
  const trand = (a, b) => {
    treeSeed = (treeSeed * 16807) % 2147483647;
    return a + ((treeSeed - 1) / 2147483646) * (b - a);
  };
  for (const [gx, gz] of groveCenters) {
    for (let i = 0; i < 6; i++) {
      const tx = gx + trand(-20, 20);
      const tz = gz + trand(-20, 20);
      /* Keep clear of zones, highway, and runway */
      if (tx < -126 || tx > 192) continue;
      if (Math.abs(tx - 20) < 12 || Math.abs(tz) < 12) continue;
      let tooClose = false;
      for (const z of city.zones) if (KC.dist2(tx, tz, z.x, z.z) < 26) tooClose = true;
      if (tooClose) continue;
      const h = trand(3.8, 6.2);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h * 0.45, 5), trunkMat);
      trunk.position.set(tx, h * 0.22, tz);
      trunk.castShadow = true;
      scene.add(trunk);
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(trand(1.8, 2.8), h * 0.65, 6), i % 2 === 0 ? pineMat1 : pineMat2);
      cone1.position.set(tx, h * 0.58, tz);
      cone1.castShadow = true;
      scene.add(cone1);
      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(trand(1.2, 2.0), h * 0.5, 6), pineMat2);
      cone2.position.set(tx, h * 0.92, tz);
      cone2.castShadow = true;
      scene.add(cone2);
      addCollider(tx, tz, 0.7, 0.7, 3.5, 'tree');
    }
  }

  /* Strategic Weapon Attachment Caches placed inside/near sectors */
  city.attachmentPickups = [];
  const attColors = { scope: 0x4a90d9, grip: 0x57e6c2, silencer: 0x9aa4b2, extmag: 0xffb13b };
  const attSpots = [
    { x: 112, z: 138, type: 'scope' },
    { x: 128, z: 138, type: 'grip' },
    { x: 116, z: 156, type: 'silencer' },
    { x: 124, z: 156, type: 'extmag' },
    { x: -18, z: -18, type: 'extmag' },
    { x: 14, z: 14, type: 'grip' },
    { x: 140, z: -96, type: 'scope' },
    { x: 152, z: -116, type: 'silencer' },
    { x: -102, z: 104, type: 'grip' },
    { x: -116, z: 122, type: 'extmag' },
    { x: 174, z: 42, type: 'scope' },
    { x: 174, z: 12, type: 'silencer' },
    { x: -42, z: -176, type: 'extmag' },
    { x: -62, z: -192, type: 'scope' }
  ];
  for (const a of attSpots) {
    const col = attColors[a.type];
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.65, metalness: 0.45, roughness: 0.35, flatShading: true })
    );
    crate.position.set(a.x, 0.7, a.z);
    scene.add(crate);
    city.attachmentPickups.push({ x: a.x, z: a.z, type: a.type, mesh: crate, picked: false });
  }

  /* ============================================================
     COMBINED-ARMS VEHICLES (Humvees, Helicopters, Plane, Boats)
     ============================================================ */
  city.parkedSpots = [
    /* Allied FOB Motorpool (ECHO) */
    { x: 106, z: 132, heading: Math.PI, color: 0x4a5a3a, style: 'humvee', kind: 'parked' },
    { x: 134, z: 132, heading: Math.PI, color: 0x3b4d38, style: 'humvee', kind: 'parked' },
    /* Central Rail Depot & Roads */
    { x: 24, z: 36, heading: 0, color: 0x7b6d4c, style: 'humvee', kind: 'parked' },
    { x: 16, z: -56, heading: Math.PI, color: 0x4a5240, style: 'humvee', kind: 'parked' },
    /* Bravo Artillery Ridge & Delta Docks */
    { x: 124, z: -105, heading: Math.PI / 2, color: 0x5c533e, style: 'humvee', kind: 'parked' },
    { x: -102, z: 96, heading: 0, color: 0x3a4a5c, style: 'suv', kind: 'parked' },
    /* Opfor Fortress (ALPHA) */
    { x: -42, z: -172, heading: 0, color: 0x3d3632, style: 'humvee', kind: 'parked' },
    { x: -58, z: -172, heading: 0, color: 0x4a3230, style: 'armored', kind: 'parked' }
  ];

  city.vehicleSpots = [
    /* Attack Helicopters on Marked Helipads */
    { type: 'heli', x: 148, z: 134, heading: 0, color: 0x324634, kind: 'parked' },
    { type: 'heli', x: 84, z: 152, heading: 0.35, color: 0x2a3f54, kind: 'parked' },
    { type: 'heli', x: -88, z: -192, heading: Math.PI, color: 0x423838, kind: 'parked' },
    /* Fighter / Recon Planes on Airfield Runway */
    { type: 'plane', x: 212, z: 92, heading: 0, color: 0x7a8590, kind: 'parked' },
    { type: 'plane', x: 212, z: -42, heading: Math.PI, color: 0x5c6654, kind: 'parked' },
    /* Patrol Gunboats & Fast Assault RHIB Speedboats moored along River Piers & Beach */
    { type: 'boat', boatKind: 'gunboat', x: -168, z: 100, heading: 0, color: 0x3a4a58, kind: 'parked' },
    { type: 'boat', boatKind: 'gunboat', x: -168, z: 121, heading: 0, color: 0x4a5846, kind: 'parked' },
    { type: 'boat', boatKind: 'speedboat', x: -152, z: 18, heading: Math.PI / 2, color: 0x3e4c3a, kind: 'parked' },
    { type: 'boat', boatKind: 'gunboat', x: -166, z: -20, heading: Math.PI, color: 0x524444, kind: 'parked' },
    { type: 'boat', boatKind: 'speedboat', x: -166, z: -142, heading: Math.PI, color: 0x384654, kind: 'parked' }
  ];

  /* Safe Spawn Points (clear of flagpoles, walls, and obstacles) */
  city.spawnPoints = {
    player: [{ x: 120, z: 135 }, { x: 110, z: 137 }, { x: 130, z: 137 }],
    enemy: [{ x: -50, z: -173 }, { x: -40, z: -175 }, { x: -60, z: -175 }]
  };
  city.enemySpawns = city.spawnPoints.enemy.slice();

  /* Rich Tactical Map Data for Minimap & Deployment Map */
  city.mapData = {
    mode: 'bf',
    bounds: 262,
    riverMaxX: -145,
    beachMaxX: -130,
    lines: [],
    roads: [
      { x1: 20, z1: -230, x2: 20, z2: 230, w: 14 },
      { x1: -150, z1: 0, x2: 190, z2: 0, w: 14 },
      { x1: 20, z1: 145, x2: 126, z2: 145, w: 10 },
      { x1: -56, z1: -185, x2: 20, z2: -185, w: 10 },
      { x1: -112, z1: 110, x2: 20, z2: 110, w: 10 },
      { x1: 20, z1: -105, x2: 152, z2: -105, w: 10 },
      { x1: 20, z1: 25, x2: 190, z2: 25, w: 10 }
    ],
    runway: { x: 212, z: 25, w: 24, d: 190 },
    blocks: [],
    structures: [
      { x: -26, z: -22, w: 24, d: 20 },
      { x: -68, z: -198, w: 14, d: 10 },
      { x: 146, z: 158, w: 12, d: 9 },
      { x: 161, z: 48, w: 18, d: 22 },
      { x: -158, z: 110, w: 46, d: 12 }
    ],
    water: { minZ: -999, maxZ: -999 },
    districts: zoneDefs.map((z) => ({ name: z.name + ' · ' + z.label, x: z.x, z: z.z })),
    landmarkLabels: zoneDefs.map((z) => ({ label: z.code + ' · ' + z.name, x: z.x, z: z.z }))
  };

  city.landmarks = {};
  for (const z of zoneDefs) {
    city.landmarks[z.name] = { x: z.x, z: z.z, marker: { x: z.x, z: z.z }, label: z.name };
  }

  return city;
};
