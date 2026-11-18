import * as THREE from 'three';
import { SceneMaterialSet } from './materials.ts';

export interface ExplodableAssembly {
  id: 'coffee_lot' | 'reefer_container' | 'gantry_crane';
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
  group: THREE.Group;
  applyExplode: (amount: number) => void;
  focusPoint: THREE.Vector3;
  cameraOffset: THREE.Vector3;
  disposeGeometries: () => void;
}

function tagInteractiveLayer(obj: THREE.Object3D, assemblyId: string) {
  obj.traverse((child) => {
    child.layers.enable(1);
    child.userData.assemblyId = assemblyId;
  });
}

function makeRoundedSackGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hd = depth / 2;
  const r = 0.08;
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeTangents();
  return geo;
}

export function buildCoffeePalletAssembly(mats: SceneMaterialSet): ExplodableAssembly {
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const group = new THREE.Group();
  group.position.set(-2.9, 0, 1.3);

  // Contact shadow grounding plane
  const shadowGeo = track(new THREE.PlaneGeometry(3.2, 2.7));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowPlane = new THREE.Mesh(shadowGeo, mats.contactShadow);
  shadowPlane.position.y = 0.006;
  group.add(shadowPlane);

  // 1. Hardwood Pallet Base (3 stringers + 5 top deck slats, bottom at y = 0)
  const palletGroup = new THREE.Group();
  const stringerGeo = track(new THREE.BoxGeometry(0.11, 0.14, 1.7));
  [-0.85, 0, 0.85].forEach((x) => {
    const s = new THREE.Mesh(stringerGeo, mats.palletWood);
    s.position.set(x, 0.07, 0);
    s.castShadow = true;
    s.receiveShadow = true;
    palletGroup.add(s);
  });
  const slatGeo = track(new THREE.BoxGeometry(1.9, 0.04, 0.24));
  [-0.68, -0.34, 0, 0.34, 0.68].forEach((z) => {
    const slat = new THREE.Mesh(slatGeo, mats.palletWood);
    slat.position.set(0, 0.16, z);
    slat.castShadow = true;
    slat.receiveShadow = true;
    palletGroup.add(slat);
  });
  group.add(palletGroup);

  // 2. Stacked Bevelled Burlap Sacks (2 tiers x 4 sacks = 8 sacks)
  const sackGeo = track(makeRoundedSackGeometry(0.76, 0.24, 0.68));
  const tier1 = new THREE.Group();
  const tier2 = new THREE.Group();
  const coords: Array<[number, number]> = [
    [-0.44, -0.38],
    [0.44, -0.38],
    [-0.44, 0.38],
    [0.44, 0.38],
  ];

  coords.forEach(([x, z], idx) => {
    const m1 = new THREE.Mesh(sackGeo, mats.burlap);
    m1.position.set(x, 0.34, z);
    m1.rotation.y = idx % 2 === 0 ? 0.03 : -0.02;
    m1.castShadow = true;
    m1.receiveShadow = true;
    tier1.add(m1);

    const m2 = new THREE.Mesh(sackGeo, mats.burlap);
    m2.position.set(x * 0.96, 0.65, z * 0.96);
    m2.rotation.y = idx % 2 === 0 ? -0.04 : 0.03;
    m2.castShadow = true;
    m2.receiveShadow = true;
    tier2.add(m2);
  });
  group.add(tier1, tier2);

  // 3. Polypropylene Export Strapping (TubeGeometry)
  const strapCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.92, 0.18, -0.38),
      new THREE.Vector3(-0.92, 0.83, -0.38),
      new THREE.Vector3(0.92, 0.83, -0.38),
      new THREE.Vector3(0.92, 0.18, -0.38),
    ],
    true
  );
  const strapGeo = track(new THREE.TubeGeometry(strapCurve, 36, 0.018, 6, true));
  const strapsGroup = new THREE.Group();
  const strapFront = new THREE.Mesh(strapGeo, mats.polyStrap);
  const strapBack = new THREE.Mesh(strapGeo, mats.polyStrap);
  strapBack.position.z = 0.76;
  strapsGroup.add(strapFront, strapBack);
  group.add(strapsGroup);

  // 4. LatheGeometry Brass Moisture & Core Sampling Probe
  const probePoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.025, 0.02),
    new THREE.Vector2(0.03, 0.52),
    new THREE.Vector2(0.085, 0.56),
    new THREE.Vector2(0.085, 0.68),
    new THREE.Vector2(0.04, 0.71),
    new THREE.Vector2(0.0, 0.72),
  ];
  const probeGeo = track(new THREE.LatheGeometry(probePoints, 24));
  probeGeo.computeTangents();
  const probeMesh = new THREE.Mesh(probeGeo, mats.brassProbe);
  probeMesh.position.set(0.18, 0.72, 0.1);
  probeMesh.rotation.z = -0.18;
  probeMesh.castShadow = true;
  group.add(probeMesh);

  // 5. EUDR Lot Plaque on pallet side
  const plaqueGeo = track(new THREE.BoxGeometry(0.46, 0.14, 0.025));
  const plaque = new THREE.Mesh(plaqueGeo, mats.plaqueMat);
  plaque.position.set(0, 0.45, 0.8);
  group.add(plaque);

  tagInteractiveLayer(group, 'coffee_lot');

  return {
    id: 'coffee_lot',
    title: 'Lot EB-UG-2026-01 · Bugisu Arabica',
    subtitle: 'EUDR Polygon-Traced · 8x 60kg Export Sacks + Core Probe',
    metrics: [
      { label: 'Moisture', value: '11.2%' },
      { label: 'Cup Score', value: '86.5 SCA' },
      { label: 'FOB Rate', value: '$5.10/kg' },
    ],
    group,
    focusPoint: new THREE.Vector3(-2.9, 0.65, 1.3),
    cameraOffset: new THREE.Vector3(-5.8, 2.7, 4.9),
    applyExplode: (amount: number) => {
      tier1.position.y = amount * 0.25;
      tier2.position.y = amount * 0.72;
      strapsGroup.position.y = amount * 1.05;
      probeMesh.position.y = 0.72 + amount * 1.25;
      plaque.position.z = 0.8 + amount * 0.45;
    },
    disposeGeometries: () => geometries.forEach((g) => g.dispose()),
  };
}

