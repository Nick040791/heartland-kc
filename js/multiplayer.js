'use strict';

/* ============================================================
   HEARTLAND 26 — Customizable Character (Articulated 3P Rig),
   Multiplayer Sessions & Proximity 3D Voice Chat (45m Range)
   ============================================================ */
(function () {
  const KC = (window.KC = window.KC || {});

  /* ---------------- Character Customization Options ---------------- */
  KC.CHAR_OPTIONS = {
    skins: [
      { name: 'WARM TAN', hex: 0xd6a17a, css: '#d6a17a' },
      { name: 'BRONZE', hex: 0x9a6644, css: '#9a6644' },
      { name: 'DEEP ESPRESSO', hex: 0x5c3a28, css: '#5c3a28' },
      { name: 'LIGHT IVORY', hex: 0xe8c39e, css: '#e8c39e' },
      { name: 'GOLDEN UMBER', hex: 0x8d5a3b, css: '#8d5a3b' },
      { name: 'PEACH SAND', hex: 0xc98d6b, css: '#c98d6b' }
    ],
    hairStyles: [
      { id: 'fade', label: 'LOW FADE' },
      { id: 'cap', label: 'KC SNAPBACK' },
      { id: 'beanie', label: 'STREET BEANIE' },
      { id: 'hood', label: 'HOOD UP' },
      { id: 'cowboy', label: 'MIDWEST HAT' },
      { id: 'afro', label: 'CROWN CURLS' },
      { id: 'visor', label: 'NEON VISOR' },
      { id: 'none', label: 'SHAVED / BALD' }
    ],
    hairColors: [
      { name: 'JET BLACK', hex: 0x161312, css: '#161312' },
      { name: 'DARK BROWN', hex: 0x3b261a, css: '#3b261a' },
      { name: 'CHESTNUT', hex: 0x6b442a, css: '#6b442a' },
      { name: 'BLONDE GOLD', hex: 0xd4a953, css: '#d4a953' },
      { name: 'KC RED', hex: 0xc8232c, css: '#c8232c' },
      { name: 'TEAL DYE', hex: 0x2fb899, css: '#2fb899' },
      { name: 'SILVER ASH', hex: 0xaab2bd, css: '#aab2bd' }
    ],
    outfits: [
      { id: 'jacket', label: 'BOMBER JACKET' },
      { id: 'hoodie', label: 'STREET HOODIE' },
      { id: 'kc_jersey', label: 'KC #15 JERSEY' },
      { id: 'tactical', label: 'TACTICAL VEST' },
      { id: 'suit', label: 'P&L EXEC SUIT' },
      { id: 'street_tee', label: 'BLOCKY TEE' }
    ],
    shirtColors: [
      { name: 'KC CRIMSON', hex: 0xb82028, css: '#b82028' },
      { name: 'MIDNIGHT NAVY', hex: 0x243b5a, css: '#243b5a' },
      { name: 'HEARTLAND GOLD', hex: 0xd99126, css: '#d99126' },
      { name: 'EMERALD TURF', hex: 0x275946, css: '#275946' },
      { name: 'CARBON BLACK', hex: 0x1f2128, css: '#1f2128' },
      { name: 'ROYAL PURPLE', hex: 0x4e3269, css: '#4e3269' },
      { name: 'CREAM WHITE', hex: 0xdcd3c2, css: '#dcd3c2' },
      { name: 'NEON PINK', hex: 0xd13b6f, css: '#d13b6f' }
    ],
    accentColors: [
      { name: 'AMBER GOLD', hex: 0xffb13b, css: '#ffb13b' },
      { name: 'ELECTRIC TEAL', hex: 0x57e6c2, css: '#57e6c2' },
      { name: 'PURE WHITE', hex: 0xf2e8d5, css: '#f2e8d5' },
      { name: 'CRIMSON RED', hex: 0xff3b3b, css: '#ff3b3b' },
      { name: 'ROYAL BLUE', hex: 0x65b8ff, css: '#65b8ff' },
      { name: 'STEALTH GRAY', hex: 0x444854, css: '#444854' }
    ],
    pantsColors: [
      { name: 'DARK DENIM', hex: 0x212938, css: '#212938' },
      { name: 'CARGO BLACK', hex: 0x18191f, css: '#18191f' },
      { name: 'KHAKI TAN', hex: 0x736049, css: '#736049' },
      { name: 'SLATE GRAY', hex: 0x383b44, css: '#383b44' },
      { name: 'OLIVE DRAB', hex: 0x333d2e, css: '#333d2e' },
      { name: 'TRACK WHITE', hex: 0xc8c3ba, css: '#c8c3ba' }
    ],
    accessories: [
      { id: 'shades', label: 'DARK SHADES' },
      { id: 'chain', label: 'GOLD CHAIN' },
      { id: 'backpack', label: 'LOOT PACK' },
      { id: 'bandana', label: 'FACE BANDANA' },
      { id: 'none', label: 'NONE' }
    ]
  };

  const DEFAULT_CHAR = {
    callsign: 'KC_OUTLAW',
    skinIdx: 0,
    hairStyle: 'cap',
    hairColorIdx: 4,
    outfit: 'jacket',
    shirtColorIdx: 0,
    accentColorIdx: 0,
    pantsColorIdx: 0,
    accessory: 'shades'
  };

  KC.loadCharConfig = function () {
    try {
      const raw = localStorage.getItem('heartland26_char');
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_CHAR, ...parsed };
      }
    } catch (e) {}
    return { ...DEFAULT_CHAR };
  };

  KC.saveCharConfig = function (cfg) {
    try {
      localStorage.setItem('heartland26_char', JSON.stringify(cfg));
    } catch (e) {}
  };

  KC.charConfig = KC.loadCharConfig();

  /* Build an articulated R15-style low-poly Roblox x GTA 3D character rig
     with upper/lower limbs (elbows & knees), spine twist, pelvis motion,
     distinct Pistol/Rifle 3P models, 3P muzzle flash, and flashlight cone. */
  KC.buildCustomPersonMesh = function (cfg = KC.charConfig, opts = {}) {
    const O = KC.CHAR_OPTIONS;
    const skinHex = (O.skins[cfg.skinIdx] || O.skins[0]).hex;
    const hairHex = (O.hairColors[cfg.hairColorIdx] || O.hairColors[0]).hex;
    const shirtHex = (O.shirtColors[cfg.shirtColorIdx] || O.shirtColors[0]).hex;
    const accentHex = (O.accentColors[cfg.accentColorIdx] || O.accentColors[0]).hex;
    const pantsHex = (O.pantsColors[cfg.pantsColorIdx] || O.pantsColors[0]).hex;

    const group = new THREE.Group();

    /* Lower body / pelvis root so legs can steer into strafe direction independently */
    const lowerBody = new THREE.Group();
    lowerBody.position.y = 0.75;
    group.add(lowerBody);

    /* Upper body / spine root attached above pelvis */
    const upperBody = new THREE.Group();
    upperBody.position.y = 0.78;
    group.add(upperBody);

    /* Chest group inside upperBody for breathing, counter-twist, and recoil */
    const chestGroup = new THREE.Group();
    upperBody.add(chestGroup);

    const skinMat = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.85, flatShading: true });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.85, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.5, metalness: 0.35, flatShading: true });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.9, flatShading: true });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.85, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.65, metalness: 0.28, flatShading: true });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x7b8492, roughness: 0.35, metalness: 0.45, flatShading: true });
    const goldChainMat = new THREE.MeshStandardMaterial({ color: 0xffc44d, roughness: 0.28, metalness: 0.85 });

    /* Anatomical PS1 Tapered Torso (broad chest tapering to waist) */
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.23, 0.56, 6), shirtMat);
    torso.scale.set(1.08, 1.0, 0.66);
    torso.position.y = 0.42;
    torso.castShadow = true;
    chestGroup.add(torso);
    const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.21, 0.20, 6), shirtMat);
    abdomen.scale.set(1.06, 1.0, 0.68);
    abdomen.position.y = 0.08;
    chestGroup.add(abdomen);
    /* Collar / Neck */
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.12, 6), skinMat);
    neck.position.y = 0.72;
    chestGroup.add(neck);
    /* Belt & tactical buckle */
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.228, 0.228, 0.065, 6), darkMat);
    belt.scale.set(1.08, 1.0, 0.70);
    belt.position.y = 0.02;
    chestGroup.add(belt);

    /* Outfit details */
    if (cfg.outfit === 'jacket') {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.14, 6), accentMat);
      collar.scale.set(1.1, 1, 0.72);
      collar.position.set(0, 0.65, 0.01);
      chestGroup.add(collar);
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.64, 0.04), accentMat);
      zip.position.set(0, 0.36, -0.185);
      chestGroup.add(zip);
    } else if (cfg.outfit === 'hoodie') {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.20, 0.04), accentMat);
      pocket.position.set(0, 0.2, -0.175);
      chestGroup.add(pocket);
      const hoodBack = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.16, 6), accentMat);
      hoodBack.position.set(0, 0.69, 0.12);
      chestGroup.add(hoodBack);
    } else if (cfg.outfit === 'kc_jersey') {
      const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.275, 0.10, 6), accentMat);
      stripe1.scale.set(1.1, 1, 0.68);
      stripe1.position.set(0, 0.52, 0);
      const numBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.04), accentMat);
      numBox.position.set(0, 0.38, -0.185);
      chestGroup.add(stripe1, numBox);
    } else if (cfg.outfit === 'tactical') {
      const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.48, 6), darkMat);
      vest.scale.set(1.08, 1, 0.74);
      vest.position.set(0, 0.40, 0);
      chestGroup.add(vest);
      for (const px of [-0.14, 0, 0.14]) {
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.15, 0.065), accentMat);
        pouch.position.set(px, 0.27, -0.215);
        chestGroup.add(pouch);
      }
    } else if (cfg.outfit === 'suit') {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.04), new THREE.MeshStandardMaterial({ color: 0xf0eadc, roughness: 0.75, flatShading: true }));
      lapel.position.set(0, 0.42, -0.18);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.42, 0.045), accentMat);
      tie.position.set(0, 0.40, -0.19);
      chestGroup.add(lapel, tie);
    }

    /* Sculpted Hips (relative to lowerBody at y=0.75) */
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.20, 6), pantsMat);
    hips.scale.set(1.08, 1, 0.72);
    hips.position.y = 0;
    hips.castShadow = true;
    lowerBody.add(hips);

    /* Head pivot (relative to chestGroup) — Chiseled PS1 Low-Poly Head */
    const headPivot = new THREE.Group();
    headPivot.position.y = 0.76;
    chestGroup.add(headPivot);

    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.145, 0.22, 7), skinMat);
    head.scale.set(0.96, 1, 1.06);
    head.position.y = 0.21;
    head.castShadow = true;
    headPivot.add(head);
    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.095, 0.11, 7), skinMat);
    jaw.scale.set(0.95, 1, 1.04);
    jaw.position.set(0, 0.065, -0.01);
    headPivot.add(jaw);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.068, 4), skinMat);
    nose.rotation.x = -Math.PI * 0.42;
    nose.position.set(0, 0.165, -0.175);
    headPivot.add(nose);

    /* Recessed Eyes & Brow */
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111115 });
    for (const ox of [-0.058, 0.058]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.032, 0.02), eyeMat);
      eye.position.set(ox, 0.205, -0.155);
      headPivot.add(eye);
    }

    /* Hair / Hat styles */
    if (cfg.hairStyle === 'fade') {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.11, 7), hairMat);
      top.scale.set(0.98, 1, 1.08);
      top.position.set(0, 0.34, 0.01);
      headPivot.add(top);
    } else if (cfg.hairStyle === 'cap') {
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.178, 0.12, 7), hairMat);
      dome.scale.set(0.98, 1, 1.08);
      dome.position.set(0, 0.33, 0.01);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.17), accentMat);
      brim.position.set(0, 0.28, -0.21);
      headPivot.add(dome, brim);
    } else if (cfg.hairStyle === 'beanie') {
      const beanie = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.185, 0.18, 7), hairMat);
      beanie.scale.set(0.98, 1, 1.08);
      beanie.position.set(0, 0.35, 0.01);
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.188, 0.06, 7), accentMat);
      fold.scale.set(0.98, 1, 1.08);
      fold.position.set(0, 0.28, 0.01);
      headPivot.add(beanie, fold);
    } else if (cfg.hairStyle === 'hood') {
      const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.38, 7), hairMat);
      hood.position.set(0, 0.21, 0.03);
      headPivot.add(hood);
    } else if (cfg.hairStyle === 'cowboy') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 8), hairMat);
      brim.position.set(0, 0.30, 0);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 7), hairMat);
      crown.position.set(0, 0.39, 0);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.04, 7), accentMat);
      band.position.set(0, 0.33, 0);
      headPivot.add(brim, crown, band);
    } else if (cfg.hairStyle === 'afro') {
      const fro = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), hairMat);
      fro.position.set(0, 0.35, 0.02);
      headPivot.add(fro);
    } else if (cfg.hairStyle === 'visor') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.07, 7), darkMat);
      band.position.set(0, 0.29, 0);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.04, 0.16), accentMat);
      visor.position.set(0, 0.28, -0.20);
      headPivot.add(band, visor);
    }

    /* Accessories */
    if (cfg.accessory === 'shades') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.075, 0.05), darkMat);
      frame.position.set(0, 0.205, -0.155);
      headPivot.add(frame);
    } else if (cfg.accessory === 'chain') {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 4, 8), goldChainMat);
      chain.rotation.x = Math.PI * 0.45;
      chain.position.set(0, 0.62, -0.05);
      chestGroup.add(chain);
    } else if (cfg.accessory === 'backpack') {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.20), darkMat);
      pack.position.set(0, 0.38, 0.23);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), accentMat);
      trim.position.set(0, 0.45, 0.23);
      chestGroup.add(pack, trim);
    } else if (cfg.accessory === 'bandana') {
      const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.135, 0.13, 7), accentMat);
      mask.position.set(0, 0.10, -0.01);
      headPivot.add(mask);
    }

    /* Two-Segment Tapered PS1 Articulated Arms */
    function makeArticulatedArm(x, y) {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, y, 0);
      const deltoid = new THREE.Mesh(new THREE.DodecahedronGeometry(0.095, 0), shirtMat);
      shoulder.add(deltoid);
      const upperLen = 0.32;
      const lowerLen = 0.31;
      const upperMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, upperLen, 6), shirtMat);
      upperMesh.position.y = -upperLen / 2;
      upperMesh.castShadow = true;
      shoulder.add(upperMesh);

      const elbow = new THREE.Group();
      elbow.position.set(0, -upperLen + 0.02, 0);
      const lowerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.054, lowerLen, 6), shirtMat);
      lowerMesh.position.y = -lowerLen / 2;
      lowerMesh.castShadow = true;
      elbow.add(lowerMesh);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.05, 6), accentMat);
      cuff.position.y = -lowerLen + 0.09;
      elbow.add(cuff);

      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.11, 0.085), skinMat);
      hand.position.y = -lowerLen + 0.01;
      hand.castShadow = true;
      elbow.add(hand);

      shoulder.add(elbow);
      chestGroup.add(shoulder);
      return { shoulder, elbow, hand };
    }

    /* Two-Segment Tapered PS1 Articulated Legs + Combat Boots */
    function makeArticulatedLeg(x, y) {
      const hip = new THREE.Group();
      hip.position.set(x, y, 0);
      const thighLen = 0.36;
      const shinLen = 0.35;
      const thighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.088, thighLen, 6), pantsMat);
      thighMesh.position.y = -thighLen / 2;
      thighMesh.castShadow = true;
      hip.add(thighMesh);

      const knee = new THREE.Group();
      knee.position.set(0, -thighLen + 0.02, 0);
      const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.06), darkMat);
      kneePad.position.set(0, -0.02, -0.075);
      knee.add(kneePad);
      const shinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.068, shinLen, 6), pantsMat);
      shinMesh.position.y = -shinLen / 2;
      shinMesh.castShadow = true;
      knee.add(shinMesh);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.26), accentMat);
      shoe.position.set(0, -shinLen + 0.04, -0.04);
      shoe.castShadow = true;
      knee.add(shoe);

      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.158, 0.035, 0.275), darkMat);
      sole.position.set(0, -shinLen - 0.01, -0.04);
      knee.add(sole);

      hip.add(knee);
      lowerBody.add(hip);
      return { hip, knee, shoe };
    }

    const leftArmObj = makeArticulatedArm(-0.38, 0.65);
    const rightArmObj = makeArticulatedArm(0.38, 0.65);
    const leftLegObj = makeArticulatedLeg(-0.15, -0.02);
    const rightLegObj = makeArticulatedLeg(0.15, -0.02);

    /* 3rd-person held weapons attached to right forearm (elbow) */
    const gunGroup = new THREE.Group();
    /* 1. Pistol mesh */
    const pistolMesh = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.095), steelMat);
    pSlide.position.set(0, -0.39, -0.03);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.14), darkMat);
    pGrip.position.set(0, -0.3, 0.03);
    pistolMesh.add(pSlide, pGrip);
    gunGroup.add(pistolMesh);

    /* 2. Vector Carbine Rifle mesh */
    const rifleMesh = new THREE.Group();
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.48, 0.13), darkMat);
    rBody.position.set(0, -0.44, -0.02);
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 6), steelMat);
    rBarrel.position.set(0, -0.74, -0.04);
    const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.19), accentMat);
    rMag.position.set(0, -0.48, 0.08);
    const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.18, 0.11), darkMat);
    rStock.position.set(0, -0.15, 0.0);
    rifleMesh.add(rBody, rBarrel, rMag, rStock);
    rifleMesh.visible = false;
    gunGroup.add(rifleMesh);

    /* 3. 3rd-Person Muzzle Flash Sprite */
    const flashTex = KC.makeGlowTexture ? KC.makeGlowTexture(0.35) : null;
    const muzzleFlash3P = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, color: 0xffc96e, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    muzzleFlash3P.position.set(0, -0.75, -0.04);
    muzzleFlash3P.scale.set(0.55, 0.55, 1);
    muzzleFlash3P.visible = false;
    gunGroup.add(muzzleFlash3P);

    rightArmObj.elbow.add(gunGroup);

    /* 3rd-person held flashlight attached to left forearm (elbow) */
    const torchGroup = new THREE.Group();
    const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.22, 6), darkMat);
    torchBody.position.set(0, -0.34, 0);
    torchGroup.add(torchBody);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff3cc, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    const torchCone = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.2, 10, 1, true), coneMat);
    torchCone.position.set(0, -2.05, 0);
    torchCone.visible = false;
    torchGroup.add(torchCone);
    leftArmObj.elbow.add(torchGroup);

    /* Ground contact shadow */
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 10),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    group.add(shadow);

    /* Optional nametag + voice indicator for multiplayer peers */
    let tagSprite = null;
    let tagCanvas = null;
    if (opts.showNametag) {
      tagCanvas = document.createElement('canvas');
      tagCanvas.width = 256;
      tagCanvas.height = 64;
      const tex = KC.makeCanvasTexture(tagCanvas, true);
      tagSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false
      }));
      tagSprite.position.set(0, 2.28, 0);
      tagSprite.scale.set(2.1, 0.52, 1);
      group.add(tagSprite);
    }

    const rig = {
      group,
      lowerBody,
      upperBody,
      chestGroup,
      headPivot,
      torso,
      hips,
      leftArm: leftArmObj.shoulder,
      leftForearm: leftArmObj.elbow,
      rightArm: rightArmObj.shoulder,
      rightForearm: rightArmObj.elbow,
      leftLeg: leftLegObj.hip,
      leftKnee: leftLegObj.knee,
      rightLeg: rightLegObj.hip,
      rightKnee: rightLegObj.knee,
      gunGroup,
      pistolMesh,
      rifleMesh,
      muzzleFlash3P,
      torchGroup,
      torchCone,
      shadow,
      tagSprite,
      tagCanvas,
      idleTime: Math.random() * 10,
      landingBounce: 0,
      updateNametag(name, speaking = false, dist = 0) {
        if (!tagCanvas || !tagSprite) return;
        const ctx = tagCanvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = speaking ? 'rgba(15, 38, 32, 0.88)' : 'rgba(11, 10, 14, 0.78)';
        ctx.fillRect(18, 10, 220, 42);
        ctx.strokeStyle = speaking ? '#57e6c2' : '#ffb13b';
        ctx.lineWidth = 3;
        ctx.strokeRect(18, 10, 220, 42);
        ctx.font = '700 22px Rajdhani, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = speaking ? '#57e6c2' : '#f2e8d5';
        const label = (speaking ? '🔊 ' : '') + (name || 'RUNNER').slice(0, 12) + (dist > 0 ? ' · ' + Math.round(dist) + 'm' : '');
        ctx.fillText(label, 128, 31);
        tagSprite.material.map.needsUpdate = true;
      }
    };

    if (opts.showNametag) rig.updateNametag(cfg.callsign || 'RUNNER', false, 0);
    return rig;
  };

  /* Procedural 3rd-Person Animation Engine for Player & Multiplayer Peers */
  KC.applyCharacterPose = function (rig, stateOpts) {
    if (!rig) return;
    const {
      dt = 0.016,
      walkPhase = 0,
      speedRatio = 0,
      strafeAngle = 0,
      turnRate = 0,
      crouching = false,
      sliding = false,
      onGround = true,
      vy = 0,
      landingImpact = 0,
      lean = 0,
      aiming = false,
      firing = false,
      recoilKick = 0,
      reloading = false,
      reloadProgress = 0,
      weaponIndex = 0,
      pitch = 0,
      flashlightOn = false,
      hasWeapon = true
    } = stateOpts;

    rig.idleTime = (rig.idleTime || 0) + dt;
    const t = rig.idleTime;
    const moveAmt = KC.clamp(speedRatio, 0, 1.45);
    const isSprinting = moveAmt > 1.05 && !crouching && !aiming;
    const crouchAmt = crouching ? 1 : 0;

    /* Weapon mesh visibility & 3P muzzle flash */
    if (rig.pistolMesh && rig.rifleMesh) {
      rig.pistolMesh.visible = hasWeapon && weaponIndex === 0;
      rig.rifleMesh.visible = hasWeapon && weaponIndex === 1;
    }
    if (rig.muzzleFlash3P) {
      rig.muzzleFlash3P.visible = !!firing;
      if (firing) {
        const s = 0.42 + Math.random() * 0.25;
        rig.muzzleFlash3P.scale.set(s, s, 1);
      }
    }

    /* 1. Pelvis / Lower Body Vertical Bounce, Crouch Drop & Strafe Steering */
    const strideBounce = onGround && !sliding
      ? Math.abs(Math.sin(walkPhase)) * 0.048 * Math.min(1.25, moveAmt)
      : 0;
    const breathe = Math.sin(t * 2.3) * 0.008 * (1 - Math.min(1, moveAmt));
    const crouchDrop = crouchAmt * 0.29 + (sliding ? 0.34 : 0) + landingImpact * 0.14;

    const targetHipY = 0.75 - crouchDrop + strideBounce;
    const targetSpineY = 0.78 - crouchDrop + strideBounce + breathe;
    rig.lowerBody.position.y = KC.lerp(rig.lowerBody.position.y, targetHipY, 0.28);
    rig.upperBody.position.y = KC.lerp(rig.upperBody.position.y, targetSpineY, 0.28);

    /* Steer lower body into diagonal/sideways strafe direction */
    const targetLowerYaw = onGround && moveAmt > 0.1 ? KC.clamp(strafeAngle * 0.65, -0.78, 0.78) : 0;
    rig.lowerBody.rotation.y = KC.lerp(rig.lowerBody.rotation.y, targetLowerYaw, 0.22);
    rig.lowerBody.rotation.z = KC.lerp(rig.lowerBody.rotation.z, Math.cos(walkPhase) * 0.045 * Math.min(1, moveAmt), 0.25);

    /* 2. Spine Forward Pitch, Lean Roll & Counter-Rotation Twist */
    const forwardRunLean = sliding ? -0.46 : (isSprinting ? 0.22 : moveAmt * 0.09) + crouchAmt * 0.24;
    const targetSpineX = forwardRunLean - recoilKick * 0.14;
    const targetSpineZ = -lean * 0.32 - KC.clamp(turnRate * 0.08, -0.14, 0.14);
    const counterTwistY = onGround && !sliding
      ? -Math.sin(walkPhase) * (isSprinting ? 0.18 : 0.1) * Math.min(1.2, moveAmt)
      : 0;

    rig.upperBody.rotation.x = KC.lerp(rig.upperBody.rotation.x, targetSpineX, 0.25);
    rig.upperBody.rotation.z = KC.lerp(rig.upperBody.rotation.z, targetSpineZ, 0.25);
    if (rig.chestGroup) {
      const aimTorsoYaw = aiming ? (weaponIndex === 1 ? 0.22 : 0.12) : 0;
      rig.chestGroup.rotation.y = KC.lerp(rig.chestGroup.rotation.y, counterTwistY + aimTorsoYaw - targetLowerYaw * 0.35, 0.25);
      /* Subtle breathing chest scale */
      const bScale = 1 + Math.sin(t * 2.3) * 0.012;
      rig.chestGroup.scale.set(bScale, 1, bScale);
    }

    /* 3. Head Look Pitch & Subtle Turn/Aim Compensation */
    const reloadHeadPitch = reloading ? -0.35 * Math.sin(reloadProgress * Math.PI) : 0;
    rig.headPivot.rotation.x = KC.lerp(
      rig.headPivot.rotation.x,
      KC.clamp(pitch * 0.72 - targetSpineX * 0.45 + reloadHeadPitch, -0.75, 0.75),
      0.3
    );
    rig.headPivot.rotation.y = KC.lerp(
      rig.headPivot.rotation.y,
      aiming ? -0.1 : Math.sin(t * 0.8) * 0.04 * (1 - Math.min(1, moveAmt)),
      0.22
    );
    rig.headPivot.rotation.z = KC.lerp(rig.headPivot.rotation.z, aiming ? -0.06 : 0, 0.22);

    /* 4. Articulated Legs (Hip Thigh + Knee Flexion for Walk, Run, Crouch, Slide, Jump) */
    let lHipX = 0, rHipX = 0, lKneeX = 0, rKneeX = 0, lHipZ = 0, rHipZ = 0;

    if (!onGround) {
      /* Dynamic mid-air jump / fall pose */
      const airLift = KC.clamp(vy * 0.08, -0.3, 0.35);
      lHipX = 0.55 + airLift;
      lKneeX = -0.95;
      rHipX = -0.25 + airLift * 0.5;
      rKneeX = -0.65;
      lHipZ = -0.06;
      rHipZ = 0.06;
    } else if (sliding) {
      /* Tactical slide: lead leg extended forward, trail leg tucked under */
      lHipX = 1.15;
      lKneeX = -0.22;
      rHipX = 0.42;
      rKneeX = -1.35;
      lHipZ = -0.08;
      rHipZ = 0.12;
    } else if (crouching && moveAmt < 0.08) {
      /* Stationary tactical crouch: thighs pitched forward, knees bent back */
      lHipX = 0.78;
      lKneeX = -1.32;
      rHipX = 0.52;
      rKneeX = -1.18;
      lHipZ = -0.05;
      rHipZ = 0.05;
    } else {
      /* Biomechanical walking / running / crouch-walking gait cycle */
      const amp = isSprinting ? 0.82 : (crouching ? 0.52 : 0.62) * Math.min(1.15, moveAmt);
      const lSin = Math.sin(walkPhase);
      const rSin = Math.sin(walkPhase + Math.PI);
      const crouchThighBias = crouchAmt * 0.65;
      const crouchKneeBias = -crouchAmt * 0.95;

      lHipX = lSin * amp + crouchThighBias;
      rHipX = rSin * amp + crouchThighBias;

      /* Knee bends during back-to-front recovery phase (cos(phase - 0.4) > 0) */
      const kneeAmp = (isSprinting ? 1.25 : 0.88) * Math.min(1.15, moveAmt);
      const lBend = Math.max(0, Math.cos(walkPhase - 0.38)) * kneeAmp;
      const rBend = Math.max(0, Math.cos(walkPhase + Math.PI - 0.38)) * kneeAmp;
      lKneeX = -lBend + crouchKneeBias - landingImpact * 0.45;
      rKneeX = -rBend + crouchKneeBias - landingImpact * 0.45;

      lHipZ = -0.03 * Math.min(1, moveAmt);
      rHipZ = 0.03 * Math.min(1, moveAmt);
    }

    rig.leftLeg.rotation.x = KC.lerp(rig.leftLeg.rotation.x, lHipX, 0.32);
    rig.rightLeg.rotation.x = KC.lerp(rig.rightLeg.rotation.x, rHipX, 0.32);
    rig.leftLeg.rotation.z = KC.lerp(rig.leftLeg.rotation.z, lHipZ, 0.25);
    rig.rightLeg.rotation.z = KC.lerp(rig.rightLeg.rotation.z, rHipZ, 0.25);
    if (rig.leftKnee && rig.rightKnee) {
      rig.leftKnee.rotation.x = KC.lerp(rig.leftKnee.rotation.x, lKneeX, 0.35);
      rig.rightKnee.rotation.x = KC.lerp(rig.rightKnee.rotation.x, rKneeX, 0.35);
    }

    /* 5. Articulated Arms & Forearms (Weapon Aim, Recoil, Reload, Sprint Swing & Flashlight) */
    const armSwing = Math.sin(walkPhase) * (isSprinting ? 0.72 : 0.45) * Math.min(1.2, moveAmt);
    let rShoulderX = 0, rShoulderY = 0, rShoulderZ = 0, rElbowX = 0.22;
    let lShoulderX = 0, lShoulderY = 0, lShoulderZ = 0, lElbowX = 0.22;

    if (reloading && hasWeapon) {
      /* 3rd-Person Reload Animation: right hand holds gun tilted in, left hand fetches mag -> inserts */
      const reloadWave = Math.sin(reloadProgress * Math.PI);
      rShoulderX = 0.85 + pitch * 0.3;
      rShoulderY = -0.28;
      rElbowX = 0.55;

      lShoulderX = 0.35 + reloadWave * 0.75;
      lShoulderY = 0.15 + reloadWave * 0.38;
      lElbowX = 0.35 + reloadWave * 0.65;
    } else if (hasWeapon && (aiming || firing || recoilKick > 0.04)) {
      /* Combat Aiming / Firing Pose (Two-Handed Grip + Recoil Kick) */
      const kickPitch = recoilKick * 0.38;
      if (weaponIndex === 1) {
        /* Vector Carbine Rifle two-handed shouldered stance */
        rShoulderX = 1.28 + pitch * 0.78 + kickPitch;
        rShoulderY = -0.18;
        rElbowX = 0.32 + recoilKick * 0.18;
      } else {
        /* 9mm Pistol two-handed extended stance */
        rShoulderX = 1.44 + pitch * 0.78 + kickPitch;
        rShoulderY = -0.12;
        rElbowX = 0.14 + recoilKick * 0.22;
      }
      /* Left arm: if flashlight is on, hold flashlight alongside weapon; else two-hand support grip */
      if (flashlightOn) {
        lShoulderX = 1.42 + pitch * 0.72;
        lShoulderY = 0.08;
        lElbowX = 0.18;
      } else {
        lShoulderX = 1.28 + pitch * 0.75 + kickPitch * 0.7;
        lShoulderY = 0.44;
        lElbowX = 0.42;
      }
    } else if (hasWeapon) {
      /* Relaxed Low-Ready Weapon Carry while walking / sprinting / standing */
      if (isSprinting) {
        /* Athletic sprint pump with weapon tucked safely across chest */
        rShoulderX = 0.55 + armSwing * 0.55;
        rShoulderY = -0.25;
        rElbowX = 0.75;
      } else {
        rShoulderX = 0.58 + pitch * 0.28 - armSwing * 0.25;
        rShoulderY = -0.12;
        rShoulderZ = 0.05;
        rElbowX = 0.48;
      }

      if (flashlightOn) {
        lShoulderX = 1.42 + pitch * 0.68;
        lShoulderY = -0.06;
        lElbowX = 0.14;
      } else if (weaponIndex === 1 && moveAmt < 0.9) {
        /* Left hand supports rifle foregrip in low-ready */
        lShoulderX = 0.62 + pitch * 0.25 - armSwing * 0.2;
        lShoulderY = 0.38;
        lElbowX = 0.52;
      } else {
        /* Natural left arm walk/sprint swing with elbow bend */
        lShoulderX = -armSwing;
        lShoulderZ = -0.04;
        lElbowX = 0.24 + Math.max(0, -armSwing) * (isSprinting ? 0.85 : 0.45);
      }
    } else {
      /* Unarmed natural arm swing */
      rShoulderX = armSwing;
      rElbowX = 0.22 + Math.max(0, armSwing) * 0.55;
      lShoulderX = -armSwing;
      lElbowX = 0.22 + Math.max(0, -armSwing) * 0.55;
    }

    if (!onGround) {
      /* Mid-air balance arms */
      lShoulderZ = -0.28;
      rShoulderZ = 0.22;
    }

    rig.rightArm.rotation.x = KC.lerp(rig.rightArm.rotation.x, rShoulderX, 0.32);
    rig.rightArm.rotation.y = KC.lerp(rig.rightArm.rotation.y, rShoulderY, 0.28);
    rig.rightArm.rotation.z = KC.lerp(rig.rightArm.rotation.z, rShoulderZ, 0.25);
    if (rig.rightForearm) {
      rig.rightForearm.rotation.x = KC.lerp(rig.rightForearm.rotation.x, rElbowX, 0.35);
    }

    rig.leftArm.rotation.x = KC.lerp(rig.leftArm.rotation.x, lShoulderX, 0.32);
    rig.leftArm.rotation.y = KC.lerp(rig.leftArm.rotation.y, lShoulderY, 0.28);
    rig.leftArm.rotation.z = KC.lerp(rig.leftArm.rotation.z, lShoulderZ, 0.25);
    if (rig.leftForearm) {
      rig.leftForearm.rotation.x = KC.lerp(rig.leftForearm.rotation.x, lElbowX, 0.35);
    }

    if (rig.torchCone) rig.torchCone.visible = !!flashlightOn;
    if (rig.gunGroup) rig.gunGroup.visible = !!hasWeapon;
  };

  /* Render a 2D low-poly preview card of the customized character */
  KC.drawCharPreviewCanvas = function (canvas, cfg = KC.charConfig) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const O = KC.CHAR_OPTIONS;
    const skin = (O.skins[cfg.skinIdx] || O.skins[0]).css;
    const hair = (O.hairColors[cfg.hairColorIdx] || O.hairColors[0]).css;
    const shirt = (O.shirtColors[cfg.shirtColorIdx] || O.shirtColors[0]).css;
    const accent = (O.accentColors[cfg.accentColorIdx] || O.accentColors[0]).css;
    const pants = (O.pantsColors[cfg.pantsColorIdx] || O.pantsColors[0]).css;

    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.5, W * 0.65);
    bg.addColorStop(0, '#1d2230');
    bg.addColorStop(1, '#09090d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* Grid floor lines */
    ctx.strokeStyle = 'rgba(255,177,59,0.16)';
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 28) {
      ctx.beginPath(); ctx.moveTo(x, H - 46); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, H - 46); ctx.lineTo(W, H - 46); ctx.stroke();

    const cx = W / 2;
    /* Shadow */
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, H - 28, 44, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Legs & Shoes */
    ctx.fillStyle = pants;
    ctx.fillRect(cx - 26, H - 102, 22, 62);
    ctx.fillRect(cx + 4, H - 102, 22, 62);
    ctx.fillStyle = accent;
    ctx.fillRect(cx - 28, H - 42, 25, 13);
    ctx.fillRect(cx + 4, H - 42, 25, 13);

    /* Backpack (behind torso) */
    if (cfg.accessory === 'backpack') {
      ctx.fillStyle = '#181a22';
      ctx.fillRect(cx - 38, H - 176, 76, 58);
    }

    /* Arms */
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 48, H - 178, 17, 64);
    ctx.fillRect(cx + 31, H - 178, 17, 64);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 48, H - 118, 17, 14);
    ctx.fillRect(cx + 31, H - 118, 17, 14);

    /* Torso */
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 30, H - 182, 60, 82);

    /* Outfit overlays */
    if (cfg.outfit === 'jacket') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 4, H - 182, 8, 82);
      ctx.fillRect(cx - 30, H - 184, 60, 10);
    } else if (cfg.outfit === 'kc_jersey') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 30, H - 168, 60, 8);
      ctx.font = '700 28px Anton, Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('15', cx, H - 130);
    } else if (cfg.outfit === 'tactical') {
      ctx.fillStyle = '#161820';
      ctx.fillRect(cx - 28, H - 174, 56, 62);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 20, H - 142, 40, 16);
    } else if (cfg.outfit === 'suit') {
      ctx.fillStyle = '#f2e8d5';
      ctx.fillRect(cx - 10, H - 182, 20, 56);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 3, H - 180, 6, 52);
    } else if (cfg.outfit === 'hoodie') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 20, H - 130, 40, 22);
    }

    if (cfg.accessory === 'chain') {
      ctx.strokeStyle = '#ffd15c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, H - 176, 15, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    /* Head */
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 22, H - 234, 44, 46);

    /* Eyes */
    ctx.fillStyle = '#111217';
    ctx.fillRect(cx - 13, H - 216, 7, 8);
    ctx.fillRect(cx + 6, H - 216, 7, 8);

    /* Shades / Bandana */
    if (cfg.accessory === 'shades') {
      ctx.fillStyle = '#0e1015';
      ctx.fillRect(cx - 23, H - 219, 46, 13);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 23, H - 219, 46, 2);
    } else if (cfg.accessory === 'bandana') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 23, H - 204, 46, 18);
    }

    /* Hair / Headgear */
    if (cfg.hairStyle === 'fade') {
      ctx.fillStyle = hair;
      ctx.fillRect(cx - 23, H - 244, 46, 14);
    } else if (cfg.hairStyle === 'cap') {
      ctx.fillStyle = hair;
      ctx.fillRect(cx - 24, H - 247, 48, 16);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 24, H - 234, 56, 5);
    } else if (cfg.hairStyle === 'beanie') {
      ctx.fillStyle = hair;
      ctx.fillRect(cx - 25, H - 252, 50, 20);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 26, H - 236, 52, 6);
    } else if (cfg.hairStyle === 'cowboy') {
      ctx.fillStyle = hair;
      ctx.fillRect(cx - 38, H - 236, 76, 6);
      ctx.fillRect(cx - 22, H - 254, 44, 18);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 22, H - 240, 44, 4);
    } else if (cfg.hairStyle === 'afro') {
      ctx.fillStyle = hair;
      ctx.fillRect(cx - 32, H - 258, 64, 30);
    } else if (cfg.hairStyle === 'visor') {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 25, H - 236, 54, 7);
    } else if (cfg.hairStyle === 'hood') {
      ctx.strokeStyle = hair;
      ctx.lineWidth = 7;
      ctx.strokeRect(cx - 25, H - 238, 50, 52);
    }

    /* Callsign badge */
    ctx.fillStyle = 'rgba(11,10,14,0.82)';
    ctx.fillRect(12, 12, W - 24, 26);
    ctx.strokeStyle = 'rgba(255,177,59,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, W - 24, 26);
    ctx.fillStyle = '#ffb13b';
    ctx.font = '700 13px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((cfg.callsign || 'KC_OUTLAW').toUpperCase(), cx, 29);
  };

  /* ============================================================
     Multiplayer Session & Proximity Voice Chat Engine (45m Range)
     ============================================================ */
  const VOICE_MAX_RANGE = 45;
  const VOICE_REF_RANGE = 5;

  class MultiplayerManager {
    constructor() {
      this.clientId = 'p_' + Math.random().toString(36).slice(2, 9);
      this.roomCode = this._readUrlRoom() || 'KC-2026';
      this.connected = false;
      this.transportName = 'LOCAL MESH';
      this.ws = null;
      this.bc = null;
      /* Serverless Global WebRTC P2P Room Mesh (PeerJS + Google STUN) */
      this.rtcPeer = null;
      this.rtcIsHost = false;
      this.rtcConnections = new Map();
      this.rtcReady = false;
      this.lanUrls = [];
      this.peers = new Map();
      this.botsEnabled = true;
      this.syncTimer = 0;

      /* Voice Chat state */
      this.voiceMode = 'ptt';
      this.pttActive = false;
      this.micStream = null;
      this.micProcessor = null;
      this.micLevel = 0;
      this.synthVoiceTimer = 0;
      this.nearbySpeakers = [];
    }

    _readUrlRoom() {
      try {
        const params = new URLSearchParams(window.location.search);
        const r = params.get('room');
        if (r && r.trim()) return r.trim().toUpperCase().slice(0, 12);
      } catch (e) {}
      return null;
    }

    _syncUrlRoom() {
      try {
        if (window.history && window.history.replaceState && location.protocol !== 'file:') {
          const u = new URL(window.location.href);
          u.searchParams.set('room', this.roomCode);
          window.history.replaceState({}, '', u.toString());
        }
      } catch (e) {}
    }

    getInviteUrl() {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', this.roomCode);
        return u.toString();
      } catch (e) {
        return location.origin + '/?room=' + encodeURIComponent(this.roomCode);
      }
    }

    async copyInviteLink() {
      const url = this.getInviteUrl();
      this._syncUrlRoom();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          return { ok: true, url };
        }
      } catch (e) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return { ok: true, url };
      } catch (e) {
        return { ok: false, url };
      }
    }

    init(scene, soundEngine) {
      this.scene = scene;
      this.sound = soundEngine;
      this._syncUrlRoom();

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          this.bc = new BroadcastChannel('heartland26_mp_session');
          this.bc.onmessage = (ev) => this._onMessage(ev.data);
          this.connected = true;
        } catch (e) {}
      }

      this._connectWebSocket();
      this._fetchHostInfo();
      this._connectWebRTCRoom();

      if (this.botsEnabled) {
        this._spawnSessionRunners();
      }
      this.updateSessionUI();
    }

    _isStaticHost() {
      const h = (location.hostname || '').toLowerCase();
      return (
        h.endsWith('.github.io') ||
        h.endsWith('.pages.dev') ||
        h.endsWith('.netlify.app') ||
        h.endsWith('.vercel.app') ||
        h.endsWith('.itch.zone')
      );
    }

    _fetchHostInfo() {
      if (typeof fetch === 'undefined' || location.protocol === 'file:' || this._isStaticHost()) return;
      fetch('/api/host-info')
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          if (info && Array.isArray(info.lanIps) && info.lanIps.length) {
            this.lanUrls = info.lanIps.map((ip) => 'http://' + ip + ':' + (info.port || 8080) + '/?room=' + encodeURIComponent(this.roomCode));
            this.updateSessionUI();
          }
        })
        .catch(() => {});
    }

    _refreshTransportBadge() {
      const hasWs = !!(this.ws && this.ws.readyState === 1);
      const hasRtc = this.rtcReady;
      const isGhPages = (location.hostname || '').toLowerCase().endsWith('.github.io');
      if (hasWs && hasRtc) {
        this.transportName = 'LIVE SERVER + GLOBAL P2P';
      } else if (hasWs) {
        this.transportName = 'LIVE SERVER';
      } else if (hasRtc) {
        this.transportName = isGhPages ? 'GITHUB PAGES P2P MESH' : (this.rtcIsHost ? 'GLOBAL P2P HOST' : 'GLOBAL P2P MESH');
      } else {
        this.transportName = 'LOCAL MESH';
      }
    }

    _connectWebSocket() {
      if (typeof WebSocket === 'undefined' || location.protocol === 'file:') return;
      try {
        const params = new URLSearchParams(window.location.search);
        const customWs = params.get('ws');
        if (!customWs && this._isStaticHost()) return;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = customWs
          ? (customWs + (customWs.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(this.roomCode))
          : (proto + '//' + location.host + '/ws?room=' + encodeURIComponent(this.roomCode));
        const ws = new WebSocket(url);
        ws.onopen = () => {
          this.ws = ws;
          this.connected = true;
          this._refreshTransportBadge();
          this._send({
            type: 'join',
            id: this.clientId,
            room: this.roomCode,
            char: KC.charConfig
          });
          this.updateSessionUI();
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            this._onMessage(msg);
          } catch (e) {}
        };
        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null;
            this._refreshTransportBadge();
            this.updateSessionUI();
          }
        };
        ws.onerror = () => {};
      } catch (e) {}
    }

    /* Serverless Global WebRTC P2P Room Mesh (Works on GitHub Pages, Netlify, Cloudflare Pages & anywhere!) */
    _ensurePeerJSLoaded() {
      if (typeof window.Peer === 'function') return Promise.resolve(true);
      if (this._peerJsPromise) return this._peerJsPromise;
      this._peerJsPromise = new Promise((resolve) => {
        try {
          const s = document.createElement('script');
          s.src = 'vendor/peerjs.min.js';
          s.async = true;
          const timer = setTimeout(() => resolve(false), 4500);
          s.onload = () => { clearTimeout(timer); resolve(typeof window.Peer === 'function'); };
          s.onerror = () => { clearTimeout(timer); resolve(false); };
          document.head.appendChild(s);
        } catch (e) {
          resolve(false);
        }
      });
      return this._peerJsPromise;
    }

    _roomSlotPeerId(slot = 0) {
      const safe = this.roomCode.replace(/[^A-Z0-9_-]/gi, '').toUpperCase() || 'KC2026';
      return 'heartland26-kc-' + safe + '-s' + slot;
    }

    _closeWebRTC() {
      if (this._rtcMeshInterval) {
        clearInterval(this._rtcMeshInterval);
        this._rtcMeshInterval = null;
      }
      for (const conn of this.rtcConnections.values()) {
        try { conn.close(); } catch (e) {}
      }
      this.rtcConnections.clear();
      if (this.rtcPeer) {
        try { this.rtcPeer.destroy(); } catch (e) {}
        this.rtcPeer = null;
      }
      this.rtcReady = false;
      this.rtcIsHost = false;
      this.rtcSlot = -1;
    }

    async _connectWebRTCRoom() {
      this._closeWebRTC();
      const loaded = await this._ensurePeerJSLoaded();
      if (!loaded || typeof window.Peer !== 'function') return;

      const MAX_SLOTS = 6;
      const targetRoom = this.roomCode;
      const peerConfig = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      };

      const wireConn = (conn) => {
        if (!conn) return;
        conn.on('open', () => {
          this.rtcConnections.set(conn.peer, conn);
          this.rtcReady = true;
          this.connected = true;
          this._refreshTransportBadge();
          this.updateSessionUI();
          try {
            conn.send({
              type: 'join',
              id: this.clientId,
              room: this.roomCode,
              char: KC.charConfig
            });
          } catch (e) {}
        });
        conn.on('data', (data) => {
          try {
            const msg = typeof data === 'string' ? JSON.parse(data) : data;
            if (this.rtcIsHost && msg && msg.id !== this.clientId && !msg._relayed) {
              const relayMsg = { ...msg, _relayed: true };
              for (const [pid, otherConn] of this.rtcConnections.entries()) {
                if (pid !== conn.peer && otherConn.open) {
                  try { otherConn.send(relayMsg); } catch (e) {}
                }
              }
            }
            this._onMessage(msg);
          } catch (e) {}
        });
        conn.on('close', () => {
          this.rtcConnections.delete(conn.peer);
          this.updateSessionUI();
        });
        conn.on('error', () => {
          this.rtcConnections.delete(conn.peer);
        });
      };

      const connectToOtherSlots = (myPeer, mySlot) => {
        if (!myPeer || myPeer.destroyed || this.roomCode !== targetRoom) return;
        for (let s = 0; s < MAX_SLOTS; s++) {
          if (s === mySlot) continue;
          const targetId = this._roomSlotPeerId(s);
          if (this.rtcConnections.has(targetId)) continue;
          try {
            const conn = myPeer.connect(targetId, { reliable: false });
            wireConn(conn);
          } catch (e) {}
        }
      };

      const tryClaimSlot = (slotIdx) => {
        if (this.roomCode !== targetRoom) return;
        if (slotIdx >= MAX_SLOTS) {
          /* All 6 primary slots occupied -> join as overflow client connected to slot 0 & 1 */
          const overflowPeer = new window.Peer(undefined, peerConfig);
          this.rtcPeer = overflowPeer;
          this.rtcIsHost = false;
          this.rtcSlot = slotIdx;
          overflowPeer.on('open', () => {
            this.rtcReady = true;
            this.connected = true;
            this._refreshTransportBadge();
            this.updateSessionUI();
            connectToOtherSlots(overflowPeer, -1);
          });
          overflowPeer.on('connection', (conn) => wireConn(conn));
          overflowPeer.on('error', () => {});
          return;
        }

        const slotPeerId = this._roomSlotPeerId(slotIdx);
        const candidate = new window.Peer(slotPeerId, peerConfig);
        let opened = false;

        candidate.on('open', () => {
          opened = true;
          this.rtcPeer = candidate;
          this.rtcSlot = slotIdx;
          this.rtcIsHost = slotIdx === 0;
          this.rtcReady = true;
          this.connected = true;
          this._refreshTransportBadge();
          this.updateSessionUI();
          /* Connect to all prior slots (0 .. slotIdx - 1) immediately */
          for (let prev = 0; prev < slotIdx; prev++) {
            try {
              const conn = candidate.connect(this._roomSlotPeerId(prev), { reliable: false });
              wireConn(conn);
            } catch (e) {}
          }
        });
        candidate.on('connection', (conn) => wireConn(conn));
        candidate.on('error', (err) => {
          if (!opened && err && err.type === 'unavailable-id') {
            try { candidate.destroy(); } catch (e) {}
            tryClaimSlot(slotIdx + 1);
          }
        });
      };

      try {
        tryClaimSlot(0);
      } catch (e) {}
    }

    joinRoom(code) {
      const cleaned = (code || 'KC-2026').trim().toUpperCase().slice(0, 12) || 'KC-2026';
      this.roomCode = cleaned;
      this._syncUrlRoom();
      for (const [id, peer] of this.peers.entries()) {
        if (!peer.isBot) {
          if (peer.rig && peer.rig.group) this.scene.remove(peer.rig.group);
          this.peers.delete(id);
        }
      }
      if (this.ws) {
        try { this.ws.close(); } catch (e) {}
        this.ws = null;
      }
      this._connectWebSocket();
      this._fetchHostInfo();
      this._connectWebRTCRoom();
      this._send({ type: 'join', id: this.clientId, room: this.roomCode, char: KC.charConfig });
      this.updateSessionUI();
    }

    setBotsEnabled(enabled) {
      this.botsEnabled = !!enabled;
      if (!this.botsEnabled) {
        for (const [id, peer] of this.peers.entries()) {
          if (peer.isBot) {
            if (peer.rig && peer.rig.group) this.scene.remove(peer.rig.group);
            this.peers.delete(id);
          }
        }
      } else {
        const hasBots = Array.from(this.peers.values()).some((p) => p.isBot);
        if (!hasBots) this._spawnSessionRunners();
      }
      this.updateSessionUI();
    }

    _spawnSessionRunners() {
      const botConfigs = [
        {
          id: 'bot_mahomes',
          x: 8, z: 18,
          axis: 'v', line: 20, dir: 1,
          voicePitch: 175,
          weaponIndex: 1,
          char: { callsign: 'SHOWTIME_15', skinIdx: 1, hairStyle: 'cap', hairColorIdx: 4, outfit: 'kc_jersey', shirtColorIdx: 0, accentColorIdx: 0, pantsColorIdx: 5, accessory: 'shades' }
        },
        {
          id: 'bot_crossroads',
          x: -14, z: 6,
          axis: 'h', line: 20, dir: -1,
          voicePitch: 215,
          weaponIndex: 0,
          char: { callsign: 'CROSSROADS_X', skinIdx: 0, hairStyle: 'beanie', hairColorIdx: 5, outfit: 'hoodie', shirtColorIdx: 4, accentColorIdx: 1, pantsColorIdx: 0, accessory: 'backpack' }
        },
        {
          id: 'bot_vine',
          x: 24, z: -12,
          axis: 'v', line: -20, dir: -1,
          voicePitch: 155,
          weaponIndex: 1,
          char: { callsign: 'VINE_RUNNER', skinIdx: 2, hairStyle: 'afro', hairColorIdx: 0, outfit: 'jacket', shirtColorIdx: 2, accentColorIdx: 2, pantsColorIdx: 1, accessory: 'chain' }
        }
      ];

      for (const b of botConfigs) {
        if (this.peers.has(b.id)) continue;
        const rig = KC.buildCustomPersonMesh(b.char, { showNametag: true });
        rig.group.position.set(b.x, 0.14, b.z);
        this.scene.add(rig.group);
        this.peers.set(b.id, {
          id: b.id,
          isBot: true,
          room: this.roomCode,
          char: b.char,
          rig,
          x: b.x,
          y: 0.14,
          z: b.z,
          targetX: b.x,
          targetY: 0.14,
          targetZ: b.z,
          yaw: 0,
          pitch: 0,
          speed: 3.4,
          walkPhase: Math.random() * 10,
          crouching: false,
          lean: 0,
          aiming: false,
          weaponIndex: b.weaponIndex,
          flashlightOn: false,
          speaking: false,
          speakTimer: KC.rand(2, 7),
          speakDuration: 0,
          chatterCooldown: 0,
          voicePitch: b.voicePitch,
          axis: b.axis,
          line: b.line,
          dir: b.dir
        });
      }
      this.updateSessionUI();
    }

    _send(payload) {
      payload.room = this.roomCode;
      payload.id = this.clientId;
      if (this.bc) {
        try { this.bc.postMessage(payload); } catch (e) {}
      }
      if (this.ws && this.ws.readyState === 1) {
        try { this.ws.send(JSON.stringify(payload)); } catch (e) {}
      }
      for (const conn of this.rtcConnections.values()) {
        if (conn && conn.open) {
          try { conn.send(payload); } catch (e) {}
        }
      }
    }

    broadcastShot(from, to, color = 0xffd08a) {
      this._send({
        type: 'shot',
        from: [from.x, from.y, from.z],
        to: [to.x, to.y, to.z],
        color
      });
    }

    broadcastWorldSettings(settings) {
      this._send({
        type: 'world_settings',
        settings
      });
    }

    _onMessage(msg) {
      if (!msg || msg.id === this.clientId || msg.room !== this.roomCode) return;

      if (msg.type === 'world_settings' && msg.settings && window.HEARTLAND && window.HEARTLAND.applyWorldSettings) {
        window.HEARTLAND.applyWorldSettings(msg.settings, false);
        return;
      }

      if (msg.type === 'state' || msg.type === 'join') {
        let peer = this.peers.get(msg.id);
        if (!peer) {
          const cfg = msg.char || DEFAULT_CHAR;
          const rig = KC.buildCustomPersonMesh(cfg, { showNametag: true });
          rig.group.position.set(msg.x || 0, msg.y || 0.14, msg.z || 0);
          this.scene.add(rig.group);
          peer = {
            id: msg.id,
            isBot: false,
            room: msg.room,
            char: cfg,
            rig,
            x: msg.x || 0,
            y: msg.y || 0.14,
            z: msg.z || 0,
            targetX: msg.x || 0,
            targetY: msg.y || 0.14,
            targetZ: msg.z || 0,
            yaw: msg.yaw || 0,
            pitch: msg.pitch || 0,
            crouching: !!msg.crouching,
            sliding: !!msg.sliding,
            onGround: msg.onGround !== false,
            lean: msg.lean || 0,
            aiming: !!msg.aiming,
            reloading: !!msg.reloading,
            weaponIndex: msg.weaponIndex || 0,
            flashlightOn: !!msg.flashlightOn,
            inCar: !!msg.inCar,
            team: msg.team || 'blue',
            vehId: msg.vehId || null,
            seat: msg.seat || null,
            speaking: !!msg.speaking,
            walkPhase: 0,
            lastSeen: performance.now()
          };
          this.peers.set(msg.id, peer);
          this.updateSessionUI();
        } else {
          peer.lastSeen = performance.now();
          if (msg.x !== undefined) {
            peer.targetX = msg.x;
            peer.targetY = msg.y || 0.14;
            peer.targetZ = msg.z;
            peer.yaw = msg.yaw || 0;
            peer.pitch = msg.pitch || 0;
            peer.crouching = !!msg.crouching;
            peer.sliding = !!msg.sliding;
            peer.onGround = msg.onGround !== false;
            peer.lean = msg.lean || 0;
            peer.aiming = !!msg.aiming;
            peer.reloading = !!msg.reloading;
            peer.weaponIndex = msg.weaponIndex || 0;
            peer.flashlightOn = !!msg.flashlightOn;
            peer.inCar = !!msg.inCar;
            peer.team = msg.team || peer.team || 'blue';
            peer.vehId = msg.vehId || null;
            peer.seat = msg.seat || null;
            peer.speaking = !!msg.speaking;
          }
          if (msg.char && JSON.stringify(msg.char) !== JSON.stringify(peer.char)) {
            peer.char = msg.char;
            this.scene.remove(peer.rig.group);
            peer.rig = KC.buildCustomPersonMesh(peer.char, { showNametag: true });
            this.scene.add(peer.rig.group);
          }
        }
      } else if (msg.type === 'shot' && window.HEARTLAND && window.HEARTLAND.addTracer) {
        const f = new THREE.Vector3(msg.from[0], msg.from[1], msg.from[2]);
        const t = new THREE.Vector3(msg.to[0], msg.to[1], msg.to[2]);
        window.HEARTLAND.addTracer(f, t, msg.color || 0xffd08a, 0.8);
      } else if (msg.type === 'voice') {
        const peer = this.peers.get(msg.id);
        if (!peer) return;
        peer.speaking = true;
        peer.lastVoiceTime = performance.now();
        this._handleIncomingVoice(peer, msg.samples);
      }
    }

    /* ---------------- Proximity Voice Chat (45m spatial range) ---------------- */
    async enableMicrophone() {
      if (this.micStream) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        if (this.sound) this.sound.init();
        const ctx = this.sound && this.sound.ctx;
        if (ctx) {
          const source = ctx.createMediaStreamSource(this.micStream);
          const proc = ctx.createScriptProcessor(1024, 1, 1);
          proc.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
            const rms = Math.sqrt(sum / input.length);
            this.micLevel = rms;
            const active = this.voiceMode === 'open' ? (rms > 0.015) : this.pttActive;
            if (!active) return;
            const step = Math.max(1, Math.round(ctx.sampleRate / 16000));
            const out = [];
            for (let i = 0; i < input.length; i += step) {
              out.push(Math.round(KC.clamp(input[i], -1, 1) * 100) / 100);
            }
            this._send({ type: 'voice', samples: out });
          };
          const zeroGain = ctx.createGain();
          zeroGain.gain.value = 0;
          source.connect(proc);
          proc.connect(zeroGain);
          zeroGain.connect(ctx.destination);
          this.micProcessor = proc;
        }
        return true;
      } catch (e) {
        return false;
      }
    }

    setPushToTalk(active) {
      const changed = this.pttActive !== active;
      this.pttActive = active;
      if (active && !this.micStream) {
        this.enableMicrophone();
      }
      if (changed) this.updateVoiceHUD();
    }

    toggleVoiceMode() {
      this.voiceMode = this.voiceMode === 'ptt' ? 'open' : 'ptt';
      if (this.voiceMode === 'open') this.enableMicrophone();
      this.updateVoiceHUD();
      return this.voiceMode;
    }

    _computeSpatialVoice(peerX, peerZ, listenerPos, listenerYaw) {
      const dx = peerX - listenerPos.x;
      const dz = peerZ - listenerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > VOICE_MAX_RANGE) return { inRange: false, dist, gain: 0, pan: 0 };
      const norm = KC.clamp(1 - Math.max(0, dist - VOICE_REF_RANGE) / (VOICE_MAX_RANGE - VOICE_REF_RANGE), 0, 1);
      const gain = Math.pow(norm, 1.35);
      const rightX = Math.cos(listenerYaw), rightZ = -Math.sin(listenerYaw);
      const len = Math.max(0.001, dist);
      const pan = KC.clamp((dx / len) * rightX + (dz / len) * rightZ, -1, 1);
      return { inRange: true, dist, gain, pan };
    }

    _handleIncomingVoice(peer, samples) {
      if (!window.HEARTLAND || !this.sound) return;
      const player = window.HEARTLAND.player;
      const sp = this._computeSpatialVoice(peer.x, peer.z, player.pos, player.yaw);
      if (!sp.inRange) return;
      this.sound.playProximityVoiceFrame(samples, sp.pan, sp.gain);
    }

    update(dt, localState, nightFactor = 0) {
      const now = performance.now();
      const isTransmitting = this.voiceMode === 'open' ? (this.micLevel > 0.015) : this.pttActive;

      if (this.pttActive && !this.micStream) {
        this.micLevel = 0.25 + Math.sin(now * 0.02) * 0.12;
        this.synthVoiceTimer -= dt;
        if (this.synthVoiceTimer <= 0) {
          this.synthVoiceTimer = 0.14;
          const synth = new Array(240);
          for (let i = 0; i < 240; i++) {
            synth[i] = Math.sin(i * 0.18) * 0.18 + (Math.random() - 0.5) * 0.05;
          }
          this._send({ type: 'voice', samples: synth });
        }
      }

      /* Broadcast local player state at 15 Hz */
      this.syncTimer += dt;
      if (this.syncTimer >= 0.066 && localState) {
        this.syncTimer = 0;
        this._send({
          type: 'state',
          x: Math.round(localState.x * 100) / 100,
          y: Math.round(localState.y * 100) / 100,
          z: Math.round(localState.z * 100) / 100,
          yaw: Math.round(localState.yaw * 100) / 100,
          pitch: Math.round(localState.pitch * 100) / 100,
          crouching: !!localState.crouching,
          sliding: !!localState.sliding,
          onGround: localState.onGround !== false,
          lean: Math.round((localState.lean || 0) * 100) / 100,
          aiming: !!localState.aiming,
          reloading: !!localState.reloading,
          weaponIndex: localState.weaponIndex || 0,
          flashlightOn: !!localState.flashlightOn,
          inCar: !!localState.inCar,
          team: localState.team || 'blue',
          vehId: localState.vehId || null,
          seat: localState.seat || null,
          speaking: isTransmitting,
          char: KC.charConfig
        });
      }

      this.nearbySpeakers.length = 0;

      for (const [id, peer] of this.peers.entries()) {
        if (!peer.isBot && now - peer.lastSeen > 12000) {
          if (peer.rig && peer.rig.group) this.scene.remove(peer.rig.group);
          this.peers.delete(id);
          this.updateSessionUI();
          continue;
        }

        if (peer.isBot) {
          this._updateBotPeer(peer, dt, localState, nightFactor);
        } else {
          const prevX = peer.x, prevZ = peer.z;
          peer.x = KC.lerp(peer.x, peer.targetX, Math.min(1, dt * 12));
          peer.y = KC.lerp(peer.y, peer.targetY, Math.min(1, dt * 12));
          peer.z = KC.lerp(peer.z, peer.targetZ, Math.min(1, dt * 12));
          const moved = Math.hypot(peer.x - prevX, peer.z - prevZ) / Math.max(0.001, dt);
          peer.walkPhase += dt * moved * 1.15;
          peer.rig.group.position.set(peer.x, peer.y, peer.z);
          peer.rig.group.rotation.y = peer.yaw;
          peer.rig.group.visible = !peer.inCar;
          if (peer.lastVoiceTime && now - peer.lastVoiceTime > 350) peer.speaking = false;
          KC.applyCharacterPose(peer.rig, {
            dt,
            walkPhase: peer.walkPhase,
            speedRatio: moved / 4.5,
            crouching: peer.crouching,
            sliding: peer.sliding,
            onGround: peer.onGround,
            lean: peer.lean,
            aiming: peer.aiming,
            reloading: peer.reloading,
            weaponIndex: peer.weaponIndex || 0,
            pitch: peer.pitch,
            flashlightOn: peer.flashlightOn
          });
        }

        if (localState) {
          const sp = this._computeSpatialVoice(peer.x, peer.z, localState, localState.yaw);
          if (!peer.inCar) peer.rig.group.visible = sp.dist < 160;
          peer.rig.updateNametag(peer.char.callsign, peer.speaking && sp.inRange, sp.dist);
          if (sp.inRange && peer.speaking) {
            this.nearbySpeakers.push({
              name: peer.char.callsign,
              dist: Math.round(sp.dist),
              gain: sp.gain
            });
          }
        }
      }

      this.updateVoiceHUD();
    }

    _updateBotPeer(peer, dt, localState, nightFactor) {
      const speed = peer.speed;
      if (peer.axis === 'v') {
        peer.z += peer.dir * speed * dt;
        peer.x = KC.lerp(peer.x, peer.line + peer.dir * 5.4, dt * 3);
        peer.yaw = peer.dir > 0 ? Math.PI : 0;
        if (Math.abs(peer.z) > 155) peer.dir *= -1;
      } else {
        peer.x += peer.dir * speed * dt;
        peer.z = KC.lerp(peer.z, peer.line + peer.dir * 5.4, dt * 3);
        peer.yaw = peer.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (Math.abs(peer.x) > 155) peer.dir *= -1;
      }
      for (const rl of KC.ROAD_LINES) {
        const coord = peer.axis === 'v' ? peer.z : peer.x;
        if (Math.abs(coord - rl) < 0.35 && Math.random() < 0.04) {
          peer.axis = peer.axis === 'v' ? 'h' : 'v';
          peer.line = rl;
          peer.dir = Math.random() < 0.5 ? 1 : -1;
          break;
        }
      }

      peer.flashlightOn = nightFactor > 0.55;
      peer.walkPhase += dt * speed * 1.15;
      peer.rig.group.position.set(peer.x, 0.14, peer.z);
      peer.rig.group.rotation.y = peer.yaw;

      if (localState) {
        const sp = this._computeSpatialVoice(peer.x, peer.z, localState, localState.yaw);
        peer.speakTimer -= dt;
        if (peer.speakTimer <= 0 && sp.inRange) {
          peer.speakTimer = KC.rand(7.5, 14);
          peer.speakDuration = KC.rand(1.3, 2.4);
          peer.speaking = true;
        }
        if (peer.speakDuration > 0) {
          peer.speakDuration -= dt;
          peer.chatterCooldown -= dt;
          if (peer.chatterCooldown <= 0 && sp.inRange && this.sound) {
            peer.chatterCooldown = 0.42;
            this.sound.playProximityChatter(sp.pan, sp.gain, peer.voicePitch);
          }
          if (peer.speakDuration <= 0) peer.speaking = false;
        } else {
          peer.speaking = false;
        }
      }

      KC.applyCharacterPose(peer.rig, {
        dt,
        walkPhase: peer.walkPhase,
        speedRatio: 0.75,
        crouching: peer.crouching,
        lean: peer.lean,
        aiming: peer.aiming,
        weaponIndex: peer.weaponIndex || 0,
        pitch: 0,
        flashlightOn: peer.flashlightOn
      });
    }

    updateSessionUI() {
      const count = 1 + this.peers.size;
      const roomEl = document.getElementById('hud-session-code');
      const countEl = document.getElementById('hud-session-count');
      const menuCountEl = document.getElementById('menu-session-status');
      const badgeEl = document.getElementById('session-transport-badge');
      const inviteEl = document.getElementById('session-invite-url');
      const lanEl = document.getElementById('session-lan-url');
      if (roomEl) roomEl.textContent = this.roomCode;
      if (countEl) countEl.textContent = count + ' ONLINE';
      if (menuCountEl) menuCountEl.textContent = this.roomCode + ' // ' + count + ' PLAYERS (' + this.transportName + ')';
      if (badgeEl) badgeEl.textContent = this.transportName + ' (' + count + ' ONLINE)';
      if (inviteEl) inviteEl.textContent = this.getInviteUrl();
      if (lanEl) {
        if (this.lanUrls && this.lanUrls.length) {
          lanEl.textContent = 'WIFI / LAN JOIN: ' + this.lanUrls[0];
        } else {
          lanEl.textContent = 'FREE HOSTING: WEBRTC P2P ACTIVE · SEE HOSTING.MD';
        }
      }
    }

    updateVoiceHUD() {
      const badge = document.getElementById('hud-voice-status');
      const list = document.getElementById('hud-voice-peers');
      if (!badge) return;
      const transmitting = this.voiceMode === 'open' ? (this.micLevel > 0.015) : this.pttActive;
      badge.classList.toggle('transmitting', transmitting);
      if (transmitting) {
        badge.textContent = '🔊 VOICE TX (45m RANGE)';
      } else {
        badge.textContent = this.voiceMode === 'open' ? '🎙 OPEN MIC (45m)' : '🎙 PTT [T] · 45m RANGE';
      }
      if (list) {
        if (this.nearbySpeakers.length === 0) {
          list.innerHTML = '';
        } else {
          list.innerHTML = this.nearbySpeakers
            .map((s) => '<div class="voice-peer">🔊 ' + s.name + ' <span>' + s.dist + 'm</span></div>')
            .join('');
        }
      }
    }
  }

  KC.multiplayer = new MultiplayerManager();
})();
