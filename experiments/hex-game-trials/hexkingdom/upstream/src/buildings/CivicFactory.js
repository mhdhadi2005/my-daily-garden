// ============================================================
// CivicFactory — economy & city buildings (expansion Priority 2):
// apiary, fishing pier, bakery, sawmill, forge, stable, barracks,
// temple, port, university, observatory, library.
// Same contract as BuildingFactory: every maker returns
// { group, phases: [Foundation, Structure, Details, Decoration] }
// built from merged vertex-colored parts (one draw call each).
// ============================================================
import * as THREE from 'three';
import { MATS, PALETTE } from '../rendering/Materials.js';
import { part, merge } from '../assets/GeometryUtils.js';

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

/** glowing window pane (lit at night via emissive material) */
function windowPane(w = 0.07, h = 0.07) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), MATS.windowGlow);
}

/** chimney smoke: 3 fading puffs above a stack position */
function smokePuffs(x, y, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = 0.028 + i * 0.014;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), MATS.smoke);
    puff.position.set(x + i * 0.02, y + i * 0.07, z + (i % 2) * 0.015);
    g.add(puff);
  }
  return g;
}

/** small lantern mesh cluster on a post */
function lanternPost(x, z, s = 0.8) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, 4), MATS.woodBeam);
  post.position.y = 0.21;
  g.add(post);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), MATS.lantern);
  lamp.position.set(0.06, 0.35, 0);
  g.add(lamp);
  g.scale.setScalar(s);
  g.position.set(x, 0, z);
  return g;
}

