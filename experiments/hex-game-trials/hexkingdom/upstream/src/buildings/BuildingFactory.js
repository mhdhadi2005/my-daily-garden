// ============================================================
// BuildingFactory — procedural low-poly medieval structures.
// Every building returns { group, phases: [Group x4] } where
// phases = [Foundation, Structure, Details, Decoration].
// ConstructionSystem reveals phases over time with animation.
// ============================================================
import * as THREE from 'three';
import { MATS, PALETTE } from '../rendering/Materials.js';
import { part, merge } from '../assets/GeometryUtils.js';
import { MILITARY_MAKERS } from './MilitaryFactory.js';
import { CIVIC_MAKERS } from './CivicFactory.js';

function vc(parts) {
  return new THREE.Mesh(merge(parts), MATS.vcStatic);
}

function phaseGroup() {
  const g = new THREE.Group();
  g.visible = false;
  return g;
}

function wrap(phases) {
  const group = new THREE.Group();
  for (const p of phases) group.add(p);
  return { group, phases };
}

// small waving flag on a pole
function makeFlag(h = 0.55) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 4), MATS.woodBeam);
  pole.position.y = h / 2;
  g.add(pole);
  const cloth = new THREE.PlaneGeometry(0.22, 0.12, 6, 1);
  cloth.translate(0.11, 0, 0);
  const flag = new THREE.Mesh(cloth, MATS.flag);
  flag.position.set(0.012, h - 0.09, 0);
  g.add(flag);
  return g;
}

// glowing lantern on a post
export function makeLantern() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 4), MATS.woodBeam);
  post.position.y = 0.21;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), MATS.woodBeam);
  arm.position.set(0.06, 0.4, 0);
  g.add(arm);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), MATS.lantern);
  lamp.position.set(0.12, 0.33, 0);
  g.add(lamp);
  return g;
}

// short fence run
export function makeFence(length = 0.5) {
  const parts = [];
  const posts = Math.max(2, Math.round(length / 0.22) + 1);
  for (let i = 0; i < posts; i++) {
    const x = (i / (posts - 1) - 0.5) * length;
    parts.push(part(new THREE.BoxGeometry(0.03, 0.16, 0.03), PALETTE.fence, { t: [x, 0.08, 0] }));
  }
  parts.push(part(new THREE.BoxGeometry(length, 0.025, 0.02), PALETTE.fence, { t: [0, 0.12, 0] }));
  parts.push(part(new THREE.BoxGeometry(length, 0.025, 0.02), PALETTE.fence, { t: [0, 0.06, 0] }));
  return vc(parts);
}

// ================= HOUSE =================
export function makeHouse(rng) {
  const w = rng.range(0.34, 0.44);
  const d = rng.range(0.3, 0.4);
  const wallH = rng.range(0.24, 0.3);
  const roofMat = rng.pick([PALETTE.roofRed, PALETTE.roofBlue, PALETTE.roofThatch]);

  const p1 = phaseGroup(); // foundation
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.08), PALETTE.wallStone, { t: [0, 0.03, 0] })]));

  const p2 = phaseGroup(); // walls
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallPlaster, { t: [0, 0.06 + wallH / 2, 0] }),
    // timber frame beams
    part(new THREE.BoxGeometry(w + 0.01, 0.03, d + 0.01), PALETTE.woodBeam, { t: [0, 0.06 + wallH - 0.015, 0] }),
    part(new THREE.BoxGeometry(0.03, wallH, 0.03), PALETTE.woodBeam, { t: [w / 2, 0.06 + wallH / 2, d / 2] }),
    part(new THREE.BoxGeometry(0.03, wallH, 0.03), PALETTE.woodBeam, { t: [-w / 2, 0.06 + wallH / 2, d / 2] }),
  ]));

  const p3 = phaseGroup(); // roof + chimney
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.82, 0.22, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, d / w * 1.05);
  p3.add(vc([
    part(roofGeo, roofMat, { t: [0, 0.06 + wallH + 0.11, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.16, 0.06), PALETTE.wallStone, { t: [w * 0.25, 0.06 + wallH + 0.14, 0] }),
  ]));

  const p4 = phaseGroup(); // props: door, window, lantern
  p4.add(vc([
    part(new THREE.BoxGeometry(0.09, 0.14, 0.02), PALETTE.woodBeam, { t: [0, 0.13, d / 2 + 0.011] }),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.02), PALETTE.lantern, { t: [w * 0.28, 0.06 + wallH * 0.6, d / 2 + 0.011] }),
  ]));
  const lant = makeLantern();
  lant.scale.setScalar(0.8);
  lant.position.set(w / 2 + 0.12, 0, d / 2 - 0.05);
  p4.add(lant);

  return wrap([p1, p2, p3, p4]);
}

// ================= BARN / FARM =================
export function makeBarn(rng) {
  const w = 0.5, d = 0.36, wallH = 0.26;

  const p1 = phaseGroup(); // field patch foundation
  p1.add(vc([
    part(new THREE.BoxGeometry(w + 0.14, 0.04, d + 0.14), PALETTE.dirt, { t: [0, 0.02, 0] }),
  ]));

  const p2 = phaseGroup(); // barn body
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.roofRed, { t: [0, 0.04 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(0.02, wallH, d + 0.01), PALETTE.wallPlaster, { t: [w / 2, 0.04 + wallH / 2, 0] }),
  ]));

  const p3 = phaseGroup(); // roof
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.8, 0.2, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, d / w * 1.1);
  p3.add(vc([
    part(roofGeo, PALETTE.roofThatch, { t: [0, 0.04 + wallH + 0.1, 0] }),
    part(new THREE.BoxGeometry(0.12, 0.16, 0.02), PALETTE.woodBeam, { t: [0, 0.14, d / 2 + 0.012] }),
  ]));

  const p4 = phaseGroup(); // fences + hay
  const f1 = makeFence(0.5); f1.position.set(0, 0, d / 2 + 0.22); p4.add(f1);
  const f2 = makeFence(0.4); f2.rotation.y = Math.PI / 2; f2.position.set(w / 2 + 0.2, 0, 0); p4.add(f2);
  p4.add(vc([
    part(new THREE.SphereGeometry(0.09, 5, 4), PALETTE.roofThatch, { t: [-w / 2 - 0.14, 0.07, 0.1], s: [1, 0.8, 1] }),
    part(new THREE.SphereGeometry(0.07, 5, 4), PALETTE.roofThatch, { t: [-w / 2 - 0.24, 0.055, -0.04], s: [1, 0.8, 1] }),
  ]));

  return wrap([p1, p2, p3, p4]);
}