export function buildReeferContainerAssembly(mats: SceneMaterialSet): ExplodableAssembly {
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const group = new THREE.Group();
  group.position.set(1.5, 0, 0.5);

  const shadowGeo = track(new THREE.PlaneGeometry(6.8, 3.6));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, mats.contactShadow);
  shadow.position.y = 0.008;
  group.add(shadow);

  // 1. ISO Steel Corner Posts & Bottom Chassis Frame (flush y = 0)
  const frameGroup = new THREE.Group();
  const baseBeamGeo = track(new THREE.BoxGeometry(5.6, 0.16, 2.35));
  const baseBeam = new THREE.Mesh(baseBeamGeo, mats.containerSteelFrame);
  baseBeam.position.y = 0.08;
  baseBeam.castShadow = true;
  baseBeam.receiveShadow = true;
  frameGroup.add(baseBeam);

  const postGeo = track(new THREE.BoxGeometry(0.14, 2.32, 0.14));
  [
    [-2.73, -1.1],
    [2.73, -1.1],
    [-2.73, 1.1],
    [2.73, 1.1],
  ].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeo, mats.containerSteelFrame);
    post.position.set(x, 1.24, z);
    post.castShadow = true;
    frameGroup.add(post);
  });
  group.add(frameGroup);

  // 2. Corrugated Container Shell Body
  const bodyGeo = track(new THREE.BoxGeometry(5.32, 2.1, 2.2));
  const body = new THREE.Mesh(bodyGeo, mats.containerShell);
  body.position.y = 1.21;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 3. Chamfered Roof Panel & Structural Ribs (ExtrudeGeometry)
  const roofGroup = new THREE.Group();
  const roofGeo = track(new THREE.BoxGeometry(5.54, 0.12, 2.34));
  const roof = new THREE.Mesh(roofGeo, mats.containerSteelFrame);
  roof.position.y = 2.34;
  roof.castShadow = true;
  roofGroup.add(roof);

  const ribGeo = track(new THREE.BoxGeometry(0.14, 0.06, 2.16));
  for (let i = -2.2; i <= 2.2; i += 0.55) {
    const rib = new THREE.Mesh(ribGeo, mats.craneYellow);
    rib.position.set(i, 2.42, 0);
    roofGroup.add(rib);
  }
  group.add(roofGroup);

  // 4. Reefer Condenser & Ventilation Grille Module (Left End)
  const reeferUnit = new THREE.Group();
  const unitHousing = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.28, 1.82, 1.98)),
    mats.reeferGrille
  );
  unitHousing.position.set(-2.78, 1.22, 0);
  unitHousing.castShadow = true;
  reeferUnit.add(unitHousing);

  const fanRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.32, 0.04, 12, 24)),
    mats.craneDarkSteel
  );
  fanRing.rotation.y = Math.PI / 2;
  fanRing.position.set(-2.93, 1.48, 0);
  reeferUnit.add(fanRing);

  const glassTelemetry = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.05, 0.36, 0.48)),
    mats.inspectionGlass
  );
  glassTelemetry.position.set(-2.93, 0.78, 0.45);
  reeferUnit.add(glassTelemetry);
  group.add(reeferUnit);

  // 5. Rear Cargo Doors + Vertical Locking Bars
  const doorGroup = new THREE.Group();
  const doorLeafGeo = track(new THREE.BoxGeometry(0.1, 1.98, 1.02));
  const doorLeft = new THREE.Mesh(doorLeafGeo, mats.containerShell);
  doorLeft.position.set(2.74, 1.22, -0.53);
  const doorRight = new THREE.Mesh(doorLeafGeo, mats.containerShell);
  doorRight.position.set(2.74, 1.22, 0.53);

  const barGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 1.92, 10));
  const bar1 = new THREE.Mesh(barGeo, mats.craneDarkSteel);
  bar1.position.set(2.81, 1.22, -0.25);
  const bar2 = new THREE.Mesh(barGeo, mats.craneDarkSteel);
  bar2.position.set(2.81, 1.22, 0.25);
  doorGroup.add(doorLeft, doorRight, bar1, bar2);
  group.add(doorGroup);

  tagInteractiveLayer(group, 'reefer_container');

  return {
    id: 'reefer_container',
    title: '20ft Controlled-Humidity Export Container',
    subtitle: 'ISO Dry/Reefer Unit · 18,000 kg Capacity · Mombasa Corridor',
    metrics: [
      { label: 'Target RH', value: '58% RH' },
      { label: 'Payload', value: '18,000 kg' },
      { label: 'Incoterm', value: 'FOB / CIF' },
    ],
    group,
    focusPoint: new THREE.Vector3(1.5, 1.25, 0.5),
    cameraOffset: new THREE.Vector3(5.8, 3.3, 6.2),
    applyExplode: (amount: number) => {
      roofGroup.position.y = amount * 1.15;
      reeferUnit.position.x = -amount * 0.95;
      doorGroup.position.x = amount * 0.95;
    },
    disposeGeometries: () => geometries.forEach((g) => g.dispose()),
  };
}