/** gabled roof geometry (pyramid prism trick used across the factories) */
function gableRoof(w, d, h) {
  const geo = new THREE.CylinderGeometry(0.01, w * 0.82, h, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale(1, 1, d / w * 1.05);
  return geo;
}

// ================= APIARY (Пасека) =================
// Footprint 0.5 × 0.4, height ≈ 0.35.
export function makeApiary(rng) {
  const p1 = phaseGroup(); // grassy dirt pad
  p1.add(vc([
    part(new THREE.BoxGeometry(0.5, 0.04, 0.38), PALETTE.dirt, { t: [0, 0.02, 0] }),
  ]));

  const p2 = phaseGroup(); // keeper's shed
  p2.add(vc([
    part(new THREE.BoxGeometry(0.18, 0.16, 0.14), PALETTE.woodBeam, { t: [-0.15, 0.12, -0.08] }),
    part(new THREE.BoxGeometry(0.05, 0.09, 0.02), PALETTE.trunk, { t: [-0.15, 0.085, -0.005] }),
  ]));

  const p3 = phaseGroup(); // shed roof + three dome hives on stools
  const hives = [
    part(new THREE.ConeGeometry(0.13, 0.1, 4), PALETTE.roofThatch, { ry: Math.PI / 4, t: [-0.15, 0.24, -0.08] }),
  ];
  const spots = [[0.05, 0.05], [0.17, -0.06], [0.12, 0.14]];
  for (const [x, z] of spots) {
    hives.push(part(new THREE.BoxGeometry(0.07, 0.02, 0.07), PALETTE.trunk, { t: [x, 0.05, z] }));
    hives.push(part(new THREE.SphereGeometry(0.05, 6, 5), PALETTE.hay, { t: [x, 0.1, z], s: [1, 0.95, 1] }));
    hives.push(part(new THREE.BoxGeometry(0.018, 0.018, 0.012), PALETTE.charcoal, { t: [x, 0.075, z + 0.048] }));
  }
  p3.add(vc(hives));

  const p4 = phaseGroup(); // flowers + honey pot
  p4.add(vc([
    part(new THREE.SphereGeometry(0.016, 4, 3), PALETTE.flower1, { t: [-0.02, 0.055, 0.15] }),
    part(new THREE.SphereGeometry(0.016, 4, 3), PALETTE.flower2, { t: [0.22, 0.055, 0.1] }),
    part(new THREE.SphereGeometry(0.016, 4, 3), PALETTE.flower3, { t: [0.08, 0.055, -0.12] }),
    part(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 6), PALETTE.goldDeep, { t: [-0.05, 0.065, -0.03] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= FISHING PIER (Рыбная пристань) =================
// Footprint 0.7 × 0.4, height ≈ 0.35. Pier extends toward +Z (water).
export function makeFishingPier(rng) {
  const p1 = phaseGroup(); // piles driven into the water
  const piles = [];
  for (const [x, z] of [[-0.08, 0.02], [0.08, 0.02], [-0.08, 0.22], [0.08, 0.22], [-0.08, 0.4], [0.08, 0.4]]) {
    piles.push(part(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 5), PALETTE.trunk, { t: [x, 0.02, z] }));
  }
  p1.add(vc(piles));

  const p2 = phaseGroup(); // plank deck
  p2.add(vc([
    part(new THREE.BoxGeometry(0.22, 0.03, 0.5), PALETTE.crateWood, { t: [0, 0.11, 0.2] }),
    part(new THREE.BoxGeometry(0.3, 0.03, 0.16), PALETTE.crateWood, { t: [-0.04, 0.11, -0.05] }),
  ]));

  const p3 = phaseGroup(); // railing + net drying rack
  p3.add(vc([
    part(new THREE.BoxGeometry(0.02, 0.09, 0.02), PALETTE.fence, { t: [-0.1, 0.17, 0.42] }),
    part(new THREE.BoxGeometry(0.02, 0.09, 0.02), PALETTE.fence, { t: [-0.1, 0.17, 0.12] }),
    part(new THREE.BoxGeometry(0.02, 0.02, 0.32), PALETTE.fence, { t: [-0.1, 0.215, 0.27] }),
    // net rack: two posts + hanging net
    part(new THREE.BoxGeometry(0.02, 0.22, 0.02), PALETTE.woodBeam, { t: [-0.16, 0.22, -0.05] }),
    part(new THREE.BoxGeometry(0.02, 0.22, 0.02), PALETTE.woodBeam, { t: [0.06, 0.22, -0.05] }),
    part(new THREE.BoxGeometry(0.24, 0.02, 0.02), PALETTE.woodBeam, { t: [-0.05, 0.33, -0.05] }),
    part(new THREE.BoxGeometry(0.2, 0.14, 0.008), PALETTE.ropeTan, { t: [-0.05, 0.25, -0.05] }),
  ]));

  const p4 = phaseGroup(); // moored rowboat + barrel + catch
  p4.add(vc([
    // boat hull: tapered box with raised bow
    part(new THREE.BoxGeometry(0.12, 0.05, 0.26), PALETTE.boatHull, { t: [0.22, 0.045, 0.26] }),
    part(new THREE.BoxGeometry(0.09, 0.035, 0.2), PALETTE.leatherDark, { t: [0.22, 0.06, 0.26] }),
    part(new THREE.BoxGeometry(0.12, 0.04, 0.05), PALETTE.boatHull, { rx: -0.5, t: [0.22, 0.06, 0.4] }),
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 7), PALETTE.barrelWood, { t: [0.06, 0.155, -0.02] }),
    part(new THREE.SphereGeometry(0.02, 4, 3), PALETTE.steel, { t: [-0.02, 0.135, 0.3], s: [1, 0.5, 2] }),
  ]));
  const lamp = lanternPost(-0.18, 0.35, 0.6);
  lamp.position.y = 0.11;
  p4.add(lamp);
  return wrap([p1, p2, p3, p4]);
}

// ================= BAKERY (Пекарня) =================
// Footprint 0.5 × 0.42, height ≈ 0.55.
export function makeBakery(rng) {
  const w = 0.38, d = 0.3, wallH = 0.26;

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1), PALETTE.wallStone, { t: [0, 0.03, 0] })]));

  const p2 = phaseGroup(); // walls + big stone oven dome at the back
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallPlaster, { t: [0, 0.06 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(w + 0.01, 0.03, d + 0.01), PALETTE.woodBeam, { t: [0, 0.06 + wallH - 0.015, 0] }),
    part(new THREE.SphereGeometry(0.13, 7, 5), PALETTE.wallStoneB, { t: [0.1, 0.14, -d / 2 - 0.08], s: [1, 0.85, 1] }),
    part(new THREE.BoxGeometry(0.08, 0.06, 0.03), PALETTE.charcoal, { t: [0.1, 0.1, -d / 2 - 0.19] }),
  ]));

  const p3 = phaseGroup(); // roof + oven chimney
  p3.add(vc([
    part(gableRoof(w, d, 0.2), PALETTE.roofRed, { t: [0, 0.06 + wallH + 0.1, 0] }),
    part(new THREE.BoxGeometry(0.08, 0.24, 0.08), PALETTE.wallStoneB, { t: [0.1, 0.06 + wallH + 0.12, -d / 2 + 0.02] }),
  ]));

  const p4 = phaseGroup(); // bread sign + glowing window + smoke
  p4.add(vc([
    part(new THREE.BoxGeometry(0.02, 0.02, 0.1), PALETTE.woodBeam, { t: [w / 2 + 0.01, 0.28, d / 2 - 0.04] }),
    part(new THREE.SphereGeometry(0.045, 6, 4), PALETTE.goldDeep, { t: [w / 2 + 0.01, 0.22, d / 2 + 0.04], s: [0.6, 0.8, 1.2] }),
    part(new THREE.BoxGeometry(0.09, 0.14, 0.02), PALETTE.trunk, { t: [-0.08, 0.13, d / 2 + 0.011] }),
  ]));
  const win = windowPane();
  win.position.set(0.1, 0.06 + wallH * 0.6, d / 2 + 0.011);
  p4.add(win);
  p4.add(smokePuffs(0.1, 0.06 + wallH + 0.3, -d / 2 + 0.02));
  return wrap([p1, p2, p3, p4]);
}