// ================= WINDMILL =================
export function makeWindmill(rng) {
  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 6), PALETTE.wallStone, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup();
  p2.add(vc([part(new THREE.CylinderGeometry(0.14, 0.2, 0.55, 6), PALETTE.wallPlaster, { t: [0, 0.08 + 0.275, 0] })]));

  const p3 = phaseGroup();
  p3.add(vc([
    part(new THREE.ConeGeometry(0.17, 0.18, 6), PALETTE.roofRed, { t: [0, 0.72, 0] }),
    part(new THREE.BoxGeometry(0.07, 0.1, 0.02), PALETTE.woodBeam, { t: [0, 0.3, 0.19] }),
  ]));

  const p4 = phaseGroup(); // rotating blades (animated by EvolutionSystem)
  const blades = new THREE.Group();
  const bladeParts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const bg = new THREE.BoxGeometry(0.06, 0.42, 0.015);
    bg.translate(0, 0.24, 0);
    bg.rotateZ(a);
    bladeParts.push(part(bg, PALETTE.woodBeam, {}));
    const sail = new THREE.BoxGeometry(0.09, 0.3, 0.008);
    sail.translate(0.0, 0.27, 0.012);
    sail.rotateZ(a);
    bladeParts.push(part(sail, PALETTE.wallPlaster, {}));
  }
  const bladesMesh = vc(bladeParts);
  blades.add(bladesMesh);
  blades.position.set(0, 0.62, 0.17);
  blades.userData.spin = true; // flagged for rotation animation
  p4.add(blades);

  return wrap([p1, p2, p3, p4]);
}

// ================= TOWER =================
export function makeTower(rng) {
  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 6), PALETTE.rockDark, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup();
  p2.add(vc([part(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 6), PALETTE.wallStone, { t: [0, 0.33, 0] })]));

  const p3 = phaseGroup();
  p3.add(vc([
    part(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 6), PALETTE.rockDark, { t: [0, 0.6, 0] }),
    part(new THREE.ConeGeometry(0.16, 0.22, 6), PALETTE.roofBlue, { t: [0, 0.74, 0] }),
  ]));

  const p4 = phaseGroup();
  const fl = makeFlag(0.28);
  fl.position.y = 0.84;
  p4.add(fl);

  return wrap([p1, p2, p3, p4]);
}

// ================= CASTLE =================
export function makeCastle(rng) {
  const p1 = phaseGroup(); // foundation platform
  p1.add(vc([part(new THREE.BoxGeometry(0.72, 0.08, 0.62), PALETTE.rockDark, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup(); // keep walls
  p2.add(vc([
    part(new THREE.BoxGeometry(0.5, 0.36, 0.4), PALETTE.wallStone, { t: [0, 0.08 + 0.18, 0] }),
    part(new THREE.BoxGeometry(0.1, 0.16, 0.03), PALETTE.woodBeam, { t: [0, 0.16, 0.215] }),
  ]));

  const p3 = phaseGroup(); // corner towers
  const towerParts = [];
  const corners = [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]];
  for (const [x, z] of corners) {
    towerParts.push(part(new THREE.CylinderGeometry(0.09, 0.11, 0.5, 6), PALETTE.wallStone, { t: [x, 0.33, z] }));
    towerParts.push(part(new THREE.ConeGeometry(0.12, 0.16, 6), PALETTE.roofBlue, { t: [x, 0.66, z] }));
  }
  // keep roof
  towerParts.push(part(new THREE.BoxGeometry(0.54, 0.05, 0.44), PALETTE.rockDark, { t: [0, 0.47, 0] }));
  p3.add(vc(towerParts));

  const p4 = phaseGroup(); // flags + lanterns
  const flag1 = makeFlag(0.3); flag1.position.set(0.3, 0.72, -0.25); p4.add(flag1);
  const flag2 = makeFlag(0.3); flag2.position.set(-0.3, 0.72, 0.25); p4.add(flag2);
  const lan = makeLantern(); lan.scale.setScalar(0.9); lan.position.set(0.14, 0.08, 0.32); p4.add(lan);

  return wrap([p1, p2, p3, p4]);
}

// ================= BRIDGE =================
export function makeBridge(rng) {
  const p1 = phaseGroup(); // stone supports
  p1.add(vc([
    part(new THREE.BoxGeometry(0.1, 0.1, 0.4), PALETTE.rockDark, { t: [-0.22, 0.02, 0] }),
    part(new THREE.BoxGeometry(0.1, 0.1, 0.4), PALETTE.rockDark, { t: [0.22, 0.02, 0] }),
  ]));

  const p2 = phaseGroup(); // deck (slight arch of 3 boxes)
  p2.add(vc([
    part(new THREE.BoxGeometry(0.22, 0.035, 0.34), PALETTE.woodBeam, { t: [-0.2, 0.075, 0] }),
    part(new THREE.BoxGeometry(0.24, 0.035, 0.34), PALETTE.woodBeam, { t: [0, 0.1, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.035, 0.34), PALETTE.woodBeam, { t: [0.2, 0.075, 0] }),
  ]));

  const p3 = phaseGroup(); // railings
  p3.add(vc([
    part(new THREE.BoxGeometry(0.6, 0.025, 0.02), PALETTE.fence, { t: [0, 0.2, 0.16] }),
    part(new THREE.BoxGeometry(0.6, 0.025, 0.02), PALETTE.fence, { t: [0, 0.2, -0.16] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.02), PALETTE.fence, { t: [-0.26, 0.14, 0.16] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.02), PALETTE.fence, { t: [0.26, 0.14, 0.16] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.02), PALETTE.fence, { t: [-0.26, 0.14, -0.16] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.02), PALETTE.fence, { t: [0.26, 0.14, -0.16] }),
  ]));

  const p4 = phaseGroup(); // lantern
  const lan = makeLantern();
  lan.scale.setScalar(0.7);
  lan.position.set(-0.26, 0.1, 0.2);
  p4.add(lan);

  return wrap([p1, p2, p3, p4]);
}

// ============================================================
// WORLD CONTENT EXPANSION — building variants (extension only).
// Original makers above are kept intact as variant "A".
// Registry keys now dispatch to a seeded-random variant so
// EvolutionSystem + SaveSystem replay identical choices.
// ============================================================

/** chimney smoke placeholder: 3 fading puffs above a stack position */
export function makeChimneySmoke(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = 0.028 + i * 0.014;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), MATS.smoke);
    puff.position.set(x + i * 0.02, y + i * 0.07, z + (i % 2) * 0.015);
    g.add(puff);
  }
  return g;
}

/** wall-mounted / standalone torch with flickering flame */
export function makeTorch(h = 0.3) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 4), MATS.woodBeam);
  pole.position.y = h / 2;
  g.add(pole);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), MATS.torchFlame);
  flame.position.y = h + 0.03;
  g.add(flame);
  return g;
}

