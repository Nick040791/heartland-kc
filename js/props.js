'use strict';

/* ============================================================
   Street furniture, physical/destructible props, dynamic lamps,
   traffic spawn data, riverfront, and extended minimap data
   ============================================================ */
KC.buildProps = function (city, blockData) {
  const { scene, materials, addBox, addCylinder, addSign, addGlowSprite, addLightPool, addCollider, registerCullItem } = city;

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x24232a, roughness: 0.5, metalness: 0.72, bumpMap: materials.microBump, bumpScale: 0.015 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd39a, toneMapped: false });
  city.lampBulbMat = bulbMat;
  const redBulb = new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false });
  const greenBulb = new THREE.MeshBasicMaterial({ color: 0x57e6c2, toneMapped: false });
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xa8322a, roughness: 0.65, metalness: 0.25, bumpMap: materials.microBump, bumpScale: 0.02 });
  const benchWood = materials.benchWoodMat || new THREE.MeshStandardMaterial({ color: 0x4a3427, roughness: 0.95 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x44454f, roughness: 0.45, metalness: 0.65, bumpMap: materials.microBump, bumpScale: 0.015 });
  const trafficSignals = [];

  function addTree(x, z, s = 1) {
    addCylinder(0.16 * s, 0.23 * s, 2.4 * s, 5, materials.treeTrunkMat || materials.leafMats[0], x, 0.14 + 1.2 * s, z, { cast: true, cullDist: 145 });
    const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35 * s, 0), materials.leafMats[KC.randInt(0, 2)]);
    canopy.position.set(x, 0.14 + 3.25 * s, z);
    canopy.rotation.set(KC.rand(0, 1), KC.rand(0, 3), KC.rand(0, 1));
    canopy.scale.set(1, 1.2, 1);
    canopy.castShadow = true;
    scene.add(canopy);
    registerCullItem(canopy, x, z, 145);
    addCollider(x, z, 0.65 * s, 0.65 * s, 3.5, 'tree');
  }

  function addLamp(x, z, armDir, pool = true) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.13, 5.8, 5), poleMat);
    pole.position.y = 3.04;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.08), poleMat);
    arm.position.set(armDir * 0.55, 5.9, 0);
    const bx = armDir * 1.1;
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2), bulbMat);
    bulb.position.set(bx, 5.83, 0);
    g.add(pole, arm, bulb);
    g.position.set(x, 0, z);
    scene.add(g);
    registerCullItem(g, x, z, 150);

    const worldBx = x + bx;
    const glow = addGlowSprite(0xffd39a, worldBx, 5.82, z, 2.1, 0.65);
    const poolMesh = pool ? addLightPool(worldBx, 0.185, z, 0xffb46b, 12, 0.2) : null;
    const col = addCollider(x, z, 0.45, 0.45, 5.8, 'prop');
    const lampObj = { x: worldBx, y: 5.7, z, poleX: x, poleZ: z, group: g, bulb, glow, poolMesh, collider: col, broken: false };
    city.streetLamps.push(lampObj);
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'lamp', lampObj, broken: false });
    return lampObj;
  }

  function addTrafficLight(x, z, ry = 0) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.5, 5), poleMat);
    pole.position.y = 2.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.08), poleMat);
    arm.position.set(1.35, 4.45, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.05, 0.3), materials.darkMetal);
    box.position.set(2.6, 4.0, 0);
    const rMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, toneMapped: false });
    const yMat = new THREE.MeshBasicMaterial({ color: 0x3b2a08, toneMapped: false });
    const gMat = new THREE.MeshBasicMaterial({ color: 0x0a2e25, toneMapped: false });
    const lights = [rMat, yMat, gMat];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), lights[i]);
      l.position.set(2.6, 4.32 - i * 0.3, 0.17);
      g.add(l);
    }
    g.add(pole, arm, box);
    g.position.set(x, 0.14, z);
    g.rotation.y = ry;
    scene.add(g);
    registerCullItem(g, x, z, 145);
    addCollider(x, z, 0.45, 0.45, 4.6, 'prop');
    trafficSignals.push({ rMat, yMat, gMat, phase: (Math.abs(x + z) % 12) });
    return g;
  }

  function addHydrant(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.65, 6), hydrantMat);
    base.position.y = 0.45;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 6), hydrantMat);
    top.position.y = 0.85;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.1), hydrantMat);
    bar.position.y = 0.58;
    g.add(base, top, bar);
    g.position.set(x, 0, z);
    scene.add(g);
    registerCullItem(g, x, z, 115);
    const col = addCollider(x, z, 0.55, 0.55, 1.0, 'prop');
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'hydrant', broken: false, geyserTimer: 0 });
  }

  function addTrash(x, z) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.9, 6), materials.darkMetal);
    can.position.set(x, 0.58, z);
    can.castShadow = true;
    scene.add(can);
    registerCullItem(can, x, z, 115);
    const col = addCollider(x, z, 0.68, 0.68, 1.0, 'prop');
    city.destructibleProps.push({ mesh: can, collider: col, x, z, kind: 'trash', broken: false });
  }

  function addBench(x, z, ry) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.55), benchWood);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.1), benchWood);
    back.position.set(0, 0.85, -0.24);
    g.add(seat, back);
    for (const ox of [-0.75, 0.75]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.5), materials.darkMetal);
      leg.position.set(ox, 0.28, 0);
      g.add(leg);
    }
    g.position.set(x, 0.14, z);
    g.rotation.y = ry;
    scene.add(g);
    registerCullItem(g, x, z, 115);
    const col = addCollider(x, z, 1.7, 0.75, 1.0, 'prop');
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'bench', broken: false });
  }

  /* ---------------- street lamps across extended grid ---------------- */
  let lampCount = 0;
  for (const line of KC.ROAD_LINES) {
    for (let p = -164; p <= 164; p += 36) {
      if (KC.ROAD_LINES.some((l) => Math.abs(p - l) < 10)) continue;
      if (lampCount++ % 2 === 0) addLamp(line + 6.35, p, -1);
      if (lampCount++ % 3 === 0) addLamp(line - 6.35, p + 16, 1);
    }
  }
  for (const line of KC.ROAD_LINES) {
    for (let p = -150; p <= 164; p += 48) {
      if (KC.ROAD_LINES.some((l) => Math.abs(p - l) < 10)) continue;
      addLamp(p, line + 6.35, 1);
    }
  }

  /* Street signs at major crossings */
  const streetNames = [
    { text: 'MAIN ST', x: 0, z: -20 },
    { text: 'GRAND BLVD', x: 20, z: 0 },
    { text: '12TH ST', x: -20, z: -20 },
    { text: '18TH ST', x: 20, z: 40 },
    { text: 'BROADWAY', x: -60, z: 0 },
    { text: 'PASEO', x: 100, z: 20 },
    { text: 'WARD PKWY', x: -60, z: 140 }
  ];
  for (const s of streetNames) {
    const tex = KC.makeSignTexture(s.text, '#e8f2df', '#1e5b40');
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.68), mat);
    plate.position.set(s.x + 6.2, 4.9, s.z + 0.1);
    plate.rotation.y = Math.PI / 2;
    scene.add(plate);
    registerCullItem(plate, s.x, s.z, 120);
  }

  /* ---------------- traffic lights ---------------- */
  for (const [tx, tz, ry] of [
    [-26.4, -13.6, Math.PI],
    [26.4, -26.4, 0],
    [-13.6, 13.6, Math.PI / 2],
    [13.6, 26.4, -Math.PI / 2],
    [26.4, 66.4, 0],
    [-26.4, 53.6, Math.PI],
    [-66.4, -13.6, Math.PI],
    [66.4, 26.4, 0],
    [-13.6, 106.4, -Math.PI / 2],
    [26.4, -93.6, 0]
  ]) {
    addTrafficLight(tx, tz, ry);
  }

  const umbrellaColors = [0xc8232c, 0xd99126, 0x1e5b40, 0x243b5a, 0xd13b6f];
  const mailboxMat = new THREE.MeshStandardMaterial({ color: 0x1b427a, roughness: 0.55, metalness: 0.38, bumpMap: materials.microBump, bumpScale: 0.02 });
  const dumpsterMat = new THREE.MeshStandardMaterial({ color: 0x244232, roughness: 0.8, metalness: 0.28, bumpMap: materials.microBump, bumpScale: 0.025 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5f1f, roughness: 0.58 });
  const planterMat = materials.stoneMat || new THREE.MeshStandardMaterial({ color: 0x565258, roughness: 0.95 });

  /* Animate traffic light bulbs cycling Red -> Green -> Amber across intersections */
  city.updaters.push((t) => {
    for (const sig of trafficSignals) {
      const cyc = (t + sig.phase) % 14;
      const isGreen = cyc < 6.5;
      const isAmber = cyc >= 6.5 && cyc < 8.5;
      const isRed = cyc >= 8.5;
      sig.gMat.color.setHex(isGreen ? 0x57e6c2 : 0x0a241d);
      sig.yMat.color.setHex(isAmber ? 0xffb13b : 0x2b1d06);
      sig.rMat.color.setHex(isRed ? 0xff3b3b : 0x2e0909);
    }
  });

  function addPatioUmbrella(x, z) {
    const g = new THREE.Group();
    const uMat = new THREE.MeshStandardMaterial({ color: KC.pick(umbrellaColors), roughness: 0.85, flatShading: true });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 7), benchWood);
    table.position.y = 0.72;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.15, 5), poleMat);
    pole.position.y = 1.08;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.55, 7), uMat);
    canopy.position.y = 2.22;
    g.add(table, pole, canopy);
    for (const [cx, cz] of [[-0.82, 0], [0.82, 0]]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), materials.darkMetal);
      seat.position.set(cx, 0.22, cz);
      g.add(seat);
    }
    g.position.set(x, 0.14, z);
    scene.add(g);
    registerCullItem(g, x, z, 118);
    const col = addCollider(x, z, 1.3, 1.3, 2.1, 'prop');
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'umbrella', broken: false });
  }

  function addMailbox(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.92, 0.54), mailboxMat);
    body.position.y = 0.46;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.54, 6), mailboxMat);
    top.rotation.z = Math.PI / 2;
    top.position.y = 0.92;
    g.add(body, top);
    g.position.set(x, 0.14, z);
    scene.add(g);
    registerCullItem(g, x, z, 110);
    const col = addCollider(x, z, 0.58, 0.58, 1.15, 'prop');
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'mailbox', broken: false });
  }

  function addDumpster(x, z, ry = 0) {
    const g = new THREE.Group();
    const bin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.25, 1.3), dumpsterMat);
    bin.position.y = 0.63;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.14, 1.36), materials.darkMetal);
    lid.position.y = 1.28;
    g.add(bin, lid);
    g.position.set(x, 0.14, z);
    g.rotation.y = ry;
    scene.add(g);
    registerCullItem(g, x, z, 125);
    addCollider(x, z, 2.0, 1.3, 1.4, 'prop');
  }

  function addPlanter(x, z) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.9), planterMat);
    box.position.y = 0.28;
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), materials.leafMats[1]);
    bush.position.set(-0.35, 0.72, 0);
    const bush2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), materials.leafMats[0]);
    bush2.position.set(0.38, 0.68, 0);
    g.add(box, bush, bush2);
    g.position.set(x, 0.14, z);
    scene.add(g);
    registerCullItem(g, x, z, 115);
    const col = addCollider(x, z, 1.5, 0.85, 1.1, 'prop');
    city.destructibleProps.push({ mesh: g, collider: col, x, z, kind: 'planter', broken: false });
  }

  function addTrafficCones(x, z) {
    for (let i = 0; i < 3; i++) {
      const cx = x + (i - 1) * 0.95;
      const cz = z + (i % 2) * 0.35;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), materials.darkMetal);
      base.position.y = 0.025;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.68, 6), coneMat);
      cone.position.y = 0.36;
      g.add(base, cone);
      g.position.set(cx, 0.14, cz);
      scene.add(g);
      registerCullItem(g, cx, cz, 105);
      const col = addCollider(cx, cz, 0.38, 0.38, 0.7, 'prop');
      city.destructibleProps.push({ mesh: g, collider: col, x: cx, z: cz, kind: 'cone', broken: false });
    }
  }

  function addTransitShelter(x, z, ry, label = 'KC STREETCAR') {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 1.7), poleMat);
    roof.position.y = 2.55;
    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.3, 0.08), materials.glassMat);
    backGlass.position.set(0, 1.28, -0.75);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.45), benchWood);
    bench.position.set(-0.3, 0.52, -0.45);
    g.add(roof, backGlass, bench);
    for (const ox of [-1.75, 1.75]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5), poleMat);
      post.position.set(ox, 1.25, 0.72);
      g.add(post);
    }
    g.position.set(x, 0.14, z);
    g.rotation.y = ry;
    scene.add(g);
    registerCullItem(g, x, z, 140);
    addCollider(x, z, 3.6, 1.6, 2.6, 'prop');
    addSign(label, '#57e6c2', x, 2.85, z, ry, 3.5, 0.65, { bg: '#101822' });
  }

  function addBillboard(text, color, x, y, z, ry = 0) {
    addCylinder(0.22, 0.28, y, 6, poleMat, x, y / 2, z, { cast: false, cullDist: 165 });
    addBox(9.6, 3.4, 0.35, materials.darkMetal, x, y + 1.5, z, ry, { cast: true, cullDist: 165 });
    const dz = Math.cos(ry) * 0.22, dx = Math.sin(ry) * 0.22;
    addSign(text, color, x + dx, y + 1.5, z + dz, ry, 9.2, 2.9, { bg: '#12131a' });
  }

  /* ---------------- KC Streetcar Line & Shelters on Main St (x = -20) ---------------- */
  addTransitShelter(-13.4, -52, -Math.PI / 2, 'KC STREETCAR // RIVER MKT');
  addTransitShelter(-13.4, -8, -Math.PI / 2, 'KC STREETCAR // P&L');
  addTransitShelter(-13.4, 34, -Math.PI / 2, 'KC STREETCAR // CROSSROADS');
  addTransitShelter(-13.4, 74, -Math.PI / 2, 'KC STREETCAR // UNION STA');
  addTransitShelter(26.6, 12, Math.PI / 2, 'RIDE KC METRO // GRAND');
  addTransitShelter(-66.6, 32, -Math.PI / 2, 'RIDE KC METRO // WESTPORT');

  /* Embedded steel KC Streetcar rails along Main St (x = -17.55) */
  for (const rx of [-18.2, -16.9]) {
    addBox(0.09, 0.025, 340, railMat, rx, 0.019, 0, 0, { cast: false });
  }

  /* Interactive KC Street Food & Coffee Vendor Carts (Press [E] for $25 Health & Speed Boost!) */
  city.vendorCarts = [];
  function addVendorCart(x, z, ry, name, tagColor = '#ffb13b') {
    const g = new THREE.Group();
    const cartMat = city.awningMats ? KC.pick(city.awningMats) : benchWood;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 1.15), benchWood);
    base.position.y = 0.62;
    base.castShadow = true;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.09, 1.26), railMat);
    counter.position.y = 1.16;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 1.45), cartMat);
    canopy.position.y = 2.25;
    canopy.castShadow = true;
    g.add(base, counter, canopy);
    for (const ox of [-1.02, 1.02]) {
      for (const oz of [-0.48, 0.48]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 4), poleMat);
        post.position.set(ox, 1.68, oz);
        g.add(post);
      }
    }
    /* Coffee urn & BBQ warmers on counter */
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 6), railMat);
    urn.position.set(-0.55, 1.38, 0);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 0.45), hydrantMat);
    tray.position.set(0.35, 1.28, 0);
    g.add(urn, tray);

    g.position.set(x, 0.14, z);
    g.rotation.y = ry;
    scene.add(g);
    registerCullItem(g, x, z, 130);
    addCollider(x, z, 2.2, 1.2, 2.3, 'prop');
    addSign(name, tagColor, x, 2.58, z, ry, 2.4, 0.46, { bg: '#121118' });
    city.vendorCarts.push({ x, z, name, group: g });
  }

  addVendorCart(7.5, 11.8, 0, 'ROASTERIE ESPRESSO $25', '#57e6c2');
  addVendorCart(-9.5, 14.2, 0, 'KC BURNT ENDS CART $25', '#ffb13b');
  addVendorCart(130.5, -23.5, 0, 'ROASTERIE COLD BREW $25', '#57e6c2');
  addVendorCart(96.5, 67.5, Math.PI, '18TH & VINE RIBS $25', '#ff5f8f');
  addVendorCart(-36.5, 67.5, 0, 'WESTPORT TACOS & BBQ $25', '#ffb13b');
  addVendorCart(52.5, 97.5, 0, 'JACK STACK SMOKE CART $25', '#ffc77a');

  /* Animated Low-Poly KC Streetcar Tram gliding along Main St (x = -20) */
  {
    const tram = new THREE.Group();
    const tramWhite = new THREE.MeshStandardMaterial({ color: 0xebe8df, roughness: 0.35, metalness: 0.3 });
    const tramBlue = new THREE.MeshStandardMaterial({ color: 0x1e64a8, roughness: 0.4, metalness: 0.4 });
    const tramAmber = new THREE.MeshBasicMaterial({ color: 0xffb13b, toneMapped: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.75, 11.4), tramWhite);
    body.position.y = 1.65;
    body.castShadow = true;
    tram.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 11.44), tramBlue);
    stripe.position.y = 1.05;
    tram.add(stripe);
    const windows = new THREE.Mesh(new THREE.BoxGeometry(2.62, 1.05, 9.8), materials.warmGlassMat);
    windows.position.y = 1.95;
    tram.add(windows);
    /* Headlights & destination boards on both ends */
    for (const ez of [-5.72, 5.72]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.05), tramAmber);
      hl.position.set(0, 0.85, ez);
      tram.add(hl);
    }
    /* Roof pantograph */
    const panto = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.65, 1.8), poleMat);
    panto.position.set(0, 3.3, 0);
    tram.add(panto);
    tram.position.set(-17.55, 0.05, -35);
    scene.add(tram);
    city.updaters.push((t) => {
      const zPos = Math.sin(t * 0.11) * 115;
      tram.position.z = zPos;
    });
  }

  /* ---------------- Roadside KC Business Billboards ---------------- */
  addBillboard('GATES BAR-B-Q // KC', '#ff4b3a', -33, 8.5, -14, 0.3);
  addBillboard('BOULEVARD BREWING CO', '#ffb13b', 33, 9.5, -52, -0.35);
  addBillboard('THE ROASTERIE COFFEE', '#57e6c2', 53, 8.5, 14, -0.25);
  addBillboard('ARTHUR BRYANTS BBQ', '#ffc77a', 93, 8.5, 26, -0.4);
  addBillboard('GREEN LADY JAZZ LIVE', '#ff5f8f', -13, 9.0, 52, 0.2);

  /* ---------------- Rich Sidewalk Life & Street Clutter ---------------- */
  for (const b of blockData) {
    if (!b.park) {
      /* Populate all 4 edges of each city block with trees, benches, patios, planters, trash cans & mailboxes */
      for (let edge = 0; edge < 4; edge++) {
        const t1 = KC.rand(-10, -2);
        const t2 = KC.rand(2, 10);
        let x1 = b.cx, z1 = b.cz, x2 = b.cx, z2 = b.cz;
        let ry = 0;
        if (edge === 0) { x1 += t1; z1 -= 13.2; x2 += t2; z2 -= 13.2; ry = Math.PI; }
        if (edge === 1) { x1 += t1; z1 += 13.2; x2 += t2; z2 += 13.2; ry = 0; }
        if (edge === 2) { x1 += 13.2; z1 += t1; x2 += 13.2; z2 += t2; ry = Math.PI / 2; }
        if (edge === 3) { x1 -= 13.2; z1 += t1; x2 -= 13.2; z2 += t2; ry = -Math.PI / 2; }

        if (Math.random() < 0.65) addTree(x1, z1, KC.rand(0.68, 0.98));
        if (Math.random() < 0.42) addBench(x2, z2, ry);
        else if (Math.random() < 0.38) addPatioUmbrella(x2, z2);
        else if (Math.random() < 0.35) addPlanter(x2, z2);

        if (Math.random() < 0.32) addTrash(x1 + (edge < 2 ? 1.8 : 0), z1 + (edge >= 2 ? 1.8 : 0));
        if (edge === 0 && Math.random() < 0.28) addMailbox(b.cx + 11.8, b.cz - 13.2);
        if (edge === 1 && Math.random() < 0.32) addHydrant(b.cx - 12.2, b.cz + 13.5);
      }
      if (Math.random() < 0.42) {
        addDumpster(b.cx + KC.rand(-4, 4), b.cz + KC.rand(-4, 4), KC.rand(0, Math.PI));
      }
      if (Math.random() < 0.22) {
        addTrafficCones(b.cx + 13.8, b.cz + KC.rand(-8, 8));
      }
    } else {
      for (let i = 0; i < 7; i++) addTree(b.cx + KC.rand(-11, 11), b.cz + KC.rand(-11, 11), KC.rand(0.75, 1.1));
      addBench(b.cx - 4, b.cz, 0);
      addBench(b.cx + 4, b.cz, Math.PI);
      addPatioUmbrella(b.cx, b.cz + 5);
    }
  }
  /* Extra street life right around the Power & Light spawn area */
  addPatioUmbrella(-6, 12.8);
  addPatioUmbrella(6, 12.8);
  addPlanter(-2.5, 13.4);
  addPlanter(8.5, 13.4);
  addMailbox(11.5, 13.4);
  addTrafficCones(-12.5, 14.2);
  addHydrant(6.2, 13.5);
  addHydrant(-14.2, -9.5);
  addHydrant(43.5, 58.4);
  addHydrant(-46.2, 14.0);
  addBench(9, 16, -0.4);

  /* ---------------- Missouri River / north edge (Textured & Animated Ripples + River Barge) ---------------- */
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x16384c,
    map: materials.waterTex ? materials.waterTex.map : null,
    bumpMap: materials.waterTex ? materials.waterTex.bumpMap : null,
    bumpScale: 0.055,
    roughness: 0.18,
    metalness: 0.72,
    emissive: 0x061520,
    emissiveIntensity: 0.38
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 170), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.42, -268);
  scene.add(water);
  city.water = water;

  /* Missouri River Cargo Barge & Tugboat gliding east/west */
  {
    const barge = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 1.4, 4.8), hydrantMat);
    hull.position.y = 0.4;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.3, 4.2), materials.darkMetal);
    deck.position.y = 1.15;
    const cabinB = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 3.2), materials.paleStoneMat || materials.curbMat);
    cabinB.position.set(-5.8, 2.3, 0);
    const cargo1 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.8, 3.4), mailboxMat);
    cargo1.position.set(0.2, 2.1, 0);
    const cargo2 = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.8, 3.4), dumpsterMat);
    cargo2.position.set(5.4, 2.1, 0);
    const mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), bulbMat);
    mastLight.position.set(-5.8, 4.1, 0);
    barge.add(hull, deck, cabinB, cargo1, cargo2, mastLight);
    barge.position.set(-40, -0.35, -234);
    scene.add(barge);

    city.updaters.push((t) => {
      if (materials.waterTex && materials.waterTex.map) {
        materials.waterTex.map.offset.x = (t * 0.035) % 1;
        materials.waterTex.map.offset.y = Math.sin(t * 0.25) * 0.04;
        materials.waterTex.bumpMap.offset.x = (t * 0.035) % 1;
      }
      barge.position.x = Math.sin(t * 0.045) * 145;
      barge.rotation.y = Math.cos(t * 0.045) >= 0 ? 0 : Math.PI;
    });
  }

  /* ---------------- Aerial Life: Circling KCPD / KC Skyline Helicopter & Low-Poly Drifting Clouds ---------------- */
  {
    const heli = new THREE.Group();
    const heliBodyMat = new THREE.MeshStandardMaterial({ color: 0x162234, roughness: 0.35, metalness: 0.65 });
    const heliGoldMat = new THREE.MeshBasicMaterial({ color: 0xffb13b, toneMapped: false });
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.45, 3.6), heliBodyMat);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.1, 1.1), materials.glassMat);
    nose.position.set(0, -0.08, -2.1);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.22, 3.4), heliGoldMat);
    stripe.position.y = 0.05;
    const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 3.6), heliBodyMat);
    tailBoom.position.set(0, 0.22, 3.3);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.25, 0.75), heliBodyMat);
    tailFin.position.set(0, 0.75, 4.9);
    const mainRotor = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.06, 0.34), materials.darkMetal);
    mainRotor.position.set(0, 0.96, 0);
    const mainRotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 7.6), materials.darkMetal);
    mainRotor2.position.set(0, 0.96, 0);
    const rotorHub = new THREE.Group();
    rotorHub.add(mainRotor, mainRotor2);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 0.18), materials.darkMetal);
    tailRotor.position.set(0.16, 0.75, 5.0);
    const searchLight = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 4), bulbMat);
    searchLight.position.set(0, -0.82, -1.7);
    const strobeRed = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), redBulb);
    strobeRed.position.set(0, 1.42, 4.9);
    heli.add(fuselage, nose, stripe, tailBoom, tailFin, rotorHub, tailRotor, searchLight, strobeRed);
    heli.position.set(0, 68, 0);
    scene.add(heli);

    /* 16 Low-Poly Flat-Shaded Volumetric Sky Clouds */
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xdce4f2, roughness: 0.95, metalness: 0.0, flatShading: true, transparent: true, opacity: 0.55
    });
    const clouds = [];
    for (let i = 0; i < 16; i++) {
      const cg = new THREE.Group();
      const puffs = KC.randInt(3, 5);
      for (let p = 0; p < puffs; p++) {
        const r = KC.rand(5.5, 10.5);
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), cloudMat);
        puff.position.set((p - 1.5) * KC.rand(5.5, 8.5), KC.rand(-1.2, 1.8), KC.rand(-3.5, 3.5));
        puff.scale.set(1.3, 0.52, 1.0);
        cg.add(puff);
      }
      const angle = (i / 16) * Math.PI * 2;
      const dist = KC.rand(75, 220);
      cg.position.set(Math.cos(angle) * dist, KC.rand(108, 142), Math.sin(angle) * dist);
      scene.add(cg);
      clouds.push({ group: cg, speed: KC.rand(0.9, 1.8) });
    }

    city.updaters.push((t) => {
      const a = t * 0.14;
      const rx = Math.cos(a) * 82;
      const rz = Math.sin(a * 0.7) * 74;
      const nextA = a + 0.05;
      const nx = Math.cos(nextA) * 82;
      const nz = Math.sin(nextA * 0.7) * 74;
      heli.position.set(rx, 66 + Math.sin(t * 0.9) * 2.5, rz);
      heli.rotation.y = Math.atan2(-(nx - rx), -(nz - rz));
      heli.rotation.z = Math.sin(a) * 0.12;
      rotorHub.rotation.y = t * 22;
      tailRotor.rotation.x = t * 26;
      strobeRed.visible = Math.sin(t * 9) > 0;

      for (const c of clouds) {
        c.group.position.x += c.speed * 0.016;
        if (c.group.position.x > 250) c.group.position.x = -250;
      }
    });
  }

  /* Riverwalk railing along north boundary */
  for (let x = -185; x <= 185; x += 9) {
    addCylinder(0.07, 0.09, 1.15, 4, railMat, x, 0.58, -189.4, { cast: false, cullDist: 140 });
  }
  addBox(376, 0.07, 0.09, railMat, 0, 1.12, -189.4, 0, { cast: false });
  addBox(376, 0.06, 0.06, railMat, 0, 0.7, -189.4, 0, { cast: false });
  addSign('MISSOURI RIVER', '#57e6c2', 0, 2.0, -189.2, 0, 10, 1.4);

  /* Broadway / Kit Bond Bridge on north road */
  addBox(12, 0.35, 60, materials.sidewalkMat, 20, 0.02, -218, 0, { cast: true });
  for (const ox of [-5.8, 5.8]) {
    addBox(0.16, 0.14, 60, railMat, 20 + ox, 1.1, -218, 0, { cast: false });
    for (let z = -244; z <= -193; z += 8) addCylinder(0.08, 0.1, 1.1, 4, railMat, 20 + ox, 0.58, z, { cast: false, cullDist: 150 });
  }
  for (const z of [-198, -220, -240]) {
    addCylinder(1.2, 1.5, 2, 6, materials.curbMat, 20, -1.0, z, { cast: false });
  }
  addLightPool(20, 0.22, -194, 0xffb46b, 18, 0.18);

  /* Distant north-bank silhouettes */
  const farMat = new THREE.MeshBasicMaterial({ color: 0x0d0d14, toneMapped: false });
  for (let i = 0; i < 22; i++) {
    const w = KC.rand(5, 16), h = KC.rand(6, 30), d = KC.rand(5, 14);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), farMat);
    mesh.position.set(KC.rand(-220, 220), h / 2 - 0.4, KC.rand(-330, -285));
    scene.add(mesh);
  }

  /* ---------------- traffic + parked car spots across extended city ---------------- */
  const carColors = [0xa32b2b, 0x2b4b7a, 0xd3d0c7, 0x25252b, 0x8d7c3c, 0x3b6b56, 0x6b2f6f, 0xb46b2c, 0x205768, 0xc97a2b];
  const innerLines = [-60, -20, 20, 60];
  const laneOffset = 2.45;
  for (let i = 0; i < 36; i++) {
    const axis = Math.random() < 0.5 ? 'v' : 'h';
    /* Bias 65% of traffic toward inner downtown/midtown road lines so streets feel busy */
    const line = Math.random() < 0.65 ? KC.pick(innerLines) : KC.pick(KC.ROAD_LINES);
    const span = Math.abs(line) <= 60 ? 115 : 172;
    let x, z, heading;
    if (axis === 'v') {
      const dir = Math.random() < 0.5 ? 0 : Math.PI;
      x = line + (dir === 0 ? laneOffset : -laneOffset);
      z = KC.rand(-span, span);
      if (KC.ROAD_LINES.some((l) => Math.abs(z - l) < 9)) z += 13;
      heading = dir;
    } else {
      const dir = Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
      z = line + (dir === -Math.PI / 2 ? laneOffset : -laneOffset);
      x = KC.rand(-span, span);
      if (KC.ROAD_LINES.some((l) => Math.abs(x - l) < 9)) x += 13;
      heading = dir;
    }
    city.trafficSpots.push({ x, z, heading, speed: KC.rand(6.0, 10.5), color: KC.pick(carColors), kind: 'traffic', axis, line, dir: heading });
  }

  /* Guaranteed curbside starter car + downtown parked cars right near Power & Light spawn */
  city.parkedSpots.push({ x: 2.5, z: 14.3, heading: -Math.PI / 2, speed: 0, color: 0xa32b2b, kind: 'parked' });
  city.parkedSpots.push({ x: -8.5, z: 15.8, heading: -Math.PI / 2, speed: 0, color: 0x2b4b7a, kind: 'parked' });
  city.parkedSpots.push({ x: 11.5, z: 24.2, heading: Math.PI / 2, speed: 0, color: 0x8d7c3c, kind: 'parked' });
  city.parkedSpots.push({ x: 15.8, z: 4.5, heading: Math.PI, speed: 0, color: 0x3b6b56, kind: 'parked' });
  city.parkedSpots.push({ x: -15.8, z: -4.5, heading: 0, speed: 0, color: 0xd3d0c7, kind: 'parked' });

  for (let i = 0; i < 48; i++) {
    const axis = Math.random() < 0.5 ? 'v' : 'h';
    const line = Math.random() < 0.65 ? KC.pick(innerLines) : KC.pick(KC.ROAD_LINES);
    const span = Math.abs(line) <= 60 ? 110 : 170;
    let x, z, heading;
    if (axis === 'v') {
      const side = Math.random() < 0.5 ? 1 : -1;
      x = line + side * 4.2;
      z = KC.rand(-span, span);
      if (KC.ROAD_LINES.some((l) => Math.abs(z - l) < 9)) z += 11;
      heading = side > 0 ? Math.PI : 0;
    } else {
      const side = Math.random() < 0.5 ? 1 : -1;
      z = line + side * 4.2;
      x = KC.rand(-span, span);
      if (KC.ROAD_LINES.some((l) => Math.abs(x - l) < 9)) x += 11;
      heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    city.parkedSpots.push({ x, z, heading, speed: 0, color: KC.pick(carColors), kind: 'parked' });
  }

  /* ---------------- pedestrian spawn spots ---------------- */
  for (const b of blockData) {
    for (let k = 0; k < 2; k++) {
      const edge = KC.randInt(0, 3);
      const t = KC.rand(-12, 12);
      let x = b.cx, z = b.cz;
      if (edge === 0) { x += t; z -= 13.2; }
      if (edge === 1) { x += t; z += 13.2; }
      if (edge === 2) { x += 13.2; z += t; }
      if (edge === 3) { x -= 13.2; z += t; }
      city.pedSpots.push({ x, z });
    }
  }

  /* ---------------- extended district labels ---------------- */
  city.mapData = {
    bounds: 194,
    lines: KC.ROAD_LINES.slice(),
    blocks: blockData.map((b) => ({
      x: b.cx, z: b.cz, size: 30, name: b.name, landmark: b.landmark, park: !!b.park
    })),
    water: { minZ: -340, maxZ: -194 },
    districts: [
      { name: 'BERKLEY RIVERFRONT', x: 0, z: -160 },
      { name: 'RIVER MARKET', x: 0, z: -80 },
      { name: 'COLUMBUS PARK', x: 80, z: -120 },
      { name: 'QUALITY HILL', x: -80, z: -40 },
      { name: 'WEST BOTTOMS', x: -160, z: -40 },
      { name: 'DOWNTOWN', x: -40, z: -40 },
      { name: 'DOWNTOWN', x: 0, z: -40 },
      { name: 'DOWNTOWN', x: 40, z: -40 },
      { name: 'BARTLE HALL', x: -40, z: 0 },
      { name: 'POWER & LIGHT', x: 0, z: 0 },
      { name: 'T-MOBILE CENTER', x: 40, z: 0 },
      { name: 'EAST CROSSROADS', x: 120, z: -40 },
      { name: 'CROSSROADS', x: 0, z: 40 },
      { name: 'CROSSROADS', x: -40, z: 40 },
      { name: 'KAUFFMAN CENTER', x: 40, z: 40 },
      { name: '18TH & VINE', x: 80, z: 40 },
      { name: 'PASEO DISTRICT', x: 140, z: 40 },
      { name: 'WESTPORT', x: -80, z: 40 },
      { name: 'WESTPORT SOUTH', x: -120, z: 100 },
      { name: 'UNION STATION', x: 0, z: 80 },
      { name: 'LIBERTY MEMORIAL', x: -40, z: 80 },
      { name: 'PENN VALLEY PARK', x: -40, z: 120 },
      { name: 'CROWN CENTER', x: 40, z: 80 },
      { name: 'HOSPITAL HILL', x: 80, z: 120 },
      { name: 'COUNTRY CLUB PLAZA', x: -80, z: 160 },
      { name: 'MIDTOWN', x: 0, z: 140 }
    ],
    landmarkLabels: Object.values(city.landmarks).map((l) => ({ label: l.label, x: l.x, z: l.z }))
  };
};