// ================= SAWMILL (Лесопилка, с водяным колесом) =================
// Footprint 0.65 × 0.45, height ≈ 0.5. Waterwheel on the +X side.
export function makeSawmill(rng) {
  const p1 = phaseGroup(); // timber footing + axle bearing
  p1.add(vc([
    part(new THREE.BoxGeometry(0.44, 0.05, 0.36), PALETTE.dirt, { t: [-0.06, 0.025, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.12, 0.06), PALETTE.rockDark, { t: [0.17, 0.06, 0] }),
  ]));

  const p2 = phaseGroup(); // open work shed
  p2.add(vc([
    part(new THREE.BoxGeometry(0.32, 0.22, 0.26), PALETTE.woodBeam, { t: [-0.08, 0.05 + 0.11, 0] }),
    part(new THREE.BoxGeometry(0.03, 0.26, 0.03), PALETTE.trunk, { t: [-0.24, 0.18, 0.13] }),
    part(new THREE.BoxGeometry(0.03, 0.26, 0.03), PALETTE.trunk, { t: [0.08, 0.18, 0.13] }),
  ]));

  const p3 = phaseGroup(); // slanted roof + WATERWHEEL (animated spinner)
  const roof = new THREE.BoxGeometry(0.44, 0.03, 0.36);
  roof.rotateZ(0.1);
  p3.add(vc([
    part(roof, PALETTE.roofThatch, { t: [-0.08, 0.32, 0] }),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 5), PALETTE.trunk, { rz: Math.PI / 2, t: [0.24, 0.18, 0] }),
  ]));
  const wheelParts = [
    part(new THREE.TorusGeometry(0.13, 0.018, 4, 10), PALETTE.woodBeam, {}),
    part(new THREE.TorusGeometry(0.08, 0.012, 4, 8), PALETTE.fence, {}),
  ];
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.BoxGeometry(0.02, 0.26, 0.03);
    spoke.rotateZ((i / 4) * Math.PI);
    wheelParts.push(part(spoke, PALETTE.fence, {}));
  }
  const wheel = new THREE.Group();
  const wheelMesh = vc(wheelParts);
  wheel.add(wheelMesh);
  wheel.rotation.y = Math.PI / 2;         // wheel plane faces ±X
  wheel.position.set(0.31, 0.18, 0);
  wheel.userData.spin = true;             // rotated by ConstructionSystem
  p3.add(wheel);

  const p4 = phaseGroup(); // saw blade + log & plank piles
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 10), PALETTE.steel, { rx: Math.PI / 2, t: [-0.08, 0.16, 0.135] }),
    part(new THREE.CylinderGeometry(0.038, 0.038, 0.3, 5), PALETTE.trunk, { rz: Math.PI / 2, t: [-0.1, 0.04, 0.24] }),
    part(new THREE.CylinderGeometry(0.038, 0.038, 0.26, 5), PALETTE.trunk, { rz: Math.PI / 2, t: [-0.06, 0.1, 0.24] }),
    part(new THREE.BoxGeometry(0.2, 0.015, 0.07), PALETTE.crateWood, { t: [-0.28, 0.06, -0.14] }),
    part(new THREE.BoxGeometry(0.2, 0.015, 0.07), PALETTE.crateWood, { t: [-0.27, 0.075, -0.13], ry: 0.1 }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= FORGE (Кузница) =================
// Footprint 0.5 × 0.42, height ≈ 0.5.
export function makeForge(rng) {
  const w = 0.36, d = 0.3, wallH = 0.24;

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.12, 0.06, d + 0.12), PALETTE.rockDark, { t: [0, 0.03, 0] })]));

  const p2 = phaseGroup(); // stone smithy with a wide open front
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallStoneB, { t: [0, 0.06 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(0.16, 0.16, 0.03), PALETTE.charcoal, { t: [0, 0.15, d / 2 + 0.005] }),
    part(new THREE.BoxGeometry(w + 0.02, 0.035, d + 0.02), PALETTE.rockDark, { t: [0, 0.09, 0] }),
  ]));

  const p3 = phaseGroup(); // slate roof + massive chimney
  p3.add(vc([
    part(gableRoof(w, d, 0.18), PALETTE.roofSlate, { t: [0, 0.06 + wallH + 0.09, 0] }),
    part(new THREE.BoxGeometry(0.1, 0.28, 0.1), PALETTE.rockDark, { t: [-w * 0.28, 0.06 + wallH + 0.1, -0.04] }),
  ]));

  const p4 = phaseGroup(); // anvil, forge glow, quench barrel, smoke
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.07, 6), PALETTE.trunk, { t: [0.14, 0.095, d / 2 + 0.12] }),
    part(new THREE.BoxGeometry(0.1, 0.035, 0.04), PALETTE.steelDark, { t: [0.14, 0.15, d / 2 + 0.12] }),
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 7), PALETTE.barrelWood, { t: [-0.14, 0.105, d / 2 + 0.1] }),
  ]));
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.03), MATS.torchFlame);
  glow.position.set(0, 0.13, d / 2 - 0.01);
  p4.add(glow);
  p4.add(smokePuffs(-w * 0.28, 0.06 + wallH + 0.28, -0.04));
  return wrap([p1, p2, p3, p4]);
}