/** glowing window pane (lit at night via emissive material) */
function windowPane(w = 0.07, h = 0.07) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), MATS.windowGlow);
}

// ================= HOUSE B: stone cottage, slate roof =================
export function makeHouseB(rng) {
  const w = rng.range(0.36, 0.44);
  const d = rng.range(0.3, 0.38);
  const wallH = rng.range(0.22, 0.27);

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.08), PALETTE.rockDark, { t: [0, 0.03, 0] })]));

  const p2 = phaseGroup();
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallStoneB, { t: [0, 0.06 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), PALETTE.rockDark, { t: [0, 0.08, 0] }),
  ]));

  const p3 = phaseGroup();
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.85, 0.24, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, d / w * 1.05);
  p3.add(vc([
    part(roofGeo, PALETTE.roofSlate, { t: [0, 0.06 + wallH + 0.12, 0] }),
    part(new THREE.BoxGeometry(0.07, 0.2, 0.07), PALETTE.wallStoneB, { t: [-w * 0.28, 0.06 + wallH + 0.15, 0] }),
  ]));

  const p4 = phaseGroup();
  p4.add(vc([
    part(new THREE.BoxGeometry(0.1, 0.15, 0.02), PALETTE.woodBeam, { t: [0, 0.135, d / 2 + 0.011] }),
  ]));
  const win = windowPane();
  win.position.set(w * 0.28, 0.06 + wallH * 0.6, d / 2 + 0.011);
  p4.add(win);
  const smoke = makeChimneySmoke(-w * 0.28, 0.06 + wallH + 0.28, 0);
  p4.add(smoke);
  return wrap([p1, p2, p3, p4]);
}

// ================= HOUSE C: tall two-story timber house =================
export function makeHouseC(rng) {
  const w = rng.range(0.32, 0.38);
  const d = rng.range(0.28, 0.34);
  const floorH = 0.2;

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.06, 0.06, d + 0.06), PALETTE.wallStone, { t: [0, 0.03, 0] })]));

  const p2 = phaseGroup(); // ground floor stone + overhanging timber upper floor
  p2.add(vc([
    part(new THREE.BoxGeometry(w, floorH, d), PALETTE.wallStoneB, { t: [0, 0.06 + floorH / 2, 0] }),
    part(new THREE.BoxGeometry(w + 0.06, floorH, d + 0.06), PALETTE.wallPlaster, { t: [0, 0.06 + floorH * 1.5, 0] }),
    part(new THREE.BoxGeometry(w + 0.08, 0.03, d + 0.08), PALETTE.woodBeam, { t: [0, 0.06 + floorH, 0] }),
    part(new THREE.BoxGeometry(0.03, floorH, 0.03), PALETTE.woodBeam, { t: [(w + 0.06) / 2, 0.06 + floorH * 1.5, (d + 0.06) / 2] }),
    part(new THREE.BoxGeometry(0.03, floorH, 0.03), PALETTE.woodBeam, { t: [-(w + 0.06) / 2, 0.06 + floorH * 1.5, (d + 0.06) / 2] }),
  ]));

  const p3 = phaseGroup();
  const roofGeo = new THREE.CylinderGeometry(0.01, (w + 0.06) * 0.85, 0.22, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, d / w * 1.05);
  p3.add(vc([
    part(roofGeo, rng.chance(0.5) ? PALETTE.roofRed : PALETTE.roofGreen, { t: [0, 0.06 + floorH * 2 + 0.11, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.15, 0.06), PALETTE.wallStone, { t: [w * 0.22, 0.06 + floorH * 2 + 0.13, 0] }),
  ]));

  const p4 = phaseGroup();
  p4.add(vc([
    part(new THREE.BoxGeometry(0.09, 0.14, 0.02), PALETTE.woodBeam, { t: [0, 0.13, d / 2 + 0.011] }),
  ]));
  const win1 = windowPane(0.06, 0.07);
  win1.position.set(-w * 0.22, 0.06 + floorH * 1.5, (d + 0.06) / 2 + 0.011);
  p4.add(win1);
  const win2 = windowPane(0.06, 0.07);
  win2.position.set(w * 0.22, 0.06 + floorH * 1.5, (d + 0.06) / 2 + 0.011);
  p4.add(win2);
  p4.add(makeChimneySmoke(w * 0.22, 0.06 + floorH * 2 + 0.24, 0));
  return wrap([p1, p2, p3, p4]);
}