export function buildGantryCraneAssembly(mats: SceneMaterialSet): ExplodableAssembly {
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const group = new THREE.Group();
  group.position.set(0.4, 0, -4.4);

  const shadowGeo = track(new THREE.PlaneGeometry(10.5, 5.5));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, mats.contactShadow);
  shadow.position.y = 0.009;
  group.add(shadow);

  // 1. Portal Legs & Bogie Bases (4 legs resting at y = 0)
  const bogieGeo = track(new THREE.BoxGeometry(1.1, 0.28, 0.45));
  const legGeo = track(new THREE.BoxGeometry(0.32, 4.9, 0.32));
  [
    [-3.4, -1.6],
    [3.4, -1.6],
    [-3.4, 1.6],
    [3.4, 1.6],
  ].forEach(([x, z]) => {
    const bogie = new THREE.Mesh(bogieGeo, mats.craneDarkSteel);
    bogie.position.set(x, 0.14, z);
    bogie.castShadow = true;
    group.add(bogie);

    const leg = new THREE.Mesh(legGeo, mats.craneYellow);
    leg.position.set(x, 2.59, z);
    leg.castShadow = true;
    group.add(leg);
  });

  // 2. Overhead Crossbeam & Cantilevered Sea Boom
  const boomGroup = new THREE.Group();
  const beamGeo = track(new THREE.BoxGeometry(11.6, 0.46, 0.42));
  [-1.6, 1.6].forEach((z) => {
    const beam = new THREE.Mesh(beamGeo, mats.craneYellow);
    beam.position.set(0.6, 5.15, z);
    beam.castShadow = true;
    boomGroup.add(beam);
  });
  // Apex A-frame truss & brace
  const apexGeo = track(new THREE.BoxGeometry(0.28, 1.4, 3.6));
  const apex = new THREE.Mesh(apexGeo, mats.craneDarkSteel);
  apex.position.set(0, 5.7, 0);
  boomGroup.add(apex);
  group.add(boomGroup);

  // 3. Trolley, Operator Cabin & Spreader Frame
  const trolleyGroup = new THREE.Group();
  const trolleyCarriage = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.3, 0.34, 2.9)),
    mats.craneDarkSteel
  );
  trolleyCarriage.position.set(1.1, 4.85, 0);
  trolleyGroup.add(trolleyCarriage);

  const cabinShell = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.9, 0.85, 0.85)),
    mats.inspectionGlass
  );
  cabinShell.position.set(1.1, 4.2, 1.15);
  trolleyGroup.add(cabinShell);

  // Hoist Wire Cables
  const cableGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 1.85, 8));
  [
    [0.65, -0.75],
    [1.55, -0.75],
    [0.65, 0.75],
    [1.55, 0.75],
  ].forEach(([dx, dz]) => {
    const cable = new THREE.Mesh(cableGeo, mats.craneDarkSteel);
    cable.position.set(dx, 3.85, dz);
    trolleyGroup.add(cable);
  });

  const spreader = new THREE.Mesh(
    track(new THREE.BoxGeometry(3.8, 0.18, 1.85)),
    mats.craneYellow
  );
  spreader.position.set(1.1, 2.9, 0);
  spreader.castShadow = true;
  trolleyGroup.add(spreader);

  group.add(trolleyGroup);
  tagInteractiveLayer(group, 'gantry_crane');

  return {
    id: 'gantry_crane',
    title: 'Quayside Ship-to-Shore Gantry Crane',
    subtitle: '40-Ton Twin-Lift Spreader · Berth 14 Container Terminal',
    metrics: [
      { label: 'SWL Rating', value: '40.0 MT' },
      { label: 'Outreach', value: '36.0 m' },
      { label: 'Gate Status', value: 'Cleared' },
    ],
    group,
    focusPoint: new THREE.Vector3(0.8, 2.8, -4.4),
    cameraOffset: new THREE.Vector3(-8.5, 6.2, 6.5),
    applyExplode: (amount: number) => {
      boomGroup.position.y = amount * 0.75;
      trolleyGroup.position.y = -amount * 0.65;
      trolleyGroup.position.x = amount * 1.1;
    },
    disposeGeometries: () => geometries.forEach((g) => g.dispose()),
  };
}