// ================= STABLE (Конюшня) =================
// Footprint 0.68 × 0.5, height ≈ 0.42.
export function makeStable(rng) {
  const w = 0.42, d = 0.28, wallH = 0.22;

  const p1 = phaseGroup(); // dirt paddock + fence
  const pad = [part(new THREE.BoxGeometry(w + 0.24, 0.04, d + 0.26), PALETTE.dirt, { t: [0.06, 0.02, 0.04] })];
  const rail = (len, x, z, ry = 0) => [
    part(new THREE.BoxGeometry(len, 0.022, 0.02), PALETTE.fence, { ry, t: [x, 0.12, z] }),
    part(new THREE.BoxGeometry(0.025, 0.14, 0.025), PALETTE.fence, { t: [x - Math.cos(ry) * len / 2, 0.07, z + Math.sin(ry) * len / 2] }),
    part(new THREE.BoxGeometry(0.025, 0.14, 0.025), PALETTE.fence, { t: [x + Math.cos(ry) * len / 2, 0.07, z - Math.sin(ry) * len / 2] }),
  ];
  pad.push(...rail(0.5, 0.08, d / 2 + 0.16));
  pad.push(...rail(0.34, w / 2 + 0.16, 0.03, Math.PI / 2));
  p1.add(vc(pad));

  const p2 = phaseGroup(); // open-front stable body
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.woodBeam, { t: [-0.08, 0.04 + wallH / 2, -0.06] }),
    part(new THREE.BoxGeometry(0.14, 0.13, 0.02), PALETTE.charcoal, { t: [-0.16, 0.105, -0.06 + d / 2 + 0.005] }),
    part(new THREE.BoxGeometry(0.02, wallH, 0.02), PALETTE.trunk, { t: [-0.08 + w / 2, 0.04 + wallH / 2, -0.06 + d / 2] }),
  ]));

  const p3 = phaseGroup(); // thatch roof + loft hatch
  p3.add(vc([
    part(gableRoof(w, d, 0.16), PALETTE.roofThatch, { t: [-0.08, 0.04 + wallH + 0.08, -0.06] }),
    part(new THREE.BoxGeometry(0.08, 0.08, 0.02), PALETTE.trunk, { t: [-0.08, 0.04 + wallH + 0.02, -0.06 + d / 2 + 0.01] }),
  ]));

  const p4 = phaseGroup(); // horse in the paddock + hay + trough
  p4.add(vc([
    // horse: body, neck, head, legs, tail — chunky low-poly silhouette
    part(new THREE.BoxGeometry(0.07, 0.07, 0.16), PALETTE.leather, { t: [0.16, 0.13, 0.1] }),
    part(new THREE.BoxGeometry(0.045, 0.09, 0.05), PALETTE.leather, { rx: -0.5, t: [0.16, 0.19, 0.185] }),
    part(new THREE.BoxGeometry(0.04, 0.045, 0.07), PALETTE.leatherDark, { t: [0.16, 0.235, 0.22] }),
    part(new THREE.BoxGeometry(0.02, 0.09, 0.02), PALETTE.leatherDark, { t: [0.135, 0.05, 0.04] }),
    part(new THREE.BoxGeometry(0.02, 0.09, 0.02), PALETTE.leatherDark, { t: [0.185, 0.05, 0.04] }),
    part(new THREE.BoxGeometry(0.02, 0.09, 0.02), PALETTE.leatherDark, { t: [0.135, 0.05, 0.16] }),
    part(new THREE.BoxGeometry(0.02, 0.09, 0.02), PALETTE.leatherDark, { t: [0.185, 0.05, 0.16] }),
    part(new THREE.BoxGeometry(0.015, 0.07, 0.015), PALETTE.charcoal, { rx: 0.4, t: [0.16, 0.11, 0.015] }),
    // hay + water trough
    part(new THREE.SphereGeometry(0.06, 5, 4), PALETTE.hay, { t: [0.32, 0.055, -0.08], s: [1, 0.8, 1] }),
    part(new THREE.BoxGeometry(0.12, 0.04, 0.06), PALETTE.trunk, { t: [0.05, 0.06, 0.22] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= BARRACKS (Казарма) =================
// Footprint 0.62 × 0.45, height ≈ 0.5.
export function makeBarracks(rng) {
  const w = 0.46, d = 0.28, wallH = 0.26;

  const p1 = phaseGroup(); // stone drill-yard platform
  p1.add(vc([
    part(new THREE.BoxGeometry(w + 0.16, 0.05, d + 0.24), PALETTE.rockDark, { t: [0, 0.025, 0.04] }),
  ]));

  const p2 = phaseGroup(); // long stone hall with timber band
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallStoneB, { t: [0, 0.05 + wallH / 2, -0.06] }),
    part(new THREE.BoxGeometry(w + 0.01, 0.04, d + 0.01), PALETTE.woodBeam, { t: [0, 0.05 + wallH - 0.02, -0.06] }),
    part(new THREE.BoxGeometry(0.1, 0.15, 0.02), PALETTE.trunk, { t: [0, 0.125, -0.06 + d / 2 + 0.011] }),
    part(new THREE.BoxGeometry(0.04, 0.07, 0.02), PALETTE.charcoal, { t: [-0.15, 0.2, -0.06 + d / 2 + 0.005] }),
    part(new THREE.BoxGeometry(0.04, 0.07, 0.02), PALETTE.charcoal, { t: [0.15, 0.2, -0.06 + d / 2 + 0.005] }),
  ]));

  const p3 = phaseGroup(); // slate roof
  p3.add(vc([
    part(gableRoof(w, d, 0.18), PALETTE.roofSlate, { t: [0, 0.05 + wallH + 0.09, -0.06] }),
  ]));

  const p4 = phaseGroup(); // weapon rack + training dummy + shield
  p4.add(vc([
    // rack: two posts, three leaning spears
    part(new THREE.BoxGeometry(0.02, 0.2, 0.02), PALETTE.woodBeam, { t: [-0.24, 0.15, 0.14] }),
    part(new THREE.BoxGeometry(0.02, 0.2, 0.02), PALETTE.woodBeam, { t: [-0.1, 0.15, 0.14] }),
    part(new THREE.BoxGeometry(0.16, 0.02, 0.02), PALETTE.woodBeam, { t: [-0.17, 0.24, 0.14] }),
    part(new THREE.CylinderGeometry(0.007, 0.009, 0.26, 4), PALETTE.signWood, { rz: 0.12, t: [-0.21, 0.14, 0.15] }),
    part(new THREE.CylinderGeometry(0.007, 0.009, 0.26, 4), PALETTE.signWood, { rz: -0.1, t: [-0.15, 0.14, 0.15] }),
    part(new THREE.ConeGeometry(0.012, 0.035, 4), PALETTE.steel, { t: [-0.223, 0.28, 0.15] }),
    part(new THREE.ConeGeometry(0.012, 0.035, 4), PALETTE.steel, { t: [-0.14, 0.28, 0.15] }),
    // training dummy: post, crossbar, straw head
    part(new THREE.CylinderGeometry(0.02, 0.024, 0.24, 5), PALETTE.trunk, { t: [0.2, 0.17, 0.16] }),
    part(new THREE.BoxGeometry(0.16, 0.025, 0.025), PALETTE.woodBeam, { t: [0.2, 0.24, 0.16] }),
    part(new THREE.SphereGeometry(0.035, 5, 4), PALETTE.hay, { t: [0.2, 0.31, 0.16] }),
    // shield by the door
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 9), PALETTE.tabardRed, { rx: Math.PI / 2, t: [0.09, 0.1, -0.06 + d / 2 + 0.02] }),
  ]));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 5), MATS.torchFlame);
  flame.position.set(-0.09, 0.3, -0.06 + d / 2 + 0.03);
  p4.add(flame);
  return wrap([p1, p2, p3, p4]);
}