// ================= HOUSE D: long house with side annex =================
export function makeHouseD(rng) {
  const w = rng.range(0.46, 0.54);
  const d = rng.range(0.24, 0.3);
  const wallH = rng.range(0.22, 0.26);

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.2), PALETTE.wallStone, { t: [0, 0.03, 0.04] })]));

  const p2 = phaseGroup();
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallPlaster, { t: [0, 0.06 + wallH / 2, 0] }),
    // annex
    part(new THREE.BoxGeometry(0.2, wallH * 0.7, 0.16), PALETTE.wallPlaster, { t: [w * 0.24, 0.06 + wallH * 0.35, d / 2 + 0.08] }),
    part(new THREE.BoxGeometry(w + 0.01, 0.03, d + 0.01), PALETTE.woodBeam, { t: [0, 0.06 + wallH - 0.015, 0] }),
  ]));

  const p3 = phaseGroup();
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.78, 0.2, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, d / w * 1.15);
  const annexRoof = new THREE.CylinderGeometry(0.01, 0.17, 0.1, 4, 1);
  annexRoof.rotateY(Math.PI / 4);
  p3.add(vc([
    part(roofGeo, PALETTE.roofGreen, { t: [0, 0.06 + wallH + 0.1, 0] }),
    part(annexRoof, PALETTE.roofThatch, { t: [w * 0.24, 0.06 + wallH * 0.7 + 0.05, d / 2 + 0.08] }),
    part(new THREE.BoxGeometry(0.06, 0.16, 0.06), PALETTE.wallStone, { t: [-w * 0.3, 0.06 + wallH + 0.12, 0] }),
  ]));

  const p4 = phaseGroup();
  p4.add(vc([
    part(new THREE.BoxGeometry(0.09, 0.14, 0.02), PALETTE.woodBeam, { t: [-0.08, 0.13, d / 2 + 0.011] }),
  ]));
  const win = windowPane();
  win.position.set(-w * 0.3, 0.06 + wallH * 0.6, d / 2 + 0.011);
  p4.add(win);
  const lant = makeLantern();
  lant.scale.setScalar(0.75);
  lant.position.set(-w / 2 - 0.1, 0, d / 2 - 0.02);
  p4.add(lant);
  p4.add(makeChimneySmoke(-w * 0.3, 0.06 + wallH + 0.24, 0));
  return wrap([p1, p2, p3, p4]);
}

