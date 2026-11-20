'use strict';

/* ============================================================
   Landmarks — low-poly Kansas City icons (Core + Extended Map)
   ============================================================ */
KC.buildLandmarks = function (city, blockData) {
  const { addBox, addCylinder, addSign, addGlowSprite, addLightPool, addCollider, registerCullItem, scene, materials } = city;
  const block = (key) => blockData.find((b) => b.legacyKey === key || (b.i + ',' + b.j) === key);

  const stone = materials.stoneMat || new THREE.MeshStandardMaterial({ color: 0x6b5c4d, roughness: 0.9, metalness: 0.05 });
  const paleStone = materials.paleStoneMat || new THREE.MeshStandardMaterial({ color: 0x8c7d68, roughness: 0.82 });
  const brick = materials.brickMat || new THREE.MeshStandardMaterial({ color: 0x55352f, roughness: 0.95 });
  const darkBrick = materials.darkBrickMat || new THREE.MeshStandardMaterial({ color: 0x3c2927, roughness: 0.96 });
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xc9c3b3, roughness: 0.35, metalness: 0.32, bumpMap: materials.microBump, bumpScale: 0.02, emissive: 0x26323a, emissiveIntensity: 0.28, side: THREE.DoubleSide });
  const arenaMat = new THREE.MeshStandardMaterial({ color: 0x2b2d38, roughness: 0.38, metalness: 0.65, bumpMap: materials.microBump, bumpScale: 0.025 });
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xffc25e, toneMapped: false });
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff4b3a, toneMapped: false });
  const tealMat = new THREE.MeshBasicMaterial({ color: 0x57e6c2, toneMapped: false });
  const pinkMat = new THREE.MeshBasicMaterial({ color: 0xff5f8f, toneMapped: false });
  const grassMat = materials.grassMat || new THREE.MeshStandardMaterial({ color: 0x283d2d, roughness: 1 });
  const pathMat = materials.curbMat || new THREE.MeshStandardMaterial({ color: 0x57545a, roughness: 0.95 });

  /* Animated rising low-poly hickory BBQ & brewery smoke plume */
  function addSmokePlume(x, y, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const puffs = [];
    const puffMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2c9, transparent: true, opacity: 0.42, roughness: 1, flatShading: true, depthWrite: false
    });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 * scale, 0), puffMat);
      g.add(m);
      puffs.push({ mesh: m, phase: i * 0.25 });
    }
    scene.add(g);
    registerCullItem(g, x, z, 145);
    city.updaters.push((t) => {
      if (!g.visible) return;
      for (const p of puffs) {
        const cyc = (t * 0.42 + p.phase) % 1;
        p.mesh.position.set(Math.sin(t * 1.4 + p.phase * 6) * 0.35 * cyc, cyc * 3.8 * scale, Math.cos(t * 1.1 + p.phase * 6) * 0.35 * cyc);
        const s = (0.55 + cyc * 1.35) * (1 - cyc * 0.35);
        p.mesh.scale.set(s, s, s);
        p.mesh.rotation.y = t * 0.8 + p.phase * 3;
      }
    });
  }

  function addArchWindow(x, y, z, w, h, rotY, color) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(-w / 2, h * 0.62);
    shape.quadraticCurveTo(-w / 2, h, 0, h);
    shape.quadraticCurveTo(w / 2, h, w / 2, h * 0.62);
    shape.lineTo(w / 2, 0);
    shape.closePath();
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    registerCullItem(mesh, x, z, 155);
    return mesh;
  }

  function addStringLights(x1, z1, x2, z2, y, color, count = 10, sag = 1.4) {
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const geo = new THREE.SphereGeometry(0.09, 6, 4);
    const pts = [];
    const group = new THREE.Group();
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = KC.lerp(x1, x2, t);
      const z = KC.lerp(z1, z2, t);
      const yy = y - Math.sin(Math.PI * t) * sag;
      pts.push(new THREE.Vector3(x, yy, z));
      const bulb = new THREE.Mesh(geo, mat);
      bulb.position.set(x, yy, z);
      group.add(bulb);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2520, transparent: true, opacity: 0.7 }));
    group.add(line);
    scene.add(group);
    registerCullItem(group, (x1 + x2) * 0.5, (z1 + z2) * 0.5, 130);
  }

  function addTree(x, z, s = 1) {
    addCylinder(0.16 * s, 0.22 * s, 2.4 * s, 5, materials.treeTrunkMat || materials.leafMats[0], x, 0.14 + 1.2 * s, z, { cast: true, cullDist: 145 });
    const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35 * s, 0), materials.leafMats[KC.randInt(0, 2)]);
    canopy.position.set(x, 0.14 + 3.2 * s, z);
    canopy.rotation.set(KC.rand(0, 1), KC.rand(0, 3), KC.rand(0, 1));
    canopy.scale.set(1, 1.25, 1);
    canopy.castShadow = true;
    scene.add(canopy);
    registerCullItem(canopy, x, z, 145);
    addCollider(x, z, 0.7 * s, 0.7 * s, 3.5, 'tree');
  }

  function addBench(x, z, ry) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.55), materials.darkMetal);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), materials.darkMetal);
    back.position.set(0, 0.85, -0.25);
    for (const ox of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.5), materials.darkMetal);
      leg.position.set(ox, 0.28, 0);
      g.add(leg);
    }
    g.add(seat, back);
    g.position.set(x, 0.14, z);
    g.rotation.y = ry;
    scene.add(g);
    registerCullItem(g, x, z, 120);
    const col = addCollider(x, z, 1.8, 0.8, 1.0, 'prop');
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'bench', broken: false });
  }

  /* ---------------- POWER & LIGHT (Midland Theatre, H&R Block HQ & Charlie Hustle) ---------------- */
  {
    const b = block('2,2');
    if (b) {
      addBox(26, 0.06, 26, new THREE.MeshStandardMaterial({ color: 0x242128, roughness: 0.85 }), b.cx, 0.18, b.cz, 0, { cast: false });
      for (let i = -1; i <= 1; i += 2) {
        addBox(0.12, 0.03, 24, tealMat, b.cx + i * 10.5, 0.22, b.cz, 0, { cast: false, cullDist: 130 });
        addBox(24, 0.03, 0.12, tealMat, b.cx, 0.22, b.cz + i * 10.5, 0, { cast: false, cullDist: 130 });
      }
      city.createBuilding(b.cx, b.cz - 10.5, 24, 8, 12, { style: 1, sign: 'POWER & LIGHT', signSide: 's' });
      city.createBuilding(b.cx - 11.5, b.cz + 5, 6, 13, 10, { style: 0, sign: 'MIDLAND THEATRE', signSide: 'e' });
      city.createBuilding(b.cx + 11.5, b.cz + 3, 6, 11, 24, { style: 3, sign: 'H&R BLOCK HQ', signSide: 'w' });
      /* H&R Block iconic glowing green block cube on the tower roof */
      const hrGreen = new THREE.MeshBasicMaterial({ color: 0x35e06c, toneMapped: false });
      addBox(2.4, 2.4, 2.4, hrGreen, b.cx + 10.2, 25.5, b.cz + 3, 0, { cast: false });
      addGlowSprite(0x35e06c, b.cx + 10.2, 25.5, b.cz + 3, 6, 0.4);
      addSign('CHARLIE HUSTLE KC', '#ff4b3a', b.cx - 7.5, 4.2, b.cz - 6.3, 0, 7.2, 1.3);
      addSign('KC', '#ffb13b', b.cx + 0.1, 10.8, b.cz - 6.4, 0, 5.5, 1.7);
      addGlowSprite(0xffb13b, b.cx, 9.5, b.cz - 6.2, 8, 0.16);
      for (const [x, z] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) {
        addCylinder(0.08, 0.11, 5.5, 5, materials.darkMetal, b.cx + x, 2.9, b.cz + z, { cast: false, cullDist: 130 });
        addGlowSprite(0xffd39a, b.cx + x, 5.7, b.cz + z, 1.2, 0.65);
      }
      addStringLights(b.cx - 8, b.cz - 7, b.cx + 8, b.cz - 7, 5.6, 0xffc77a, 12, 0.8);
      addStringLights(b.cx - 8, b.cz + 7, b.cx + 8, b.cz + 7, 5.6, 0xffc77a, 12, 0.8);
      addStringLights(b.cx - 8, b.cz - 7, b.cx - 8, b.cz + 7, 5.6, 0xff5f8f, 9, 0.6);
      addLightPool(b.cx, 0.21, b.cz, 0xffb46b, 30, 0.16);
      addBench(b.cx - 4, b.cz + 3, 0.2);
      addBench(b.cx + 4, b.cz + 3, -0.2);
      addTree(b.cx - 10.5, b.cz + 11, 0.8);
      addTree(b.cx + 10.5, b.cz + 11, 0.8);
      city.landmarks['Power & Light'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'POWER & LIGHT' };
    }
  }

  /* ---------------- KAUFFMAN CENTER ---------------- */
  {
    const b = block('3,3');
    if (b) {
      addBox(26, 4, 20, materials.glassMat, b.cx, 2.14, b.cz, 0, { ray: true });
      addCollider(b.cx, b.cz, 26, 20, 11, 'landmark');
      addBox(27, 0.3, 21, paleStone, b.cx, 4.2, b.cz, 0, { cast: false });
      addBox(24, 0.12, 18, tealMat, b.cx, 4.38, b.cz, 0, { cast: false });
      const shellGeo = new THREE.SphereGeometry(8.6, 16, 9, 0, Math.PI, 0, Math.PI / 2);
      for (const s of [
        { x: b.cx - 4.7, z: b.cz, ry: 0.38, sx: 1.22, sy: 0.92, sz: 1.05 },
        { x: b.cx + 4.7, z: b.cz, ry: -0.38, sx: 1.22, sy: 0.92, sz: 1.05 }
      ]) {
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.position.set(s.x, 4.32, s.z);
        shell.rotation.y = s.ry;
        shell.scale.set(s.sx, s.sy, s.sz);
        shell.castShadow = true;
        scene.add(shell);
      }
      addSign('KAUFFMAN CENTER', '#57e6c2', b.cx, 3.1, b.cz + 10.2, 0, 13, 1.9);
      addGlowSprite(0x57e6c2, b.cx, 3.1, b.cz + 10.4, 12, 0.13);
      addLightPool(b.cx, 0.21, b.cz + 12.8, 0x57e6c2, 24, 0.16);
      for (const ox of [-10, 10]) {
        addCylinder(0.08, 0.11, 4.8, 5, materials.darkMetal, b.cx + ox, 2.5, b.cz + 12.4, { cast: false, cullDist: 130 });
        addGlowSprite(0xffd39a, b.cx + ox, 4.9, b.cz + 12.4, 1.1, 0.6);
      }
      addTree(b.cx - 12.5, b.cz + 12.5, 0.75);
      addTree(b.cx + 12.5, b.cz + 12.5, 0.75);
      city.landmarks['Kauffman Center'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 14 }, label: 'KAUFFMAN CENTER' };
    }
  }

  /* ---------------- UNION STATION ---------------- */
  {
    const b = block('2,4');
    if (b) {
      addBox(28, 10, 14, stone, b.cx, 5.14, b.cz, 0, { ray: true });
      addCollider(b.cx, b.cz, 28, 14, 10, 'landmark');
      addBox(10, 18, 11, paleStone, b.cx, 9.14, b.cz + 1, 0, { ray: true });
      addCollider(b.cx, b.cz + 1, 10, 11, 18, 'landmark');
      const roof = new THREE.Mesh(new THREE.BoxGeometry(29, 0.5, 15), materials.roofMat);
      roof.position.set(b.cx, 10.35, b.cz);
      roof.castShadow = true;
      scene.add(roof);
      for (const ox of [-11.5, -6.5, 0, 6.5, 11.5]) addBox(1.1, 10, 1.1, paleStone, b.cx + ox, 5.14, b.cz - 7.2, 0, { cast: true, cullDist: 150 });
      for (const ox of [-8.2, 0, 8.2]) addArchWindow(b.cx + ox, 2.5, b.cz - 7.15, 5, 6.2, Math.PI, 0xffcf85);
      addArchWindow(b.cx, 8.5, b.cz - 4.55, 4.5, 7.2, Math.PI, 0xffdca0);
      addSign('UNION STATION', '#ffc77a', b.cx, 11.6, b.cz - 7.25, Math.PI, 13, 2.1);
      addGlowSprite(0xffc77a, b.cx, 11.6, b.cz - 7.6, 14, 0.14);
      addLightPool(b.cx, 0.21, b.cz - 10.5, 0xffc77a, 30, 0.18);
      addTree(b.cx - 13, b.cz - 11, 0.7);
      addTree(b.cx + 13, b.cz - 11, 0.7);
      city.landmarks['Union Station'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz - 12 }, label: 'UNION STATION' };
    }
  }

  /* ---------------- LIBERTY MEMORIAL ---------------- */
  {
    const b = block('1,4');
    if (b) {
      addBox(27, 0.08, 27, grassMat, b.cx, 0.19, b.cz, 0, { cast: false });
      addBox(2.2, 0.05, 26, pathMat, b.cx, 0.245, b.cz, 0, { cast: false });
      addBox(26, 0.05, 2.2, pathMat, b.cx, 0.246, b.cz, 0, { cast: false });
      addBox(8, 4, 8, stone, b.cx, 2.2, b.cz, 0, { ray: true });
      addCollider(b.cx, b.cz, 9, 9, 42, 'landmark');
      addBox(5.5, 3, 5.5, paleStone, b.cx, 4.8, b.cz, 0, { ray: true });
      addCylinder(1.7, 2.3, 31, 8, paleStone, b.cx, 22, b.cz, { ray: true });
      addBox(5.2, 2.2, 5.2, paleStone, b.cx, 38.6, b.cz, 0, { ray: true });
      addBox(3.2, 1.4, 3.2, stone, b.cx, 40.4, b.cz, 0, { cast: true });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4, 7), new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false }));
      flame.position.set(b.cx, 43.2, b.cz);
      scene.add(flame);
      const flameGlow = addGlowSprite(0xff7b2a, b.cx, 43.4, b.cz, 13, 0.55);
      const light = new THREE.PointLight(0xff7b2a, 65, 55, 2);
      light.position.set(b.cx, 43.5, b.cz);
      scene.add(light);
      city.updaters.push((t) => {
        const f = 0.85 + Math.sin(t * 9.2) * 0.09 + Math.sin(t * 17.7) * 0.05;
        flame.scale.set(f, 0.85 + Math.sin(t * 7.1) * 0.15, f);
        flame.rotation.y = t * 0.7;
        flameGlow.material.opacity = 0.42 + Math.sin(t * 8.4) * 0.12;
        light.intensity = 55 + Math.sin(t * 10.5) * 12;
      });
      for (const [ox, oz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) addTree(b.cx + ox, b.cz + oz, 0.8);
      addBench(b.cx - 6, b.cz + 7, 0.4);
      addBench(b.cx + 6, b.cz + 7, -0.4);
      addSign('LIBERTY MEMORIAL', '#ffb13b', b.cx, 6.2, b.cz - 9.6, Math.PI, 12, 1.7);
      city.landmarks['Liberty Memorial'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz - 13 }, label: 'LIBERTY MEMORIAL' };
    }
  }

  /* ---------------- T-MOBILE CENTER ---------------- */
  {
    const b = block('3,2');
    if (b) {
      addCylinder(13, 13, 11, 16, arenaMat, b.cx, 5.64, b.cz, { ray: true });
      addCollider(b.cx, b.cz, 24, 24, 15, 'landmark');
      addCylinder(11.4, 13.2, 2.8, 16, materials.roofMat, b.cx, 12.4, b.cz, { cast: true });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13.1, 0.13, 4, 40), pinkMat);
      ring.position.set(b.cx, 10.8, b.cz);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      addGlowSprite(0xff5f8f, b.cx, 10.9, b.cz, 34, 0.12);
      addSign('T-MOBILE CENTER', '#ff5f8f', b.cx, 7.3, b.cz + 13.2, 0, 16, 2.3);
      addSign('KC', '#57e6c2', b.cx - 13.2, 7, b.cz, -Math.PI / 2, 4.5, 1.6);
      addLightPool(b.cx, 0.21, b.cz + 15.5, 0xff5f8f, 34, 0.14);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        addGlowSprite(0xff5f8f, b.cx + Math.cos(a) * 13.2, 1.1, b.cz + Math.sin(a) * 13.2, 1.3, 0.4);
      }
      city.landmarks['T-Mobile Center'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 16 }, label: 'T-MOBILE CENTER' };
    }
  }

  /* ---------------- RIVER MARKET ---------------- */
  {
    const b = block('2,0');
    if (b) {
      city.createBuilding(b.cx - 9, b.cz - 4, 8, 13, 8, { style: 1, sign: 'RIVER MARKET', signSide: 'e' });
      city.createBuilding(b.cx + 9, b.cz - 4, 8, 13, 7, { style: 1, sign: 'PRODUCE', signSide: 'w' });
      const canopyMats = [redMat, tealMat, goldMat, pinkMat];
      for (let i = 0; i < 4; i++) {
        const sx = b.cx - 7.5 + (i % 2) * 5, sz = b.cz + 2 + Math.floor(i / 2) * 5;
        addBox(3.8, 0.9, 2.6, new THREE.MeshStandardMaterial({ color: 0x4d3a2c, roughness: 0.95 }), sx, 0.7, sz, 0, { cast: true, cullDist: 135 });
        addBox(4.3, 0.18, 3.1, canopyMats[i], sx, 1.8, sz, 0, { cast: true, cullDist: 135 });
        addCollider(sx, sz, 3.9, 2.7, 2, 'prop');
        for (const ox of [-1.8, 1.8]) addCylinder(0.05, 0.05, 1.8, 4, materials.darkMetal, sx + ox, 1.05, sz + 1.2, { cast: false, cullDist: 120 });
      }
      addStringLights(b.cx - 9, b.cz + 9, b.cx + 9, b.cz + 9, 5.2, 0xffc77a, 12, 0.7);
      addSign('RIVER MARKET', '#57e6c2', b.cx, 6.2, b.cz + 11.8, 0, 12, 1.8);
      addGlowSprite(0x57e6c2, b.cx, 6.2, b.cz + 12, 10, 0.12);
      addLightPool(b.cx, 0.21, b.cz + 6, 0xffb46b, 26, 0.15);
      addTree(b.cx - 12, b.cz + 12, 0.7);
      addTree(b.cx + 12, b.cz + 12, 0.7);
      city.landmarks['River Market'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'RIVER MARKET' };
    }
  }

  /* ---------------- 18TH & VINE (Arthur Bryant's BBQ, Gates Bar-B-Q & Blue Room Jazz) ---------------- */
  {
    const b = block('4,3');
    if (b) {
      city.createBuilding(b.cx - 7, b.cz - 7, 14, 8, 8, { style: 1, sign: 'ARTHUR BRYANT BBQ', signSide: 's' });
      city.createBuilding(b.cx + 7, b.cz + 6, 8, 10, 7, { style: 1, sign: 'GATES BAR-B-Q', signSide: 'w' });
      /* Gates iconic red roof pagoda trim & BBQ smoker chimney */
      addBox(8.6, 0.45, 10.6, redMat, b.cx + 7, 7.35, b.cz + 6, 0, { cast: false, cullDist: 140 });
      addCylinder(0.45, 0.55, 3.2, 6, darkBrick, b.cx - 1.2, 8.8, b.cz - 6.5, { cast: false, cullDist: 140 });
      addSmokePlume(b.cx - 1.2, 10.5, b.cz - 6.5, 1.0);
      addSmokePlume(b.cx + 7.2, 8.0, b.cz + 6.0, 0.85);
      addBox(12, 0.5, 7, new THREE.MeshStandardMaterial({ color: 0x2b2021, roughness: 0.95 }), b.cx, 0.4, b.cz + 4, 0, { cast: false });
      addBox(12, 2.6, 0.4, darkBrick, b.cx, 1.7, b.cz + 7.4, 0, { cast: true });
      addCollider(b.cx, b.cz + 7.4, 12, 0.6, 2.8, 'landmark');
      addSign('18TH & VINE', '#ff5f8f', b.cx, 3.5, b.cz + 7.2, 0, 11, 1.7);
      addSign('BLUE ROOM JAZZ', '#57e6c2', b.cx - 7, 4.8, b.cz - 2.8, 0, 8.5, 1.4);
      addGlowSprite(0xff5f8f, b.cx, 3.5, b.cz + 7.3, 9, 0.14);
      addStringLights(b.cx - 7, b.cz + 8, b.cx + 7, b.cz + 8, 5, 0xffb13b, 11, 0.6);
      addLightPool(b.cx, 0.21, b.cz + 6, 0xff5f8f, 22, 0.15);
      addTree(b.cx - 12, b.cz + 12, 0.7);
      addTree(b.cx + 12, b.cz + 12, 0.7);
      city.landmarks['18th & Vine'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 12 }, label: '18TH & VINE' };
    }
  }

  /* ---------------- WESTPORT (Kelly's Westport Inn & Joe's KC Gas Station BBQ) ---------------- */
  {
    const b = block('0,3');
    if (b) {
      city.createBuilding(b.cx - 7, b.cz - 4, 12, 10, 8, { style: 1, sign: 'KELLYS WESTPORT', signSide: 'e' });
      city.createBuilding(b.cx + 6, b.cz + 6, 10, 10, 7, { style: 0, sign: 'JOES KC BBQ', signSide: 'w' });
      /* Joe's KC iconic white & green gas-station canopy + fuel pumps */
      addBox(7.2, 0.32, 4.4, tealMat, b.cx - 2.5, 3.9, b.cz + 8.5, 0, { cast: true, cullDist: 140 });
      for (const ox of [-5.2, 0.2]) {
        addCylinder(0.14, 0.14, 3.7, 5, paleStone, b.cx + ox, 1.95, b.cz + 8.5, { cast: false, cullDist: 130 });
        addBox(0.75, 1.35, 0.55, redMat, b.cx + ox * 0.5 - 1.2, 0.82, b.cz + 8.5, 0, { cast: true, cullDist: 125 });
      }
      addCollider(b.cx - 2.5, b.cz + 8.5, 6.2, 2.2, 3.8, 'prop');
      addSign('WESTPORT', '#ffb13b', b.cx, 6, b.cz + 12.5, 0, 10, 1.7);
      addGlowSprite(0xffb13b, b.cx, 6, b.cz + 12.7, 9, 0.12);
      addStringLights(b.cx - 8, b.cz + 10, b.cx + 8, b.cz + 10, 5.2, 0xffc77a, 10, 0.7);
      addLightPool(b.cx, 0.21, b.cz + 9, 0xffb46b, 22, 0.14);
      addTree(b.cx - 12, b.cz + 12, 0.7);
      city.landmarks['Westport'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'WESTPORT' };
    }
  }

  /* ---------------- CROWN CENTER (Hallmark Cards HQ & Jack Stack BBQ) ---------------- */
  {
    const b = block('3,4');
    if (b) {
      city.createBuilding(b.cx - 6.5, b.cz + 1, 12, 13, 40, { style: 4, sign: 'HALLMARK CARDS HQ', signSide: 's' });
      city.createBuilding(b.cx + 6.5, b.cz + 1, 12, 13, 32, { style: 4, sign: 'JACK STACK BBQ', signSide: 's' });
      addBox(4, 2.6, 8, materials.glassMat, b.cx, 18.5, b.cz + 1, 0, { cast: true });
      addSign('CROWN CENTER', '#ffb13b', b.cx, 5.5, b.cz + 15.2, 0, 12, 1.8);
      addGlowSprite(0xffb13b, b.cx, 5.5, b.cz + 15.4, 10, 0.12);
      addLightPool(b.cx, 0.21, b.cz + 12, 0xffb46b, 26, 0.14);
      city.landmarks['Crown Center'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'CROWN CENTER' };
    }
  }

  /* ---------------- BARTLE HALL (4 Iconic KC Skyscrapers/Pylons) ---------------- */
  {
    const b = block('1,2');
    if (b) {
      addBox(27, 7, 22, arenaMat, b.cx, 3.64, b.cz, 0, { ray: true });
      addCollider(b.cx, b.cz, 27, 22, 7.5, 'landmark');
      for (const ox of [-9.5, -3.2, 3.2, 9.5]) {
        addCylinder(0.85, 1.35, 34, 6, paleStone, b.cx + ox, 20.5, b.cz, { ray: true });
        addBox(3.4, 2.2, 1.6, materials.metalMat, b.cx + ox, 35.5, b.cz, 0, { cast: false, cullDist: 165 });
        addGlowSprite(0x65b8ff, b.cx + ox, 37.8, b.cz, 2.5, 0.65);
      }
      addSign('BARTLE HALL', '#65b8ff', b.cx, 5.6, b.cz + 11.2, 0, 13, 2.0);
      addLightPool(b.cx, 0.21, b.cz + 13.5, 0x65b8ff, 26, 0.15);
      city.landmarks['Bartle Hall'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 14 }, label: 'BARTLE HALL' };
    }
  }

  /* ---------------- BERKLEY RIVERFRONT ---------------- */
  {
    const b = block('2,-2');
    if (b) {
      addBox(28, 0.1, 28, grassMat, b.cx, 0.18, b.cz, 0, { cast: false });
      addBox(16, 1.2, 6, paleStone, b.cx, 0.74, b.cz - 7, 0, { ray: true });
      addCollider(b.cx, b.cz - 7, 16, 6, 4.5, 'landmark');
      addBox(17, 0.28, 7, tealMat, b.cx, 4.4, b.cz - 7, 0, { cast: true });
      for (const ox of [-7, 7]) addCylinder(0.25, 0.25, 3.2, 6, materials.darkMetal, b.cx + ox, 2.8, b.cz - 5, { cast: false });
      addSign('BERKLEY RIVERFRONT', '#57e6c2', b.cx, 5.4, b.cz - 3.8, 0, 14, 1.8);
      addStringLights(b.cx - 10, b.cz + 6, b.cx + 10, b.cz + 6, 4.8, 0x57e6c2, 12, 0.7);
      addLightPool(b.cx, 0.21, b.cz + 2, 0x57e6c2, 26, 0.15);
      for (const [ox, oz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) addTree(b.cx + ox, b.cz + oz, 0.9);
      addBench(b.cx - 5, b.cz + 8, 0);
      addBench(b.cx + 5, b.cz + 8, 0);
      city.landmarks['Berkley Riverfront'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'BERKLEY RIVERFRONT' };
    }
  }

  /* ---------------- WEST BOTTOMS (Boulevard Brewing Co. & Freight Depot) ---------------- */
  {
    const b = block('-2,1');
    if (b) {
      city.createBuilding(b.cx - 6, b.cz - 4, 14, 16, 15, { style: 1, sign: 'BOULEVARD BREWING', signSide: 'e' });
      city.createBuilding(b.cx + 8, b.cz + 5, 10, 12, 11, { style: 2, sign: 'WEST BOTTOMS', signSide: 's' });
      /* Boulevard Brewing iconic stainless steel fermentation silos + brick smokestack */
      const siloMat = new THREE.MeshStandardMaterial({ color: 0xaab4c2, roughness: 0.28, metalness: 0.78 });
      for (let i = 0; i < 4; i++) {
        addCylinder(1.25, 1.25, 11.5, 8, siloMat, b.cx + 4.5 + (i % 2) * 3.1, 5.9, b.cz - 8.5 + Math.floor(i / 2) * 3.1, { cast: true, cullDist: 150 });
      }
      addCylinder(0.75, 1.1, 24, 8, brick, b.cx - 11, 12.14, b.cz - 10, { cast: true });
      addSmokePlume(b.cx - 11, 24.3, b.cz - 10, 1.35);
      addBox(12, 2.8, 3.2, materials.metalMat, b.cx - 2, 10.5, b.cz + 6, 0, { cast: true });
      addSign('BOULEVARD BREWING CO', '#ffb13b', b.cx - 2, 10.6, b.cz + 7.7, 0, 12, 1.7);
      addLightPool(b.cx, 0.21, b.cz + 12, 0xffb46b, 22, 0.15);
      city.landmarks['West Bottoms'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'WEST BOTTOMS' };
    }
  }

  /* ---------------- COUNTRY CLUB PLAZA (Giralda Tower, Winstead's & Q39) ---------------- */
  {
    const b = block('0,6');
    if (b) {
      addBox(24, 9, 12, paleStone, b.cx, 4.64, b.cz - 6, 0, { ray: true });
      addCollider(b.cx, b.cz - 6, 24, 12, 10, 'landmark');
      /* Giralda Seville Tower */
      addBox(6.2, 29, 6.2, paleStone, b.cx + 8, 14.64, b.cz - 5, 0, { ray: true });
      addCollider(b.cx + 8, b.cz - 5, 6.5, 6.5, 30, 'landmark');
      addCylinder(1.8, 2.4, 4.5, 8, goldMat, b.cx + 8, 31.2, b.cz - 5, { cast: false });
      /* Courtyard fountain with animated low-poly water jets ("City of Fountains") */
      addCylinder(3.8, 4.0, 0.65, 12, stone, b.cx - 3, 0.45, b.cz + 6, { ray: true });
      addCylinder(3.3, 3.3, 0.14, 12, tealMat, b.cx - 3, 0.76, b.cz + 6, { cast: false, cullDist: 140 });
      addCylinder(0.85, 1.15, 1.75, 8, paleStone, b.cx - 3, 1.2, b.cz + 6, { cast: true, cullDist: 140 });
      const plazaJet = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 2.35, 8),
        new THREE.MeshBasicMaterial({ color: 0x7ff5e6, transparent: true, opacity: 0.82, toneMapped: false })
      );
      plazaJet.position.set(b.cx - 3, 2.6, b.cz + 6);
      scene.add(plazaJet);
      registerCullItem(plazaJet, b.cx - 3, b.cz + 6, 140);
      city.updaters.push((t) => {
        if (!plazaJet.visible) return;
        const s = 0.85 + Math.sin(t * 8.2) * 0.18;
        plazaJet.scale.set(s, 0.9 + Math.cos(t * 10.4) * 0.22, s);
        plazaJet.rotation.y = t * 2.1;
      });
      addCollider(b.cx - 3, b.cz + 6, 7.6, 7.6, 1.5, 'landmark');
      addGlowSprite(0x57e6c2, b.cx - 3, 1.6, b.cz + 6, 6, 0.35);
      addStringLights(b.cx - 11, b.cz - 11, b.cx + 11, b.cz - 11, 9.4, 0xffc77a, 14, 0.3);
      addStringLights(b.cx - 11, b.cz - 0.1, b.cx + 11, b.cz - 0.1, 9.4, 0xffc77a, 14, 0.3);
      addSign('COUNTRY CLUB PLAZA', '#ffc77a', b.cx - 2, 7.2, b.cz + 0.15, 0, 14, 1.9);
      addSign('WINSTEADS BURGERS', '#57e6c2', b.cx - 9.5, 5.2, b.cz + 0.2, 0, 8.5, 1.4);
      addLightPool(b.cx - 3, 0.21, b.cz + 6, 0xffc77a, 26, 0.17);
      city.landmarks['Country Club Plaza'] = { x: b.cx, z: b.cz, marker: { x: b.cx - 3, z: b.cz + 13 }, label: 'COUNTRY CLUB PLAZA' };
    }
  }

  /* ---------------- EAST CROSSROADS (The Roasterie DC-3 Plane, Green Lady Lounge & Town Topic) ---------------- */
  {
    const b = block('5,1');
    if (b) {
      city.createBuilding(b.cx - 6, b.cz - 5, 13, 12, 9, { style: 3, sign: 'THE ROASTERIE KC', signSide: 's' });
      city.createBuilding(b.cx + 7, b.cz + 4, 10, 14, 8, { style: 4, sign: 'GREEN LADY LOUNGE', signSide: 'w' });
      addSign('TOWN TOPIC 24H', '#ff4b3a', b.cx + 7, 3.8, b.cz + 11.2, 0, 8.5, 1.5, { bg: '#f2e8d5' });
      addSign('UP-DOWN ARCADE', '#57e6c2', b.cx - 6, 4.2, b.cz - 11.2, Math.PI, 8.5, 1.5);

      /* The Roasterie's iconic rooftop silver DC-3 Airplane tilted upward on steel struts! */
      const planeMat = new THREE.MeshStandardMaterial({ color: 0xd0d7e2, roughness: 0.25, metalness: 0.82 });
      const planeGroup = new THREE.Group();
      planeGroup.position.set(b.cx - 6, 12.2, b.cz - 5);
      planeGroup.rotation.set(0.24, 0.45, -0.08);
      /* Fuselage */
      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.48, 8.6, 8), planeMat);
      fuselage.rotation.x = Math.PI / 2;
      planeGroup.add(fuselage);
      /* Main wings */
      const wings = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.16, 1.65), planeMat);
      wings.position.set(0, -0.1, -0.6);
      planeGroup.add(wings);
      /* Red wingtips & tail fin */
      const tailV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 1.4), redMat);
      tailV.position.set(0, 0.9, 3.6);
      const tailH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.0), planeMat);
      tailH.position.set(0, 0.2, 3.7);
      planeGroup.add(tailV, tailH);
      /* Twin engine nacelles + spinning propellers */
      const props = [];
      for (const wx of [-2.4, 2.4]) {
        const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 1.4, 6), planeMat);
        eng.rotation.x = Math.PI / 2;
        eng.position.set(wx, -0.15, -1.35);
        planeGroup.add(eng);
        const prop = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.04), materials.darkMetal);
        prop.position.set(wx, -0.15, -2.08);
        planeGroup.add(prop);
        props.push(prop);
      }
      scene.add(planeGroup);
      registerCullItem(planeGroup, b.cx - 6, b.cz - 5, 175);
      /* Steel roof support struts under the DC-3 */
      addCylinder(0.12, 0.18, 3.2, 4, materials.darkMetal, b.cx - 6, 10.6, b.cz - 5, { cast: false, cullDist: 150 });
      city.updaters.push((t) => {
        for (const pr of props) pr.rotation.z = t * 14;
      });

      addStringLights(b.cx - 9, b.cz + 5, b.cx + 9, b.cz + 5, 5.2, 0xff5f8f, 11, 0.7);
      addSign('EAST CROSSROADS', '#ff5f8f', b.cx, 5.6, b.cz + 11.8, 0, 13, 1.8);
      addLightPool(b.cx, 0.21, b.cz + 8, 0xff5f8f, 24, 0.15);
      city.landmarks['East Crossroads'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'EAST CROSSROADS' };
    }
  }

  /* ---------------- COLUMBUS PARK ---------------- */
  {
    const b = block('4,-1');
    if (b) {
      addBox(26, 0.08, 26, grassMat, b.cx, 0.18, b.cz, 0, { cast: false });
      city.createBuilding(b.cx - 8, b.cz - 7, 10, 9, 8, { style: 1, sign: 'CAFE', signSide: 's' });
      addBox(3.4, 14, 3.4, brick, b.cx + 7, 7.14, b.cz - 6, 0, { ray: true });
      addCollider(b.cx + 7, b.cz - 6, 3.6, 3.6, 14, 'landmark');
      addSign('COLUMBUS PARK', '#57e6c2', b.cx, 5.2, b.cz + 11.5, 0, 12, 1.7);
      addLightPool(b.cx, 0.21, b.cz + 4, 0xffc77a, 22, 0.14);
      addTree(b.cx - 10, b.cz + 9, 0.85);
      addTree(b.cx + 10, b.cz + 9, 0.85);
      addBench(b.cx, b.cz + 4, 0);
      city.landmarks['Columbus Park'] = { x: b.cx, z: b.cz, marker: { x: b.cx, z: b.cz + 13 }, label: 'COLUMBUS PARK' };
    }
  }
};