// ================= TEMPLE (Храм) =================
// Footprint 0.55 × 0.45, height ≈ 0.9.
export function makeTemple(rng) {
  const naveW = 0.3, naveD = 0.3, naveH = 0.28;

  const p1 = phaseGroup(); // stepped stone platform
  p1.add(vc([
    part(new THREE.BoxGeometry(0.52, 0.05, 0.44), PALETTE.wallStone, { t: [0, 0.025, 0] }),
    part(new THREE.BoxGeometry(0.44, 0.05, 0.38), PALETTE.wallStoneB, { t: [0, 0.07, 0] }),
  ]));

  const p2 = phaseGroup(); // nave + front bell tower
  p2.add(vc([
    part(new THREE.BoxGeometry(naveW, naveH, naveD), PALETTE.wallPlaster, { t: [-0.06, 0.09 + naveH / 2, -0.04] }),
    part(new THREE.BoxGeometry(0.16, 0.5, 0.16), PALETTE.wallPlaster, { t: [0.14, 0.09 + 0.25, 0.1] }),
    part(new THREE.BoxGeometry(0.07, 0.12, 0.02), PALETTE.woodBeam, { t: [0.14, 0.16, 0.19] }),
    part(new THREE.BoxGeometry(0.05, 0.06, 0.02), PALETTE.charcoal, { t: [0.14, 0.48, 0.19] }),
  ]));

  const p3 = phaseGroup(); // gable roof + spire
  p3.add(vc([
    part(gableRoof(naveW, naveD, 0.16), PALETTE.roofSlate, { t: [-0.06, 0.09 + naveH + 0.08, -0.04] }),
    part(new THREE.ConeGeometry(0.12, 0.24, 4), PALETTE.roofSlate, { ry: Math.PI / 4, t: [0.14, 0.71, 0.1] }),
  ]));

  const p4 = phaseGroup(); // gilded finial + glowing windows + lantern
  p4.add(vc([
    part(new THREE.SphereGeometry(0.02, 6, 5), PALETTE.goldCoin, { t: [0.14, 0.845, 0.1] }),
    part(new THREE.ConeGeometry(0.01, 0.05, 4), PALETTE.goldDeep, { t: [0.14, 0.88, 0.1] }),
  ]));
  const win1 = windowPane(0.05, 0.09);
  win1.position.set(-0.06, 0.09 + naveH * 0.55, -0.04 + naveD / 2 + 0.011);
  p4.add(win1);
  const win2 = windowPane(0.05, 0.09);
  win2.position.set(-0.06 - naveW / 2 - 0.011, 0.09 + naveH * 0.55, -0.04);
  win2.rotation.y = Math.PI / 2;
  p4.add(win2);
  p4.add(lanternPost(0.3, 0.24, 0.7));
  return wrap([p1, p2, p3, p4]);
}