// ================= HOUSE E: round hut with conical thatch =================
export function makeHouseE(rng) {
  const r = rng.range(0.17, 0.21);
  const wallH = rng.range(0.2, 0.24);

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.CylinderGeometry(r + 0.05, r + 0.07, 0.05, 7), PALETTE.wallStone, { t: [0, 0.025, 0] })]));

  const p2 = phaseGroup();
  p2.add(vc([
    part(new THREE.CylinderGeometry(r, r + 0.015, wallH, 7), PALETTE.wallPlaster, { t: [0, 0.05 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(0.026, wallH, 0.026), PALETTE.woodBeam, { t: [r * 0.9, 0.05 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(0.026, wallH, 0.026), PALETTE.woodBeam, { t: [-r * 0.9, 0.05 + wallH / 2, 0] }),
  ]));

  const p3 = phaseGroup();
  p3.add(vc([
    part(new THREE.ConeGeometry(r + 0.07, 0.22, 7), PALETTE.roofThatch, { t: [0, 0.05 + wallH + 0.11, 0] }),
    part(new THREE.ConeGeometry(0.035, 0.06, 5), PALETTE.woodBeam, { t: [0, 0.05 + wallH + 0.24, 0] }),
  ]));

  const p4 = phaseGroup();
  p4.add(vc([
    part(new THREE.BoxGeometry(0.08, 0.13, 0.02), PALETTE.woodBeam, { t: [0, 0.115, r + 0.005] }),
  ]));
  const win = windowPane(0.05, 0.05);
  win.position.set(r * 0.75, 0.05 + wallH * 0.62, r * 0.62);
  win.rotation.y = 0.7;
  p4.add(win);
  return wrap([p1, p2, p3, p4]);
}

// ================= BARN B: long barn with silo =================
export function makeBarnB(rng) {
  const w = 0.54, d = 0.3, wallH = 0.24;

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.16, 0.04, d + 0.16), PALETTE.dirt, { t: [0, 0.02, 0] })]));

  const p2 = phaseGroup(); // barn body — weathered wood walls
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.woodBeam, { t: [0, 0.04 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(0.02, wallH, d + 0.01), PALETTE.fence, { t: [-w / 2, 0.04 + wallH / 2, 0] }),
    // silo
    part(new THREE.CylinderGeometry(0.1, 0.11, 0.42, 7), PALETTE.wallStoneB, { t: [w / 2 + 0.15, 0.04 + 0.21, -0.02] }),
  ]));

  const p3 = phaseGroup();
  const roofGeo = new THREE.CylinderGeometry(0.01, w * 0.76, 0.18, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, d / w * 1.18);
  p3.add(vc([
    part(roofGeo, PALETTE.roofRed, { t: [0, 0.04 + wallH + 0.09, 0] }),
    part(new THREE.ConeGeometry(0.12, 0.1, 7), PALETTE.roofSlate, { t: [w / 2 + 0.15, 0.04 + 0.47, -0.02] }),
    part(new THREE.BoxGeometry(0.14, 0.17, 0.02), PALETTE.trunk, { t: [0, 0.13, d / 2 + 0.012] }),
  ]));

  const p4 = phaseGroup(); // hay + cart wheel prop
  const f1 = makeFence(0.55); f1.position.set(-0.08, 0, d / 2 + 0.24); p4.add(f1);
  p4.add(vc([
    part(new THREE.SphereGeometry(0.085, 5, 4), PALETTE.hay, { t: [-w / 2 - 0.16, 0.065, 0.06], s: [1, 0.75, 1] }),
    part(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), PALETTE.wagonWheel, {
      t: [w / 2 + 0.02, 0.07, d / 2 + 0.06], s: [1, 1, 1],
    }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= TOWER: square stone =================
export function makeTowerSquare(rng) {
  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(0.34, 0.08, 0.34), PALETTE.rockDark, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup();
  p2.add(vc([
    part(new THREE.BoxGeometry(0.26, 0.52, 0.26), PALETTE.wallStoneB, { t: [0, 0.34, 0] }),
    part(new THREE.BoxGeometry(0.28, 0.04, 0.28), PALETTE.rockDark, { t: [0, 0.34, 0] }),
  ]));

  const p3 = phaseGroup(); // crenellated top
  const topParts = [part(new THREE.BoxGeometry(0.32, 0.06, 0.32), PALETTE.rockDark, { t: [0, 0.63, 0] })];
  for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
    topParts.push(part(new THREE.BoxGeometry(0.06, 0.08, 0.06), PALETTE.wallStoneB, { t: [x, 0.7, z] }));
  }
  topParts.push(part(new THREE.BoxGeometry(0.05, 0.09, 0.03), PALETTE.charcoal, { t: [0, 0.5, 0.135] }));
  p3.add(vc(topParts));

  const p4 = phaseGroup();
  const fl = makeFlag(0.26);
  fl.position.y = 0.66;
  p4.add(fl);
  const torch = makeTorch(0.2);
  torch.position.set(0.16, 0.1, 0.16);
  p4.add(torch);
  return wrap([p1, p2, p3, p4]);
}

// ================= TOWER: wooden watch tower =================
export function makeTowerWatch(rng) {
  const p1 = phaseGroup(); // 4 leg footings
  const foot = [];
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
    foot.push(part(new THREE.BoxGeometry(0.08, 0.06, 0.08), PALETTE.rockDark, { t: [x, 0.03, z] }));
  }
  p1.add(vc(foot));

  const p2 = phaseGroup(); // slanted legs + cross braces
  const legs = [];
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) {
    const leg = new THREE.CylinderGeometry(0.02, 0.028, 0.52, 4);
    leg.rotateX(z > 0 ? -0.12 : 0.12);
    leg.rotateZ(x > 0 ? 0.12 : -0.12);
    legs.push(part(leg, PALETTE.woodBeam, { t: [x * 0.85, 0.28, z * 0.85] }));
  }
  legs.push(part(new THREE.BoxGeometry(0.3, 0.025, 0.025), PALETTE.fence, { t: [0, 0.22, 0.12] }));
  legs.push(part(new THREE.BoxGeometry(0.025, 0.025, 0.3), PALETTE.fence, { t: [0.12, 0.3, 0] }));
  p2.add(vc(legs));

  const p3 = phaseGroup(); // platform + railing + roof
  const plat = [
    part(new THREE.BoxGeometry(0.3, 0.035, 0.3), PALETTE.trunk, { t: [0, 0.54, 0] }),
    part(new THREE.BoxGeometry(0.3, 0.02, 0.02), PALETTE.fence, { t: [0, 0.65, 0.14] }),
    part(new THREE.BoxGeometry(0.3, 0.02, 0.02), PALETTE.fence, { t: [0, 0.65, -0.14] }),
    part(new THREE.BoxGeometry(0.02, 0.02, 0.3), PALETTE.fence, { t: [0.14, 0.65, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.02, 0.3), PALETTE.fence, { t: [-0.14, 0.65, 0] }),
  ];
  for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
    plat.push(part(new THREE.BoxGeometry(0.02, 0.24, 0.02), PALETTE.woodBeam, { t: [x, 0.68, z] }));
  }
  plat.push(part(new THREE.ConeGeometry(0.24, 0.14, 4), PALETTE.roofThatch, { t: [0, 0.86, 0], ry: Math.PI / 4 }));
  p3.add(vc(plat));

  const p4 = phaseGroup(); // brazier glow on platform
  const brazier = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), MATS.lantern);
  brazier.position.set(0, 0.6, 0);
  p4.add(brazier);
  return wrap([p1, p2, p3, p4]);
}

