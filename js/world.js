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

  /* Extended ground + roads */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 680), new THREE.MeshStandardMaterial({ color: 0x16161b, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);
  city.rayMeshes.push(ground);
  city.ground = ground;

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
   BATTLEFIELD MODE — large land/sea/air map with conquest zones
   ============================================================ */
KC.buildBattlefield = function (scene) {
  const city = {
    gameMode: 'bf',
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
    mapData: null,
    vehicleSpots: [],
    shops: [],
    vendorCarts: [],
    glowTex: null,
    poolTex: null,
    water: null,
    zones: []
  };

  /* Helpers */
  function insertColliderToGrid(c) { /* noop for bf (no grid needed) */ }
  city.insertColliderToGrid = insertColliderToGrid;
  city.getNearbyColliders = function (x, z, r) { return city.colliders; };
  function addCollider(x, z, w, d, h = 10, tag = 'building') {
    const c = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, x, z, w, d, h, tag, active: true };
    city.colliders.push(c);
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
    if (opts.ray) city.rayMeshes.push(mesh);
    return mesh;
  };
  city.addBox = addBox;
  const addCylinder = (rt, rb, h, seg, mat, x, y, z, opts = {}) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow = opts.cast !== false;
    scene.add(mesh);
    if (opts.ray) city.rayMeshes.push(mesh);
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
    return mesh;
  };
  city.addSign = addSign;
  const glowTex = KC.makeGlowTexture();
  const poolTex = KC.makeLightPoolTexture();
  city.glowTex = glowTex;
  city.poolTex = poolTex;
  const addGlowSprite = (color, x, y, z, scale, opacity = 0.5) => {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(scale, scale, 1);
    scene.add(s);
    return s;
  };
  city.addGlowSprite = addGlowSprite;
  const addLightPool = (x, y, z, color, size, opacity = 0.24) => {
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  city.addLightPool = addLightPool;
  city.registerCullItem = function () {};
  city.createBuilding = function () {};

  /* Materials */
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.95 });
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 0.95 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.85 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.8, metalness: 0.3 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.4, metalness: 0.7 });

  city.materials = { waterTex: null, microBump: null };

  /* Ground (large) */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);
  city.rayMeshes.push(ground);

  /* Sea on the west side */
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 700), waterMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-250, -0.3, 0);
  scene.add(sea);
  city.water = sea;

  /* Beach / sand strip */
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(40, 700), sandMat);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-80, -0.02, 0);
  scene.add(beach);

  /* Some hills / elevation via boxes */
  for (let i = 0; i < 8; i++) {
    const w = KC.rand(20, 60), h = KC.rand(3, 12), d = KC.rand(20, 60);
    const x = KC.rand(-120, 120), z = KC.rand(-120, 120);
    if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
    const hill = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), groundMat);
    hill.position.set(x, h / 2 - 0.1, z);
    hill.receiveShadow = true;
    hill.castShadow = true;
    scene.add(hill);
    city.rayMeshes.push(hill);
    addCollider(x, z, w, d, h, 'hill');
  }

  /* Bunkers / buildings */
  for (let i = 0; i < 12; i++) {
    const x = KC.rand(-180, 180), z = KC.rand(-180, 180);
    if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;
    const w = KC.rand(8, 16), h = KC.rand(4, 9), d = KC.rand(8, 16);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concreteMat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    city.rayMeshes.push(b);
    addCollider(x, z, w, d, h, 'building');
    /* roof */
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), metalMat);
    roof.position.set(x, h + 0.15, z);
    scene.add(roof);
  }

  /* Conquest zones */
  const zoneDefs = [
    { name: 'ALPHA', x: -120, z: -120, color: 0x4a90d9 },
    { name: 'BRAVO', x: 120, z: -120, color: 0x4a90d9 },
    { name: 'CHARLIE', x: 0, z: 0, color: 0x888888 },
    { name: 'DELTA', x: -120, z: 120, color: 0xd94a4a },
    { name: 'ECHO', x: 120, z: 120, color: 0xd94a4a },
    { name: 'FOXTROT', x: 0, z: -180, color: 0x888888 }
  ];
  for (const z of zoneDefs) {
    const zone = { name: z.name, x: z.x, z: z.z, radius: 18, owner: z.color === 0x4a90d9 ? 'player' : z.color === 0xd94a4a ? 'enemy' : 'neutral', progress: 0, capturing: null, mesh: null, flag: null };
    /* Zone circle on ground */
    const circle = new THREE.Mesh(new THREE.CircleGeometry(zone.radius, 32), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, toneMapped: false }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(z.x, 0.05, z.z);
    scene.add(circle);
    /* Flag pole */
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), metalMat);
    pole.position.set(z.x, 3, z.z);
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ color: z.color, side: THREE.DoubleSide, toneMapped: false }));
    flag.position.set(z.x + 1.6, 5.2, z.z);
    scene.add(flag);
    zone.mesh = circle;
    zone.flag = flag;
    zone.flagColor = z.color;
    city.zones.push(zone);
    addCollider(z.x, z.z, zone.radius * 2, zone.radius * 2, 1, 'zone');
  }
  city.zones = city.zones || [];

  /* Attachment pickups */
  city.attachmentPickups = [];
  const attTypes = ['scope', 'grip', 'silencer', 'extmag'];
  const attColors = { scope: 0x4a90d9, grip: 0x57e6c2, silencer: 0x888888, extmag: 0xffb13b };
  for (let i = 0; i < 20; i++) {
    const x = KC.rand(-220, 220), z = KC.rand(-220, 220);
    if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;
    const type = KC.pick(attTypes);
    const col = attColors[type];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }));
    mesh.position.set(x, 0.8, z);
    scene.add(mesh);
    city.attachmentPickups.push({ x, z, type, mesh, picked: false });
  }

  /* Vehicle spawns */
  city.vehicleSpots = [];
  /* Land vehicles */
  city.vehicleSpots.push({ type: 'car', x: -60, z: -60, heading: 0, color: 0x2b4b7a, kind: 'parked' });
  city.vehicleSpots.push({ type: 'car', x: 60, z: -60, heading: 0, color: 0xa32b2b, kind: 'parked' });
  city.vehicleSpots.push({ type: 'car', x: -60, z: 60, heading: 0, color: 0x3b6b56, kind: 'parked' });
  city.vehicleSpots.push({ type: 'car', x: 60, z: 60, heading: 0, color: 0x8d7c3c, kind: 'parked' });
  /* Helis */
  city.vehicleSpots.push({ type: 'heli', x: -180, z: 0, heading: 0, color: 0x1a3a5c, kind: 'parked' });
  city.vehicleSpots.push({ type: 'heli', x: 180, z: 0, heading: Math.PI, color: 0x2b4b7a, kind: 'parked' });
  /* Planes */
  city.vehicleSpots.push({ type: 'plane', x: 0, z: -200, heading: 0, color: 0xd8d0c0, kind: 'parked' });
  /* Boats */
  city.vehicleSpots.push({ type: 'boat', x: -230, z: 0, heading: 0, color: 0xd8d0c0, kind: 'parked' });
  city.vehicleSpots.push({ type: 'boat', x: -230, z: 80, heading: 0, color: 0x2b4b7a, kind: 'parked' });

  /* Spawn points (player team on south, enemy on north) */
  city.spawnPoints = {
    player: [{ x: 0, z: 180 }, { x: -40, z: 160 }, { x: 40, z: 160 }],
    enemy: [{ x: 0, z: -180 }, { x: -40, z: -160 }, { x: 40, z: -160 }]
  };

  /* Enemy soldiers (thugs) defending north zones */
  city.enemySpawns = city.spawnPoints.enemy.slice();

  /* Map data for minimap */
  city.mapData = {
    bounds: 260,
    lines: [],
    blocks: [],
    water: { minZ: -350, maxZ: -200 },
    districts: [
      { name: 'SECTOR ALPHA', x: -120, z: -120 },
      { name: 'SECTOR BRAVO', x: 120, z: -120 },
      { name: 'SECTOR CHARLIE', x: 0, z: 0 },
      { name: 'SECTOR DELTA', x: -120, z: 120 },
      { name: 'SECTOR ECHO', x: 120, z: 120 }
    ],
    landmarkLabels: zoneDefs.map((z) => ({ label: z.name, x: z.x, z: z.z }))
  };

  /* Store landmarks for minimap */
  city.landmarks = {};
  for (const z of zoneDefs) {
    city.landmarks[z.name] = { x: z.x, z: z.z, marker: { x: z.x, z: z.z }, label: z.name };
  }

  /* Extra battlefield detail: trees, crates, barriers */
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
  for (let i = 0; i < 60; i++) {
    const x = KC.rand(-220, 220), z = KC.rand(-220, 220);
    if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
    if (x < -60) continue; /* keep sea side clear */
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, KC.rand(2, 4), 6), trunkMat);
    trunk.position.set(x, 1.5, z);
    scene.add(trunk);
    const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(KC.rand(2, 4), 0), treeMat);
    canopy.position.set(x, KC.rand(4, 7), z);
    scene.add(canopy);
  }
  for (let i = 0; i < 25; i++) {
    const x = KC.rand(-200, 200), z = KC.rand(-200, 200);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), concreteMat);
    crate.position.set(x, 0.7, z);
    crate.rotation.y = KC.rand(0, Math.PI);
    scene.add(crate);
    addCollider(x, z, 1.4, 1.4, 1.4, 'prop');
  }
  for (let i = 0; i < 15; i++) {
    const x = KC.rand(-200, 200), z = KC.rand(-200, 200);
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(KC.rand(4, 8), 0.6, 0.4), concreteMat);
    barrier.position.set(x, 0.3, z);
    barrier.rotation.y = KC.rand(0, Math.PI);
    scene.add(barrier);
    addCollider(x, z, 6, 0.4, 0.6, 'prop');
  }

  /* Lights */
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
  sun.position.set(80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0x88aaff, 0x223322, 0.7);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x445566, 0.5);
  scene.add(amb);

  /* Sky */
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.0015);

  return city;
};