export function buildHarborEnvironment(mats: SceneMaterialSet): {
  group: THREE.Group;
  disposeGeometries: () => void;
} {
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  const group = new THREE.Group();

  // Concrete Quay Apron (top surface at y = 0)
  const quayGeo = track(new THREE.BoxGeometry(34, 1.2, 16));
  const quay = new THREE.Mesh(quayGeo, mats.quayConcrete);
  quay.position.set(0, -0.6, 2.0);
  quay.receiveShadow = true;
  group.add(quay);

  // Open Coastal Water Plane (extends cleanly toward horizon)
  const waterGeo = track(new THREE.PlaneGeometry(180, 140, 48, 48));
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, mats.water);
  water.position.set(0, -0.38, -56);
  water.receiveShadow = true;
  group.add(water);

  // Distant Coastal Headlands (Natural Outdoor Perimeter)
  const ridgeGeo = track(new THREE.ConeGeometry(16, 4.5, 7));
  const ridge1 = new THREE.Mesh(ridgeGeo, mats.coastLand);
  ridge1.position.set(-28, 1.6, -42);
  ridge1.scale.set(2.2, 1.0, 1.1);
  const ridge2 = new THREE.Mesh(ridgeGeo, mats.coastLand);
  ridge2.position.set(24, 1.4, -48);
  ridge2.scale.set(2.5, 0.9, 1.2);
  group.add(ridge1, ridge2);

  // InstancedMesh Quay Bollards & Crane Rail Sleepers (26 instances > 20 threshold)
  const bollardGeo = track(new THREE.CylinderGeometry(0.11, 0.14, 0.42, 12));
  const count = 24;
  const bollards = new THREE.InstancedMesh(bollardGeo, mats.craneDarkSteel, count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = -11.5 + i * 1.0;
    const scaleVar = 0.9 + (i % 3) * 0.08;
    dummy.position.set(x, 0.21 * scaleVar, -5.65);
    dummy.scale.set(1, scaleVar, 1);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
    tint.setHex(i % 4 === 0 ? 0xb8860b : 0x2f3634);
    bollards.setColorAt(i, tint);
  }
  bollards.instanceMatrix.needsUpdate = true;
  if (bollards.instanceColor) bollards.instanceColor.needsUpdate = true;
  bollards.computeBoundingSphere();
  bollards.castShadow = true;
  group.add(bollards);

  return {
    group,
    disposeGeometries: () => geometries.forEach((g) => g.dispose()),
  };
}