// ================= CASTLE B: square keep, slate roofs =================
export function makeCastleB(rng) {
  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(0.76, 0.08, 0.66), PALETTE.rockDark, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup(); // tall central keep + gatehouse
  p2.add(vc([
    part(new THREE.BoxGeometry(0.36, 0.5, 0.32), PALETTE.wallStoneB, { t: [0, 0.08 + 0.25, -0.05] }),
    part(new THREE.BoxGeometry(0.22, 0.26, 0.14), PALETTE.wallStone, { t: [0, 0.08 + 0.13, 0.24] }),
    part(new THREE.BoxGeometry(0.09, 0.15, 0.03), PALETTE.charcoal, { t: [0, 0.155, 0.315] }),
  ]));

  const p3 = phaseGroup(); // square corner towers + roofs
  const towerParts = [];
  const corners = [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]];
  for (const [x, z] of corners) {
    towerParts.push(part(new THREE.BoxGeometry(0.14, 0.44, 0.14), PALETTE.wallStoneB, { t: [x, 0.3, z] }));
    towerParts.push(part(new THREE.ConeGeometry(0.11, 0.16, 4), PALETTE.roofSlate, { t: [x, 0.6, z], ry: Math.PI / 4 }));
  }
  // keep roof
  towerParts.push(part(new THREE.ConeGeometry(0.26, 0.2, 4), PALETTE.roofSlate, { t: [0, 0.68, -0.05], ry: Math.PI / 4 }));
  towerParts.push(part(new THREE.ConeGeometry(0.14, 0.1, 4), PALETTE.roofSlate, { t: [0, 0.39, 0.24], ry: Math.PI / 4 }));
  p3.add(vc(towerParts));

  const p4 = phaseGroup(); // banners + torches + keep window glow
  const flag1 = makeFlag(0.3); flag1.position.set(0, 0.78, -0.05); p4.add(flag1);
  const flag2 = makeFlag(0.24); flag2.position.set(0.3, 0.66, 0.24); p4.add(flag2);
  for (const x of [-0.13, 0.13]) {
    const torch = makeTorch(0.2);
    torch.position.set(x, 0.08, 0.32);
    p4.add(torch);
  }
  const win = windowPane(0.05, 0.08);
  win.position.set(0, 0.44, 0.115);
  p4.add(win);
  return wrap([p1, p2, p3, p4]);
}

// ================= BRIDGE: stone arch =================
export function makeBridgeStone(rng) {
  const p1 = phaseGroup(); // heavy piers
  p1.add(vc([
    part(new THREE.BoxGeometry(0.14, 0.12, 0.42), PALETTE.rockDark, { t: [-0.24, 0.02, 0] }),
    part(new THREE.BoxGeometry(0.14, 0.12, 0.42), PALETTE.rockDark, { t: [0.24, 0.02, 0] }),
  ]));

  const p2 = phaseGroup(); // arched stone deck
  p2.add(vc([
    part(new THREE.BoxGeometry(0.24, 0.05, 0.36), PALETTE.wallStoneB, { t: [-0.2, 0.08, 0] }),
    part(new THREE.BoxGeometry(0.26, 0.05, 0.36), PALETTE.wallStoneB, { t: [0, 0.115, 0] }),
    part(new THREE.BoxGeometry(0.24, 0.05, 0.36), PALETTE.wallStoneB, { t: [0.2, 0.08, 0] }),
    // arch underside hint
    part(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 6, 1), PALETTE.rockDark, {
      t: [0, 0.03, 0], s: [1.4, 0.6, 1],
    }),
  ]));

  const p3 = phaseGroup(); // low stone parapets
  p3.add(vc([
    part(new THREE.BoxGeometry(0.62, 0.06, 0.04), PALETTE.wallStone, { t: [0, 0.16, 0.17] }),
    part(new THREE.BoxGeometry(0.62, 0.06, 0.04), PALETTE.wallStone, { t: [0, 0.16, -0.17] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.06), PALETTE.rockDark, { t: [-0.28, 0.14, 0.17] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.06), PALETTE.rockDark, { t: [0.28, 0.14, 0.17] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.06), PALETTE.rockDark, { t: [-0.28, 0.14, -0.17] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.06), PALETTE.rockDark, { t: [0.28, 0.14, -0.17] }),
  ]));

  const p4 = phaseGroup(); // twin lanterns
  for (const x of [-0.28, 0.28]) {
    const lan = makeLantern();
    lan.scale.setScalar(0.65);
    lan.position.set(x, 0.16, -0.2);
    p4.add(lan);
  }
  return wrap([p1, p2, p3, p4]);
}

// -------- deterministic variant dispatchers --------
// Consume exactly one rng draw to select a variant, so replays
// (save restore / fast-forward) reproduce the same building.

const HOUSE_VARIANTS = [makeHouse, makeHouseB, makeHouseC, makeHouseD, makeHouseE];
export function makeHouseVariant(rng) {
  return rng.pick(HOUSE_VARIANTS)(rng);
}

const BARN_VARIANTS = [makeBarn, makeBarnB];
export function makeBarnVariant(rng) {
  return rng.pick(BARN_VARIANTS)(rng);
}

const TOWER_VARIANTS = [makeTower, makeTowerSquare, makeTowerWatch];
export function makeTowerVariant(rng) {
  return rng.pick(TOWER_VARIANTS)(rng);
}

const CASTLE_VARIANTS = [makeCastle, makeCastleB];
export function makeCastleVariant(rng) {
  return rng.pick(CASTLE_VARIANTS)(rng);
}

const BRIDGE_VARIANTS = [makeBridge, makeBridgeStone];
export function makeBridgeVariant(rng) {
  return rng.pick(BRIDGE_VARIANTS)(rng);
}

// ================= WALL SEGMENTS =================
// One segment spans a single hex edge (length ≈ HEX_SIZE).
// Four visual stages managed by WallSystem:
//   0 markers → 1 wooden palisade → 2 stone wall → 3 decorated wall

/** stage 0: survey markers (small stakes) */
export function makeWallMarkers(rng) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const x = (i / 2 - 0.5) * 0.8;
    parts.push(part(new THREE.CylinderGeometry(0.015, 0.02, 0.14, 4), PALETTE.woodBeam, {
      t: [x, 0.07, rng ? rng.range(-0.02, 0.02) : 0],
    }));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.03, 0.008), PALETTE.flag, { t: [x, 0.13, 0] }));
  }
  return vc(parts);
}

/** stage 1: wooden palisade (sharpened logs + crossbeam) */
export function makeWallPalisade(rng) {
  const parts = [];
  const posts = 7;
  for (let i = 0; i < posts; i++) {
    const x = (i / (posts - 1) - 0.5) * 0.94;
    const h = rng ? rng.range(0.26, 0.32) : 0.3;
    parts.push(part(new THREE.CylinderGeometry(0.032, 0.04, h, 5), PALETTE.woodBeam, { t: [x, h / 2, 0] }));
    parts.push(part(new THREE.ConeGeometry(0.032, 0.06, 5), PALETTE.fence, { t: [x, h + 0.03, 0] }));
  }
  parts.push(part(new THREE.BoxGeometry(0.96, 0.03, 0.03), PALETTE.fence, { t: [0, 0.18, 0.035] }));
  return vc(parts);
}