// ================= PORT (Порт) =================
// Footprint 0.72 × 0.5, height ≈ 0.6. Quay opens toward +Z (water).
export function makePort(rng) {
  const p1 = phaseGroup(); // stone quay + bollards
  p1.add(vc([
    part(new THREE.BoxGeometry(0.6, 0.1, 0.24), PALETTE.wallStoneB, { t: [0, 0.05, -0.08] }),
    part(new THREE.BoxGeometry(0.2, 0.1, 0.24), PALETTE.wallStoneB, { t: [-0.2, 0.05, 0.14] }),
    part(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 5), PALETTE.rockDark, { t: [0.06, 0.13, 0.02] }),
    part(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 5), PALETTE.rockDark, { t: [0.24, 0.13, 0.02] }),
  ]));

  const p2 = phaseGroup(); // harbor office hut
  p2.add(vc([
    part(new THREE.BoxGeometry(0.2, 0.18, 0.16), PALETTE.woodBeam, { t: [-0.2, 0.1 + 0.09, -0.1] }),
    part(new THREE.BoxGeometry(0.06, 0.1, 0.015), PALETTE.trunk, { t: [-0.2, 0.15, -0.019] }),
    part(gableRoof(0.2, 0.16, 0.1), PALETTE.roofBlue, { t: [-0.2, 0.33, -0.1] }),
  ]));

  const p3 = phaseGroup(); // loading crane with hanging crate
  p3.add(vc([
    part(new THREE.CylinderGeometry(0.025, 0.035, 0.4, 6), PALETTE.siegeWood, { t: [0.14, 0.3, -0.12] }),
    part(new THREE.BoxGeometry(0.03, 0.03, 0.3), PALETTE.siegeWood, { t: [0.14, 0.48, 0.02] }),
    part(new THREE.BoxGeometry(0.025, 0.14, 0.025), PALETTE.woodBeam, { rx: 0.7, t: [0.14, 0.42, -0.045] }),
    part(new THREE.BoxGeometry(0.008, 0.16, 0.008), PALETTE.ropeTan, { t: [0.14, 0.38, 0.14] }),
    part(new THREE.BoxGeometry(0.08, 0.08, 0.08), PALETTE.crateWood, { t: [0.14, 0.26, 0.14] }),
  ]));

  const p4 = phaseGroup(); // moored boat with mast + cargo on the quay
  p4.add(vc([
    part(new THREE.BoxGeometry(0.14, 0.06, 0.3), PALETTE.boatHull, { t: [0.16, 0.05, 0.3] }),
    part(new THREE.BoxGeometry(0.1, 0.04, 0.24), PALETTE.leatherDark, { t: [0.16, 0.075, 0.3] }),
    part(new THREE.CylinderGeometry(0.012, 0.015, 0.3, 4), PALETTE.trunk, { t: [0.16, 0.22, 0.26] }),
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 7), PALETTE.barrelWood, { t: [-0.05, 0.145, -0.06] }),
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 7), PALETTE.barrelWood, { t: [0.02, 0.145, -0.12] }),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.07), PALETTE.crateWood, { t: [0.32, 0.135, -0.1] }),
  ]));
  const lamp = lanternPost(-0.32, 0.16, 0.7);
  lamp.position.y = 0.1;
  p4.add(lamp);
  return wrap([p1, p2, p3, p4]);
}