/** stage 2: stone wall (base + body + crenellations) */
export function makeWallStone(rng) {
  const parts = [
    part(new THREE.BoxGeometry(1.0, 0.08, 0.16), PALETTE.rockDark, { t: [0, 0.04, 0] }),
    part(new THREE.BoxGeometry(0.98, 0.3, 0.12), PALETTE.wallStone, { t: [0, 0.23, 0] }),
    part(new THREE.BoxGeometry(1.0, 0.045, 0.15), PALETTE.rockDark, { t: [0, 0.4, 0] }),
  ];
  // crenellations
  for (let i = 0; i < 5; i++) {
    const x = (i / 4 - 0.5) * 0.86;
    parts.push(part(new THREE.BoxGeometry(0.09, 0.07, 0.13), PALETTE.wallStone, { t: [x, 0.455, 0] }));
  }
  return vc(parts);
}

/** stage 3 add-ons: torches + banner (decorated wall = stone + this) */
export function makeWallDecor(rng) {
  const g = new THREE.Group();
  // torch bowls (glow with lantern material)
  for (const x of [-0.32, 0.32]) {
    const torch = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.14, 4), MATS.woodBeam);
    pole.position.y = 0.47;
    torch.add(pole);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), MATS.lantern);
    bowl.position.y = 0.56;
    torch.add(bowl);
    torch.position.x = x;
    g.add(torch);
  }
  const fl = makeFlag(0.24);
  fl.position.set(0, 0.42, 0);
  fl.scale.setScalar(0.9);
  g.add(fl);
  return g;
}

// ============================================================
// PLAYER BUILDINGS — manual gameplay layer structures
// (Farm reuses barn variants; the rest get dedicated makers.)
// ============================================================

// ================= LUMBER MILL =================
export function makeLumberMill(rng) {
  const p1 = phaseGroup(); // log deck foundation
  p1.add(vc([
    part(new THREE.BoxGeometry(0.5, 0.05, 0.4), PALETTE.dirt, { t: [0, 0.025, 0] }),
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 5), PALETTE.trunk, { t: [-0.3, 0.05, 0], rz: Math.PI / 2 }),
  ]));

  const p2 = phaseGroup(); // open timber shed
  p2.add(vc([
    part(new THREE.BoxGeometry(0.36, 0.22, 0.28), PALETTE.woodBeam, { t: [0, 0.05 + 0.11, 0] }),
    part(new THREE.BoxGeometry(0.03, 0.24, 0.03), PALETTE.trunk, { t: [0.2, 0.17, 0.16] }),
    part(new THREE.BoxGeometry(0.03, 0.24, 0.03), PALETTE.trunk, { t: [-0.2, 0.17, 0.16] }),
  ]));

  const p3 = phaseGroup(); // slanted roof + saw blade
  const roof = new THREE.BoxGeometry(0.48, 0.03, 0.4);
  roof.rotateZ(0.12);
  p3.add(vc([
    part(roof, PALETTE.roofThatch, { t: [0, 0.32, 0] }),
    part(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), PALETTE.rock, { t: [0.16, 0.16, 0.155], rx: Math.PI / 2 }),
  ]));

  const p4 = phaseGroup(); // log pile
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), PALETTE.trunk, { t: [-0.26, 0.04, 0.18], rz: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), PALETTE.trunk, { t: [-0.26, 0.04, 0.26], rz: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 5), PALETTE.trunk, { t: [-0.26, 0.11, 0.22], rz: Math.PI / 2 }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= MINE =================
export function makeMine(rng) {
  const p1 = phaseGroup(); // cleared rocky pad
  p1.add(vc([
    part(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 7), PALETTE.rockDark, { t: [0, 0.025, 0] }),
  ]));

  const p2 = phaseGroup(); // mine entrance (timber-framed adit)
  p2.add(vc([
    part(new THREE.BoxGeometry(0.05, 0.24, 0.05), PALETTE.woodBeam, { t: [-0.12, 0.12, 0.14] }),
    part(new THREE.BoxGeometry(0.05, 0.24, 0.05), PALETTE.woodBeam, { t: [0.12, 0.12, 0.14] }),
    part(new THREE.BoxGeometry(0.32, 0.06, 0.06), PALETTE.woodBeam, { t: [0, 0.25, 0.14] }),
    part(new THREE.BoxGeometry(0.2, 0.2, 0.04), PALETTE.charcoal, { t: [0, 0.11, 0.12] }),
    part(new THREE.ConeGeometry(0.26, 0.3, 6), PALETTE.rock, { t: [0, 0.2, -0.04] }),
  ]));

  const p3 = phaseGroup(); // cart rails + ore cart
  p3.add(vc([
    part(new THREE.BoxGeometry(0.02, 0.015, 0.34), PALETTE.woodBeam, { t: [-0.05, 0.055, 0.3] }),
    part(new THREE.BoxGeometry(0.02, 0.015, 0.34), PALETTE.woodBeam, { t: [0.05, 0.055, 0.3] }),
    part(new THREE.BoxGeometry(0.14, 0.09, 0.16), PALETTE.woodBeam, { t: [0, 0.12, 0.34] }),
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), PALETTE.wagonWheel, { t: [-0.07, 0.06, 0.3], rz: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), PALETTE.wagonWheel, { t: [0.07, 0.06, 0.3], rz: Math.PI / 2 }),
  ]));

  const p4 = phaseGroup(); // lantern at the entrance
  const lan = makeLantern();
  lan.scale.setScalar(0.7);
  lan.position.set(0.2, 0.05, 0.2);
  p4.add(lan);
  return wrap([p1, p2, p3, p4]);
}