// ================= UNIVERSITY (Университет) =================
// Footprint 0.7 × 0.5, height ≈ 0.75.
export function makeUniversity(rng) {
  const p1 = phaseGroup(); // broad stone base
  p1.add(vc([
    part(new THREE.BoxGeometry(0.66, 0.06, 0.46), PALETTE.wallStone, { t: [0, 0.03, 0] }),
    part(new THREE.BoxGeometry(0.14, 0.04, 0.1), PALETTE.wallStoneB, { t: [0, 0.08, 0.22] }),
  ]));

  const p2 = phaseGroup(); // two-story main hall + side wing
  const mainW = 0.34, mainD = 0.3;
  p2.add(vc([
    part(new THREE.BoxGeometry(mainW, 0.2, mainD), PALETTE.wallStoneB, { t: [-0.1, 0.06 + 0.1, 0] }),
    part(new THREE.BoxGeometry(mainW + 0.04, 0.18, mainD + 0.04), PALETTE.wallPlaster, { t: [-0.1, 0.06 + 0.29, 0] }),
    part(new THREE.BoxGeometry(mainW + 0.06, 0.03, mainD + 0.06), PALETTE.woodBeam, { t: [-0.1, 0.26, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.24, 0.24), PALETTE.wallPlaster, { t: [0.2, 0.06 + 0.12, 0.02] }),
    part(new THREE.BoxGeometry(0.09, 0.15, 0.02), PALETTE.trunk, { t: [-0.1, 0.135, mainD / 2 + 0.011] }),
  ]));

  const p3 = phaseGroup(); // twin roofs + bell turret
  p3.add(vc([
    part(gableRoof(mainW + 0.04, mainD + 0.04, 0.2), PALETTE.roofGreen, { t: [-0.1, 0.06 + 0.38 + 0.1, 0] }),
    part(gableRoof(0.22, 0.24, 0.12), PALETTE.roofSlate, { t: [0.2, 0.06 + 0.24 + 0.06, 0.02] }),
    part(new THREE.BoxGeometry(0.07, 0.1, 0.07), PALETTE.wallPlaster, { t: [-0.1, 0.66, 0] }),
    part(new THREE.ConeGeometry(0.055, 0.09, 4), PALETTE.roofSlate, { ry: Math.PI / 4, t: [-0.1, 0.755, 0] }),
  ]));

  const p4 = phaseGroup(); // hanging banner + glowing windows + books
  const cloth = new THREE.PlaneGeometry(0.08, 0.14, 1, 4);
  cloth.translate(0, -0.07, 0);
  const ban = new THREE.Mesh(cloth, MATS.banner);
  ban.position.set(-0.1, 0.44, 0.171);
  p4.add(ban);
  for (const x of [-0.2, 0.0]) {
    const win = windowPane(0.05, 0.07);
    win.position.set(x, 0.41, (0.3 + 0.04) / 2 + 0.011);
    p4.add(win);
  }
  p4.add(vc([
    part(new THREE.BoxGeometry(0.05, 0.02, 0.035), PALETTE.tabardRed, { t: [0.31, 0.19, 0.1], ry: 0.3 }),
    part(new THREE.BoxGeometry(0.05, 0.02, 0.035), PALETTE.tabardBlue, { t: [0.31, 0.21, 0.1], ry: 0.1 }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= OBSERVATORY (Обсерватория) =================
// Footprint 0.45 × 0.45, height ≈ 0.85.
export function makeObservatory(rng) {
  const p1 = phaseGroup(); // rocky hex footing
  p1.add(vc([
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 6), PALETTE.rockDark, { t: [0, 0.04, 0] }),
  ]));

  const p2 = phaseGroup(); // stone tower + door + tiny window
  p2.add(vc([
    part(new THREE.CylinderGeometry(0.15, 0.18, 0.42, 7), PALETTE.wallStoneB, { t: [0, 0.29, 0] }),
    part(new THREE.BoxGeometry(0.08, 0.13, 0.02), PALETTE.trunk, { t: [0, 0.14, 0.165] }),
    part(new THREE.BoxGeometry(0.04, 0.05, 0.02), PALETTE.charcoal, { t: [0.08, 0.38, 0.13], ry: 0.5 }),
  ]));

  const p3 = phaseGroup(); // walkway ring + dome with slit
  p3.add(vc([
    part(new THREE.CylinderGeometry(0.18, 0.15, 0.05, 7), PALETTE.rockDark, { t: [0, 0.525, 0] }),
    part(new THREE.SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.roofSlate, { t: [0, 0.55, 0] }),
    part(new THREE.BoxGeometry(0.035, 0.13, 0.145), PALETTE.charcoal, { rx: -0.5, t: [0, 0.63, 0.06] }),
  ]));

  const p4 = phaseGroup(); // brass telescope poking from the slit + lantern
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.02, 0.028, 0.22, 6), PALETTE.goldDeep, { rx: Math.PI / 2 - 0.7, t: [0, 0.68, 0.1] }),
    part(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 6), PALETTE.goldCoin, { rx: Math.PI / 2 - 0.7, t: [0, 0.745, 0.155] }),
  ]));
  const lamp = lanternPost(0.2, 0.14, 0.6);
  p4.add(lamp);
  return wrap([p1, p2, p3, p4]);
}

// ================= LIBRARY (Библиотека) =================
// Footprint 0.5 × 0.42, height ≈ 0.55.
export function makeLibrary(rng) {
  const w = 0.36, d = 0.3, wallH = 0.3;

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.BoxGeometry(w + 0.1, 0.06, d + 0.1), PALETTE.wallStone, { t: [0, 0.03, 0] })]));

  const p2 = phaseGroup(); // tall-windowed hall
  p2.add(vc([
    part(new THREE.BoxGeometry(w, wallH, d), PALETTE.wallPlaster, { t: [0, 0.06 + wallH / 2, 0] }),
    part(new THREE.BoxGeometry(w + 0.01, 0.03, d + 0.01), PALETTE.woodBeam, { t: [0, 0.06 + wallH - 0.015, 0] }),
    part(new THREE.BoxGeometry(0.04, 0.16, 0.02), PALETTE.charcoal, { t: [-w * 0.28, 0.06 + wallH * 0.55, d / 2 + 0.005] }),
    part(new THREE.BoxGeometry(0.09, 0.14, 0.02), PALETTE.trunk, { t: [w * 0.2, 0.13, d / 2 + 0.011] }),
  ]));

  const p3 = phaseGroup(); // green roof + dormer
  p3.add(vc([
    part(gableRoof(w, d, 0.2), PALETTE.roofGreen, { t: [0, 0.06 + wallH + 0.1, 0] }),
    part(new THREE.BoxGeometry(0.08, 0.08, 0.08), PALETTE.wallPlaster, { t: [0, 0.06 + wallH + 0.08, d * 0.28] }),
    part(new THREE.ConeGeometry(0.06, 0.06, 4), PALETTE.roofGreen, { ry: Math.PI / 4, t: [0, 0.06 + wallH + 0.15, d * 0.28] }),
  ]));

  const p4 = phaseGroup(); // scroll shelf outside + book sign + lit window
  p4.add(vc([
    part(new THREE.BoxGeometry(0.14, 0.02, 0.06), PALETTE.woodBeam, { t: [-w / 2 - 0.1, 0.12, 0.04] }),
    part(new THREE.BoxGeometry(0.14, 0.02, 0.06), PALETTE.woodBeam, { t: [-w / 2 - 0.1, 0.2, 0.04] }),
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 5), PALETTE.wallPlaster, { rx: Math.PI / 2, t: [-w / 2 - 0.13, 0.145, 0.04] }),
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 5), PALETTE.clothTrim, { rx: Math.PI / 2, t: [-w / 2 - 0.09, 0.145, 0.04] }),
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 5), PALETTE.wallPlaster, { rx: Math.PI / 2, t: [-w / 2 - 0.11, 0.225, 0.04] }),
    // book-shaped sign over the door
    part(new THREE.BoxGeometry(0.06, 0.045, 0.015), PALETTE.tabardBlue, { t: [w * 0.2, 0.24, d / 2 + 0.02] }),
    part(new THREE.BoxGeometry(0.008, 0.045, 0.018), PALETTE.wallPlaster, { t: [w * 0.2, 0.24, d / 2 + 0.02] }),
  ]));
  const win = windowPane(0.05, 0.12);
  win.position.set(-w * 0.28, 0.06 + wallH * 0.55, d / 2 + 0.015);
  p4.add(win);
  return wrap([p1, p2, p3, p4]);
}

/** registry fragment merged into BUILDING_MAKERS by BuildingFactory */
export const CIVIC_MAKERS = {
  apiary: makeApiary,
  fishingPier: makeFishingPier,
  bakery: makeBakery,
  sawmill: makeSawmill,
  forge: makeForge,
  stable: makeStable,
  barracks: makeBarracks,
  temple: makeTemple,
  port: makePort,
  university: makeUniversity,
  observatory: makeObservatory,
  library: makeLibrary,
};