// ================= MARKET =================
export function makeMarket(rng) {
  const p1 = phaseGroup(); // cobble plaza
  p1.add(vc([
    part(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 8), PALETTE.road, { t: [0, 0.015, 0] }),
  ]));

  const p2 = phaseGroup(); // twin stall counters
  p2.add(vc([
    part(new THREE.BoxGeometry(0.26, 0.12, 0.12), PALETTE.woodBeam, { t: [-0.1, 0.09, 0.08] }),
    part(new THREE.BoxGeometry(0.26, 0.12, 0.12), PALETTE.woodBeam, { t: [0.12, 0.09, -0.12], ry: 0.6 }),
  ]));

  const p3 = phaseGroup(); // striped awnings on poles
  const awn1 = new THREE.BoxGeometry(0.3, 0.02, 0.18);
  awn1.rotateX(0.18);
  const awn2 = new THREE.BoxGeometry(0.3, 0.02, 0.18);
  awn2.rotateX(0.18);
  p3.add(vc([
    part(new THREE.BoxGeometry(0.025, 0.26, 0.025), PALETTE.woodBeam, { t: [-0.22, 0.13, 0.08] }),
    part(new THREE.BoxGeometry(0.025, 0.26, 0.025), PALETTE.woodBeam, { t: [0.02, 0.13, 0.08] }),
    part(awn1, PALETTE.flag, { t: [-0.1, 0.27, 0.1] }),
    part(awn2, PALETTE.roofBlue, { t: [0.12, 0.27, -0.1], ry: 0.6 }),
  ]));

  const p4 = phaseGroup(); // crates + barrel of goods
  p4.add(vc([
    part(new THREE.BoxGeometry(0.09, 0.09, 0.09), PALETTE.woodBeam, { t: [-0.02, 0.045, 0.24] }),
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 7), PALETTE.trunk, { t: [0.24, 0.05, 0.12] }),
    part(new THREE.SphereGeometry(0.035, 5, 4), PALETTE.appleRed || PALETTE.roofRed, { t: [-0.1, 0.17, 0.08] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= STORAGE (granary/warehouse) =================
export function makeStorage(rng) {
  const p1 = phaseGroup(); // raised stone footing (keeps rats out)
  p1.add(vc([
    part(new THREE.BoxGeometry(0.42, 0.08, 0.34), PALETTE.wallStone, { t: [0, 0.04, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.06), PALETTE.rockDark, { t: [-0.16, 0.05, -0.12] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.06), PALETTE.rockDark, { t: [0.16, 0.05, 0.12] }),
  ]));

  const p2 = phaseGroup(); // plank body
  p2.add(vc([
    part(new THREE.BoxGeometry(0.36, 0.26, 0.28), PALETTE.woodBeam, { t: [0, 0.08 + 0.13, 0] }),
    part(new THREE.BoxGeometry(0.37, 0.03, 0.29), PALETTE.trunk, { t: [0, 0.14, 0] }),
    part(new THREE.BoxGeometry(0.37, 0.03, 0.29), PALETTE.trunk, { t: [0, 0.26, 0] }),
  ]));

  const p3 = phaseGroup(); // gabled roof + loading door
  const roofGeo = new THREE.CylinderGeometry(0.01, 0.3, 0.18, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, 0.85);
  p3.add(vc([
    part(roofGeo, PALETTE.roofSlate || PALETTE.roofBlue, { t: [0, 0.08 + 0.26 + 0.09, 0] }),
    part(new THREE.BoxGeometry(0.12, 0.15, 0.02), PALETTE.trunk, { t: [0, 0.2, 0.15] }),
  ]));

  const p4 = phaseGroup(); // sacks + barrels beside the door
  p4.add(vc([
    part(new THREE.SphereGeometry(0.05, 5, 4), PALETTE.hay, { t: [0.24, 0.045, 0.14], s: [1, 0.85, 1] }),
    part(new THREE.SphereGeometry(0.045, 5, 4), PALETTE.hay, { t: [0.3, 0.04, 0.05], s: [1, 0.85, 1] }),
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 7), PALETTE.trunk, { t: [-0.26, 0.05, 0.1] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

/** registry of wall stage builders used by WallSystem */
export const WALL_STAGE_MAKERS = [
  makeWallMarkers,
  makeWallPalisade,
  makeWallStone,
  makeWallStone, // stage 3 base is stone; decor is added on top
];

/** registry used by ConstructionSystem / save restore.
 *  Generic keys now dispatch to seeded-random variants (world content
 *  expansion); explicit keys remain available for direct requests. */
export const BUILDING_MAKERS = {
  house: makeHouseVariant,
  barn: makeBarnVariant,
  windmill: makeWindmill,
  tower: makeTowerVariant,
  castle: makeCastleVariant,
  bridge: makeBridgeVariant,
  // explicit variants
  houseA: makeHouse,
  houseB: makeHouseB,
  houseC: makeHouseC,
  houseD: makeHouseD,
  houseE: makeHouseE,
  barnA: makeBarn,
  barnB: makeBarnB,
  towerRound: makeTower,
  towerSquare: makeTowerSquare,
  towerWatch: makeTowerWatch,
  castleA: makeCastle,
  castleB: makeCastleB,
  bridgeWood: makeBridge,
  bridgeStone: makeBridgeStone,
  // player-built structures (BuildingSystem)
  lumberMill: makeLumberMill,
  mine: makeMine,
  market: makeMarket,
  storage: makeStorage,
  // military & trade expansion (MilitaryFactory)
  ...MILITARY_MAKERS,
  // economy & city expansion (CivicFactory)
  ...CIVIC_MAKERS,
};
