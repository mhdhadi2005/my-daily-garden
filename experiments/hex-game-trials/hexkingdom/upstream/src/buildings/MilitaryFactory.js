// ============================================================
// MilitaryFactory — caravans, army units, siege engines and
// defensive works (military & trade expansion, Priority 1).
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

// faction cloth lookup: tabard color + animated flag material
const FACTIONS = {
  red:   { cloth: PALETTE.tabardRed,   flagMat: () => MATS.flagRed },
  blue:  { cloth: PALETTE.tabardBlue,  flagMat: () => MATS.flagBlue },
  green: { cloth: PALETTE.tabardGreen, flagMat: () => MATS.flagGreen },
};
const FACTION_IDS = ['red', 'blue', 'green'];

/** waving faction flag on a pole (like BuildingFactory makeFlag but colored) */
function makeFactionFlag(h = 0.5, faction = 'red', clothW = 0.22, clothH = 0.12) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 4), MATS.woodBeam);
  pole.position.y = h / 2;
  g.add(pole);
  const cloth = new THREE.PlaneGeometry(clothW, clothH, 6, 1);
  cloth.translate(clothW / 2, 0, 0);
  const flag = new THREE.Mesh(cloth, FACTIONS[faction].flagMat());
  flag.position.set(0.012, h - clothH * 0.75, 0);
  g.add(flag);
  return g;
}

/** spoked cart wheel as mergeable parts: disc + hub, axis along X */
function wheelParts(x, y, z, r = 0.08) {
  return [
    part(new THREE.CylinderGeometry(r, r, 0.028, 9), PALETTE.wagonWheel, { rz: Math.PI / 2, t: [x, y, z] }),
    part(new THREE.CylinderGeometry(r * 0.3, r * 0.3, 0.04, 6), PALETTE.leather, { rz: Math.PI / 2, t: [x, y, z] }),
  ];
}

/** cargo pile parts for a given resource type, centered at (x,y,z) */
function cargoParts(type, x, y, z) {
  switch (type) {
    case 'food':
      return [
        part(new THREE.SphereGeometry(0.06, 5, 4), PALETTE.hay, { t: [x - 0.04, y + 0.05, z], s: [1, 0.8, 1] }),
        part(new THREE.SphereGeometry(0.05, 5, 4), PALETTE.hay, { t: [x + 0.05, y + 0.045, z + 0.03], s: [1, 0.8, 1] }),
        part(new THREE.SphereGeometry(0.028, 5, 4), PALETTE.appleRed, { t: [x + 0.02, y + 0.1, z - 0.02] }),
      ];
    case 'wood':
      return [
        part(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 5), PALETTE.trunk, { rx: Math.PI / 2, t: [x - 0.04, y + 0.032, z] }),
        part(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 5), PALETTE.trunk, { rx: Math.PI / 2, t: [x + 0.03, y + 0.032, z] }),
        part(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 5), PALETTE.trunk, { rx: Math.PI / 2, t: [x, y + 0.088, z] }),
      ];
    case 'stone':
      return [
        part(new THREE.BoxGeometry(0.08, 0.06, 0.07), PALETTE.stonePile, { t: [x - 0.04, y + 0.03, z], ry: 0.3 }),
        part(new THREE.BoxGeometry(0.07, 0.06, 0.08), PALETTE.rock, { t: [x + 0.045, y + 0.03, z + 0.02], ry: -0.4 }),
        part(new THREE.BoxGeometry(0.06, 0.05, 0.06), PALETTE.rockDark, { t: [x, y + 0.08, z - 0.01], ry: 0.7 }),
      ];
    case 'gold':
      return [
        part(new THREE.BoxGeometry(0.11, 0.07, 0.08), PALETTE.crateWood, { t: [x - 0.03, y + 0.035, z] }),
        part(new THREE.BoxGeometry(0.115, 0.015, 0.085), PALETTE.ironBand, { t: [x - 0.03, y + 0.035, z] }),
        part(new THREE.SphereGeometry(0.03, 5, 4), PALETTE.goldCoin, { t: [x + 0.06, y + 0.03, z + 0.02], s: [1, 0.7, 1] }),
        part(new THREE.SphereGeometry(0.022, 5, 4), PALETTE.goldDeep, { t: [x + 0.055, y + 0.065, z - 0.015], s: [1, 0.7, 1] }),
      ];
    default: // crates
      return [
        part(new THREE.BoxGeometry(0.09, 0.09, 0.09), PALETTE.crateWood, { t: [x - 0.03, y + 0.045, z] }),
        part(new THREE.BoxGeometry(0.07, 0.07, 0.07), PALETTE.crateWood, { t: [x + 0.05, y + 0.035, z + 0.02], ry: 0.4 }),
      ];
  }
}

/** standalone cargo prop mesh (food/wood/stone/gold) for caravan systems */
export function makeCargoProp(type = 'wood') {
  return vc(cargoParts(type, 0, 0, 0));
}

// ================= CARAVAN WAGON (covered) =================
// Footprint 0.32 × 0.55, height ≈ 0.34. Front faces +Z.
export function makeCaravanWagon(rng) {
  const p1 = phaseGroup(); // chassis: axle, wheels, draw shafts
  p1.add(vc([
    part(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 4), PALETTE.woodBeam, { rz: Math.PI / 2, t: [0, 0.08, -0.08] }),
    ...wheelParts(-0.155, 0.08, -0.08, 0.08),
    ...wheelParts(0.155, 0.08, -0.08, 0.08),
    // draw shafts angling down toward the (invisible) horse
    part(new THREE.BoxGeometry(0.02, 0.02, 0.24), PALETTE.woodBeam, { rx: 0.14, t: [-0.09, 0.1, 0.3] }),
    part(new THREE.BoxGeometry(0.02, 0.02, 0.24), PALETTE.woodBeam, { rx: 0.14, t: [0.09, 0.1, 0.3] }),
    // front support leg
    part(new THREE.BoxGeometry(0.025, 0.13, 0.025), PALETTE.fence, { t: [0, 0.065, 0.16] }),
  ]));

  const p2 = phaseGroup(); // cart bed + side boards
  p2.add(vc([
    part(new THREE.BoxGeometry(0.26, 0.04, 0.42), PALETTE.crateWood, { t: [0, 0.15, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.08, 0.42), PALETTE.woodBeam, { t: [-0.13, 0.2, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.08, 0.42), PALETTE.woodBeam, { t: [0.13, 0.2, 0] }),
    part(new THREE.BoxGeometry(0.26, 0.08, 0.02), PALETTE.woodBeam, { t: [0, 0.2, -0.21] }),
    // driver bench
    part(new THREE.BoxGeometry(0.22, 0.03, 0.07), PALETTE.fence, { t: [0, 0.24, 0.17] }),
  ]));

  const p3 = phaseGroup(); // canvas cover arching over the bed
  p3.add(vc([
    part(new THREE.CylinderGeometry(0.145, 0.145, 0.3, 8, 1, true, 0, Math.PI), PALETTE.clothCover, {
      rx: Math.PI / 2, rz: Math.PI / 2, t: [0, 0.19, -0.04],
    }),
    // hoop trims at both cover ends
    part(new THREE.TorusGeometry(0.14, 0.008, 4, 8, Math.PI), PALETTE.clothTrim, { t: [0, 0.19, 0.11] }),
    part(new THREE.TorusGeometry(0.14, 0.008, 4, 8, Math.PI), PALETTE.clothTrim, { t: [0, 0.19, -0.19] }),
  ]));

  const p4 = phaseGroup(); // small cargo at the tail + hanging lantern
  p4.add(vc(cargoParts(rng.pick(['food', 'wood', 'stone', 'gold']), 0, 0.17, 0.12)));
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.045), MATS.lantern);
  lamp.position.set(0.14, 0.27, 0.2);
  p4.add(lamp);
  return wrap([p1, p2, p3, p4]);
}

// ================= CARAVAN LOADED (open, piled cargo) =================
// Footprint 0.32 × 0.52, height ≈ 0.3. Front faces +Z.
export function makeCaravanLoaded(rng) {
  const cargo = rng.pick(['food', 'wood', 'stone', 'gold']);

  const p1 = phaseGroup(); // chassis: two axles, four wheels
  p1.add(vc([
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 4), PALETTE.woodBeam, { rz: Math.PI / 2, t: [0, 0.07, -0.13] }),
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 4), PALETTE.woodBeam, { rz: Math.PI / 2, t: [0, 0.07, 0.13] }),
    ...wheelParts(-0.15, 0.07, -0.13, 0.07),
    ...wheelParts(0.15, 0.07, -0.13, 0.07),
    ...wheelParts(-0.15, 0.07, 0.13, 0.07),
    ...wheelParts(0.15, 0.07, 0.13, 0.07),
  ]));

  const p2 = phaseGroup(); // flat bed with low rails
  p2.add(vc([
    part(new THREE.BoxGeometry(0.26, 0.04, 0.4), PALETTE.crateWood, { t: [0, 0.13, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.05, 0.4), PALETTE.woodBeam, { t: [-0.13, 0.17, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.05, 0.4), PALETTE.woodBeam, { t: [0.13, 0.17, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.02, 0.24), PALETTE.woodBeam, { rx: 0.14, t: [-0.09, 0.09, 0.29] }),
    part(new THREE.BoxGeometry(0.02, 0.02, 0.24), PALETTE.woodBeam, { rx: 0.14, t: [0.09, 0.09, 0.29] }),
  ]));

  const p3 = phaseGroup(); // visible cargo piles (two clusters)
  p3.add(vc([
    ...cargoParts(cargo, 0, 0.15, -0.1),
    ...cargoParts(cargo, 0, 0.15, 0.08),
  ]));

  const p4 = phaseGroup(); // rope lashing + tail sack
  p4.add(vc([
    part(new THREE.BoxGeometry(0.27, 0.012, 0.012), PALETTE.ropeTan, { t: [0, 0.22, -0.06] }),
    part(new THREE.BoxGeometry(0.27, 0.012, 0.012), PALETTE.ropeTan, { t: [0, 0.22, 0.1] }),
    part(new THREE.SphereGeometry(0.045, 5, 4), PALETTE.clothTrim, { t: [0, 0.155, 0.22], s: [1, 0.8, 1] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= TRADE ROAD MARKER =================
// Footprint 0.14 × 0.14, height ≈ 0.44.
export function makeTradeRoadMarker(rng) {
  const p1 = phaseGroup(); // stone footing
  p1.add(vc([
    part(new THREE.CylinderGeometry(0.055, 0.07, 0.04, 6), PALETTE.rockDark, { t: [0, 0.02, 0] }),
    part(new THREE.SphereGeometry(0.025, 4, 3), PALETTE.rock, { t: [0.06, 0.02, 0.03] }),
  ]));

  const p2 = phaseGroup(); // post
  p2.add(vc([
    part(new THREE.CylinderGeometry(0.016, 0.02, 0.4, 5), PALETTE.signWood, { t: [0, 0.24, 0] }),
    part(new THREE.ConeGeometry(0.024, 0.04, 5), PALETTE.woodBeam, { t: [0, 0.46, 0] }),
  ]));

  const p3 = phaseGroup(); // two angled sign boards
  p3.add(vc([
    part(new THREE.BoxGeometry(0.16, 0.045, 0.014), PALETTE.signWood, { ry: 0.4, t: [0.05, 0.38, 0] }),
    part(new THREE.BoxGeometry(0.13, 0.04, 0.014), PALETTE.crateWood, { ry: -0.9, t: [-0.04, 0.3, 0.02] }),
    // arrow tip on the top board
    part(new THREE.ConeGeometry(0.022, 0.035, 4), PALETTE.signWood, { rz: -Math.PI / 2, ry: 0.4, t: [0.135, 0.38, -0.036] }),
  ]));

  const p4 = phaseGroup(); // coin emblem + grass tuft
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8), PALETTE.goldCoin, { rx: Math.PI / 2, ry: 0.4, t: [0.05, 0.38, 0.012] }),
    part(new THREE.ConeGeometry(0.015, 0.05, 4), PALETTE.grassDark, { t: [-0.06, 0.025, 0.04] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ============================================================
// ARMY UNITS — static posed figures ≈ 0.22 wide, 0.4–0.5 tall.
// Shared body plan; phases: base → body → gear → accent.
// ============================================================

/** shared soldier body parts (legs, tunic, arms, head) */
function soldierBody(tabard, armMat = tabard) {
  return [
    part(new THREE.BoxGeometry(0.09, 0.1, 0.055), PALETTE.leatherDark, { t: [0, 0.07, 0] }),
    part(new THREE.BoxGeometry(0.12, 0.14, 0.07), tabard, { t: [0, 0.19, 0] }),
    part(new THREE.BoxGeometry(0.125, 0.02, 0.075), PALETTE.leather, { t: [0, 0.135, 0] }),
    part(new THREE.BoxGeometry(0.03, 0.12, 0.05), armMat, { t: [-0.075, 0.19, 0] }),
    part(new THREE.BoxGeometry(0.03, 0.12, 0.05), armMat, { t: [0.075, 0.19, 0] }),
    part(new THREE.SphereGeometry(0.042, 6, 5), PALETTE.skin, { t: [0, 0.3, 0] }),
  ];
}

function unitBasePlate() {
  return vc([part(new THREE.CylinderGeometry(0.09, 0.1, 0.02, 7), PALETTE.dirt, { t: [0, 0.01, 0] })]);
}

// ================= SWORDSMAN =================
// Footprint 0.22 × 0.14, height ≈ 0.4.
export function makeUnitSwordsman(rng, faction = null) {
  const f = FACTIONS[faction || rng.pick(FACTION_IDS)];

  const p1 = phaseGroup();
  p1.add(unitBasePlate());

  const p2 = phaseGroup(); // body with faction tabard
  p2.add(vc(soldierBody(f.cloth)));

  const p3 = phaseGroup(); // kettle helmet, sword, round shield
  p3.add(vc([
    part(new THREE.CylinderGeometry(0.036, 0.046, 0.035, 7), PALETTE.steel, { t: [0, 0.335, 0] }),
    part(new THREE.SphereGeometry(0.036, 6, 4), PALETTE.steel, { t: [0, 0.34, 0], s: [1, 0.7, 1] }),
    // sword held point-down in right hand
    part(new THREE.BoxGeometry(0.014, 0.16, 0.028), PALETTE.steel, { rz: 0.25, t: [0.105, 0.16, 0.02] }),
    part(new THREE.BoxGeometry(0.05, 0.014, 0.03), PALETTE.ironBand, { rz: 0.25, t: [0.09, 0.225, 0.02] }),
    // round shield on left arm
    part(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 9), f.cloth, { rz: Math.PI / 2, t: [-0.1, 0.19, 0] }),
  ]));

  const p4 = phaseGroup(); // shield boss + belt pouch
  p4.add(vc([
    part(new THREE.SphereGeometry(0.016, 5, 4), PALETTE.steelDark, { t: [-0.108, 0.19, 0], s: [0.6, 1, 1] }),
    part(new THREE.BoxGeometry(0.035, 0.04, 0.02), PALETTE.leather, { t: [0.05, 0.125, 0.04] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= ARCHER =================
// Footprint 0.2 × 0.14, height ≈ 0.38.
export function makeUnitArcher(rng, faction = null) {
  const f = FACTIONS[faction || rng.pick(FACTION_IDS)];

  const p1 = phaseGroup();
  p1.add(unitBasePlate());

  const p2 = phaseGroup(); // body: leather jerkin over faction cloth
  p2.add(vc([
    ...soldierBody(PALETTE.leather, f.cloth),
    part(new THREE.BoxGeometry(0.125, 0.05, 0.075), f.cloth, { t: [0, 0.24, 0] }),
  ]));

  const p3 = phaseGroup(); // hood, bow, quiver on the back
  p3.add(vc([
    part(new THREE.ConeGeometry(0.045, 0.06, 6), PALETTE.leatherDark, { t: [0, 0.345, 0] }),
    // bow: half-torus held in left hand, facing forward
    part(new THREE.TorusGeometry(0.085, 0.008, 4, 10, Math.PI), PALETTE.trunk, { rz: Math.PI / 2, t: [-0.1, 0.2, 0.02] }),
    part(new THREE.BoxGeometry(0.004, 0.17, 0.004), PALETTE.ropeTan, { t: [-0.1, 0.2, 0.02] }),
    // quiver slung on the back (-Z)
    part(new THREE.CylinderGeometry(0.026, 0.03, 0.14, 6), PALETTE.leather, { rx: -0.25, t: [0.04, 0.23, -0.055] }),
  ]));

  const p4 = phaseGroup(); // arrow fletchings poking from the quiver
  p4.add(vc([
    part(new THREE.ConeGeometry(0.012, 0.03, 4), PALETTE.flag, { t: [0.03, 0.315, -0.075] }),
    part(new THREE.ConeGeometry(0.012, 0.03, 4), PALETTE.wallPlaster, { t: [0.055, 0.325, -0.08] }),
    part(new THREE.ConeGeometry(0.012, 0.03, 4), PALETTE.flag, { t: [0.045, 0.305, -0.095] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= KNIGHT =================
// Footprint 0.22 × 0.16, height ≈ 0.5 (slightly taller elite unit).
export function makeUnitKnight(rng, faction = null) {
  const f = FACTIONS[faction || rng.pick(FACTION_IDS)];

  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.CylinderGeometry(0.095, 0.105, 0.022, 7), PALETTE.rockDark, { t: [0, 0.011, 0] })]));

  const p2 = phaseGroup(); // armored body, tabard over steel
  p2.add(vc([
    part(new THREE.BoxGeometry(0.095, 0.11, 0.06), PALETTE.steelDark, { t: [0, 0.077, 0] }),
    part(new THREE.BoxGeometry(0.13, 0.16, 0.075), PALETTE.steel, { t: [0, 0.21, 0] }),
    part(new THREE.BoxGeometry(0.09, 0.155, 0.08), f.cloth, { t: [0, 0.21, 0.002] }),
    part(new THREE.BoxGeometry(0.032, 0.13, 0.05), PALETTE.steel, { t: [-0.08, 0.21, 0] }),
    part(new THREE.BoxGeometry(0.032, 0.13, 0.05), PALETTE.steel, { t: [0.08, 0.21, 0] }),
  ]));

  const p3 = phaseGroup(); // great helm, lance, kite shield
  p3.add(vc([
    part(new THREE.CylinderGeometry(0.042, 0.044, 0.075, 7), PALETTE.steel, { t: [0, 0.33, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.012, 0.02), PALETTE.charcoal, { t: [0, 0.335, 0.038] }),
    // upright lance in right hand
    part(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 5), PALETTE.signWood, { t: [0.105, 0.28, 0.02] }),
    part(new THREE.ConeGeometry(0.014, 0.05, 5), PALETTE.steel, { t: [0.105, 0.515, 0.02] }),
    // kite shield: tapered box on left arm
    part(new THREE.BoxGeometry(0.014, 0.13, 0.08), f.cloth, { s: [1, 1, 1], t: [-0.105, 0.19, 0.01] }),
    part(new THREE.ConeGeometry(0.04, 0.05, 4), f.cloth, { rx: Math.PI, ry: Math.PI / 4, s: [0.35, 1, 2], t: [-0.105, 0.1, 0.01] }),
  ]));

  const p4 = phaseGroup(); // plume + lance pennant
  p4.add(vc([
    part(new THREE.ConeGeometry(0.016, 0.06, 5), f.cloth, { rx: -0.4, t: [0, 0.39, -0.015] }),
  ]));
  const pennant = new THREE.PlaneGeometry(0.09, 0.045, 4, 1);
  pennant.translate(0.045, 0, 0);
  const pen = new THREE.Mesh(pennant, f.flagMat());
  pen.position.set(0.105, 0.47, 0.02);
  p4.add(pen);
  return wrap([p1, p2, p3, p4]);
}

// ================= SIEGE CATAPULT =================
// Footprint 0.6 × 0.44, height ≈ 0.5. Throws toward +Z.
export function makeSiegeCatapult(rng) {
  const p1 = phaseGroup(); // skid frame
  p1.add(vc([
    part(new THREE.BoxGeometry(0.06, 0.05, 0.52), PALETTE.siegeWood, { t: [-0.15, 0.05, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.05, 0.52), PALETTE.siegeWood, { t: [0.15, 0.05, 0] }),
    part(new THREE.BoxGeometry(0.36, 0.045, 0.06), PALETTE.woodBeam, { t: [0, 0.05, -0.2] }),
    part(new THREE.BoxGeometry(0.36, 0.045, 0.06), PALETTE.woodBeam, { t: [0, 0.05, 0.2] }),
  ]));

  const p2 = phaseGroup(); // wheels + axles
  p2.add(vc([
    part(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 4), PALETTE.woodBeam, { rz: Math.PI / 2, t: [0, 0.075, -0.2] }),
    part(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 4), PALETTE.woodBeam, { rz: Math.PI / 2, t: [0, 0.075, 0.2] }),
    ...wheelParts(-0.21, 0.075, -0.2, 0.075),
    ...wheelParts(0.21, 0.075, -0.2, 0.075),
    ...wheelParts(-0.21, 0.075, 0.2, 0.075),
    ...wheelParts(0.21, 0.075, 0.2, 0.075),
  ]));

  const p3 = phaseGroup(); // A-frame + throwing arm cocked back
  const arm = new THREE.BoxGeometry(0.04, 0.48, 0.025);
  arm.translate(0, 0.2, 0);
  arm.rotateX(-0.75);
  p3.add(vc([
    // A-frame uprights leaning inward
    part(new THREE.BoxGeometry(0.045, 0.3, 0.045), PALETTE.siegeWood, { rz: 0.2, t: [-0.13, 0.2, 0.04] }),
    part(new THREE.BoxGeometry(0.045, 0.3, 0.045), PALETTE.siegeWood, { rz: -0.2, t: [0.13, 0.2, 0.04] }),
    // pivot crossbar
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 5), PALETTE.woodBeam, { rz: Math.PI / 2, t: [0, 0.32, 0.04] }),
    // arm angled back over the frame, bucket at the tip
    part(arm, PALETTE.siegeWood, { t: [0, 0.3, 0.05] }),
    part(new THREE.BoxGeometry(0.09, 0.05, 0.09), PALETTE.leather, { rx: -0.4, t: [0, 0.62, -0.24] }),
    // counterweight box at the short front end
    part(new THREE.BoxGeometry(0.12, 0.1, 0.08), PALETTE.ironBand, { t: [0, 0.24, 0.16] }),
  ]));

  const p4 = phaseGroup(); // loaded rock, winch rope, ammo pile
  p4.add(vc([
    part(new THREE.SphereGeometry(0.035, 5, 4), PALETTE.rock, { t: [0, 0.655, -0.24] }),
    part(new THREE.BoxGeometry(0.012, 0.012, 0.3), PALETTE.ropeTan, { rx: -0.5, t: [0.04, 0.42, -0.1] }),
    part(new THREE.SphereGeometry(0.04, 5, 4), PALETTE.rock, { t: [-0.24, 0.035, 0.14] }),
    part(new THREE.SphereGeometry(0.035, 5, 4), PALETTE.rockDark, { t: [-0.28, 0.03, 0.05] }),
    part(new THREE.SphereGeometry(0.03, 5, 4), PALETTE.stonePile, { t: [-0.21, 0.075, 0.09] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= SIEGE RAM =================
// Footprint 0.62 × 0.32, height ≈ 0.42. Ram head faces +Z.
export function makeSiegeRam(rng) {
  const p1 = phaseGroup(); // platform + wheels
  p1.add(vc([
    part(new THREE.BoxGeometry(0.28, 0.04, 0.56), PALETTE.siegeWood, { t: [0, 0.1, 0] }),
    ...wheelParts(-0.15, 0.07, -0.19, 0.07),
    ...wheelParts(0.15, 0.07, -0.19, 0.07),
    ...wheelParts(-0.15, 0.07, 0.19, 0.07),
    ...wheelParts(0.15, 0.07, 0.19, 0.07),
  ]));

  const p2 = phaseGroup(); // corner posts + ridge beam
  p2.add(vc([
    part(new THREE.BoxGeometry(0.04, 0.26, 0.04), PALETTE.siegeWood, { rz: 0.14, t: [-0.11, 0.25, -0.22] }),
    part(new THREE.BoxGeometry(0.04, 0.26, 0.04), PALETTE.siegeWood, { rz: -0.14, t: [0.11, 0.25, -0.22] }),
    part(new THREE.BoxGeometry(0.04, 0.26, 0.04), PALETTE.siegeWood, { rz: 0.14, t: [-0.11, 0.25, 0.22] }),
    part(new THREE.BoxGeometry(0.04, 0.26, 0.04), PALETTE.siegeWood, { rz: -0.14, t: [0.11, 0.25, 0.22] }),
    part(new THREE.BoxGeometry(0.035, 0.035, 0.56), PALETTE.woodBeam, { t: [0, 0.39, 0] }),
  ]));

  const p3 = phaseGroup(); // hide-covered gable roof
  const roofGeo = new THREE.CylinderGeometry(0.012, 0.22, 0.14, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, 2.1);
  p3.add(vc([
    part(roofGeo, PALETTE.leather, { t: [0, 0.43, 0] }),
    part(new THREE.BoxGeometry(0.24, 0.02, 0.5), PALETTE.leatherDark, { t: [0, 0.375, 0] }),
  ]));

  const p4 = phaseGroup(); // suspended ram log with iron head + ropes
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.042, 0.042, 0.52, 6), PALETTE.trunk, { rx: Math.PI / 2, t: [0, 0.24, 0.02] }),
    part(new THREE.CylinderGeometry(0.052, 0.045, 0.08, 6), PALETTE.ramHead, { rx: Math.PI / 2, t: [0, 0.24, 0.3] }),
    part(new THREE.BoxGeometry(0.012, 0.14, 0.012), PALETTE.ropeTan, { t: [0, 0.32, -0.16] }),
    part(new THREE.BoxGeometry(0.012, 0.14, 0.012), PALETTE.ropeTan, { t: [0, 0.32, 0.16] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= ARMY BANNER =================
// Footprint 0.14 × 0.14, height ≈ 0.8. Faction variants red/blue/green.
export function makeArmyBanner(rng, faction = null) {
  const fid = faction || rng.pick(FACTION_IDS);
  const f = FACTIONS[fid];

  const p1 = phaseGroup(); // rock mound anchor
  p1.add(vc([
    part(new THREE.SphereGeometry(0.05, 5, 4), PALETTE.rock, { t: [0.03, 0.02, 0.02], s: [1, 0.6, 1] }),
    part(new THREE.SphereGeometry(0.04, 5, 4), PALETTE.rockDark, { t: [-0.04, 0.018, -0.02], s: [1, 0.6, 1] }),
    part(new THREE.SphereGeometry(0.035, 5, 4), PALETTE.stonePile, { t: [0, 0.02, -0.045], s: [1, 0.6, 1] }),
  ]));

  const p2 = phaseGroup(); // pole + gilded finial
  p2.add(vc([
    part(new THREE.CylinderGeometry(0.013, 0.017, 0.74, 5), PALETTE.woodBeam, { t: [0, 0.37, 0] }),
    part(new THREE.SphereGeometry(0.022, 6, 5), PALETTE.goldCoin, { t: [0, 0.76, 0] }),
  ]));

  const p3 = phaseGroup(); // large waving faction cloth
  const cloth = new THREE.PlaneGeometry(0.3, 0.16, 8, 1);
  cloth.translate(0.15, 0, 0);
  const flag = new THREE.Mesh(cloth, f.flagMat());
  flag.position.set(0.015, 0.64, 0);
  p3.add(flag);

  const p4 = phaseGroup(); // tassel cords + leaning shield at the base
  p4.add(vc([
    part(new THREE.BoxGeometry(0.01, 0.06, 0.01), PALETTE.ropeTan, { t: [0.02, 0.53, 0] }),
    part(new THREE.SphereGeometry(0.012, 4, 3), PALETTE.goldDeep, { t: [0.02, 0.495, 0] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.013, 9), f.cloth, { rx: 0.5, rz: Math.PI / 2, t: [0.055, 0.05, 0.03] }),
  ]));
  return wrap([p1, p2, p3, p4]);
}

// ================= ARCHER TOWER =================
// Footprint 0.38 × 0.38, height ≈ 0.95. Combat tower with a
// wooden hoarding gallery — distinct from the watchtower.
export function makeTowerArcher(rng) {
  const p1 = phaseGroup(); // heavy stepped base
  p1.add(vc([
    part(new THREE.BoxGeometry(0.38, 0.06, 0.38), PALETTE.rockDark, { t: [0, 0.03, 0] }),
    part(new THREE.BoxGeometry(0.32, 0.06, 0.32), PALETTE.wallStoneB, { t: [0, 0.09, 0] }),
  ]));

  const p2 = phaseGroup(); // stone shaft with arrow slits on all faces
  const shaft = [
    part(new THREE.BoxGeometry(0.26, 0.5, 0.26), PALETTE.wallStone, { t: [0, 0.37, 0] }),
    part(new THREE.BoxGeometry(0.28, 0.04, 0.28), PALETTE.rockDark, { t: [0, 0.37, 0] }),
  ];
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    shaft.push(part(new THREE.BoxGeometry(0.025, 0.1, 0.02), PALETTE.charcoal, { ry, t: [
      Math.sin(ry) * 0.131, 0.48, Math.cos(ry) * 0.131,
    ] }));
  }
  p2.add(vc(shaft));

  const p3 = phaseGroup(); // overhanging wooden hoarding + slate cap
  const roofGeo = new THREE.ConeGeometry(0.26, 0.16, 4);
  p3.add(vc([
    part(new THREE.BoxGeometry(0.36, 0.035, 0.36), PALETTE.trunk, { t: [0, 0.64, 0] }),
    part(new THREE.BoxGeometry(0.34, 0.12, 0.34), PALETTE.woodBeam, { t: [0, 0.71, 0] }),
    // archer slot openings in the hoarding
    part(new THREE.BoxGeometry(0.07, 0.05, 0.02), PALETTE.charcoal, { t: [0, 0.72, 0.171] }),
    part(new THREE.BoxGeometry(0.02, 0.05, 0.07), PALETTE.charcoal, { t: [0.171, 0.72, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.05, 0.07), PALETTE.charcoal, { t: [-0.171, 0.72, 0] }),
    // support struts under the overhang
    part(new THREE.BoxGeometry(0.03, 0.1, 0.03), PALETTE.trunk, { rz: 0.6, t: [-0.16, 0.6, 0.12] }),
    part(new THREE.BoxGeometry(0.03, 0.1, 0.03), PALETTE.trunk, { rz: -0.6, t: [0.16, 0.6, -0.12] }),
    part(roofGeo, PALETTE.roofSlate, { ry: Math.PI / 4, t: [0, 0.85, 0] }),
  ]));

  const p4 = phaseGroup(); // faction flag + entry torch
  const fl = makeFactionFlag(0.26, rng.pick(FACTION_IDS));
  fl.position.y = 0.93;
  p4.add(fl);
  const torchPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 4), MATS.woodBeam);
  torchPole.position.set(0.18, 0.16, 0.18);
  p4.add(torchPole);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 5), MATS.torchFlame);
  flame.position.set(0.18, 0.27, 0.18);
  p4.add(flame);
  return wrap([p1, p2, p3, p4]);
}

// ================= BALLISTA TOWER =================
// Footprint 0.36 × 0.36, height ≈ 0.85. Ballista aims toward +Z.
export function makeTowerBallista(rng) {
  const p1 = phaseGroup();
  p1.add(vc([part(new THREE.CylinderGeometry(0.19, 0.22, 0.08, 6), PALETTE.rockDark, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup(); // stout stone drum
  p2.add(vc([
    part(new THREE.CylinderGeometry(0.15, 0.18, 0.42, 6), PALETTE.wallStoneB, { t: [0, 0.29, 0] }),
    part(new THREE.BoxGeometry(0.05, 0.09, 0.03), PALETTE.charcoal, { t: [0, 0.34, 0.16] }),
  ]));

  const p3 = phaseGroup(); // open platform + parapet + ballista
  const plat = [
    part(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 6), PALETTE.rockDark, { t: [0, 0.525, 0] }),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    plat.push(part(new THREE.BoxGeometry(0.07, 0.06, 0.04), PALETTE.wallStoneB, {
      ry: a, t: [Math.sin(a) * 0.165, 0.58, Math.cos(a) * 0.165],
    }));
  }
  // ballista: pedestal, stock, bow arms, tension frame
  plat.push(part(new THREE.CylinderGeometry(0.035, 0.045, 0.08, 6), PALETTE.siegeWood, { t: [0, 0.59, 0] }));
  plat.push(part(new THREE.BoxGeometry(0.045, 0.03, 0.26), PALETTE.siegeWood, { rx: -0.15, t: [0, 0.655, 0.02] }));
  plat.push(part(new THREE.BoxGeometry(0.2, 0.022, 0.022), PALETTE.woodBeam, { ry: 0.5, rx: -0.15, t: [0.07, 0.675, 0.12] }));
  plat.push(part(new THREE.BoxGeometry(0.2, 0.022, 0.022), PALETTE.woodBeam, { ry: -0.5, rx: -0.15, t: [-0.07, 0.675, 0.12] }));
  p3.add(vc(plat));

  const p4 = phaseGroup(); // loaded bolt + bolt rack + flag
  p4.add(vc([
    part(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 4), PALETTE.woodBeam, { rx: Math.PI / 2 - 0.15, t: [0, 0.675, 0.05] }),
    part(new THREE.ConeGeometry(0.014, 0.04, 4), PALETTE.steel, { rx: Math.PI / 2 - 0.15, t: [0, 0.693, 0.17] }),
    part(new THREE.BoxGeometry(0.06, 0.03, 0.1), PALETTE.crateWood, { t: [-0.1, 0.555, -0.08] }),
  ]));
  const fl = makeFactionFlag(0.22, rng.pick(FACTION_IDS));
  fl.position.set(-0.12, 0.55, 0.1);
  p4.add(fl);
  return wrap([p1, p2, p3, p4]);
}

// ================= WALL SEGMENT (player-built, 4 phases) =================
// Spans one hex edge (length 1.0 along X), depth 0.16, height ≈ 0.5.
// WallSystem's staged walls stay separate; this is the constructible one.
export function makeWallSegmentBuilt(rng) {
  const p1 = phaseGroup(); // footing
  p1.add(vc([part(new THREE.BoxGeometry(1.0, 0.08, 0.16), PALETTE.rockDark, { t: [0, 0.04, 0] })]));

  const p2 = phaseGroup(); // wall body
  p2.add(vc([part(new THREE.BoxGeometry(0.98, 0.3, 0.12), PALETTE.wallStone, { t: [0, 0.23, 0] })]));

  const p3 = phaseGroup(); // walkway + crenellations
  const crenels = [part(new THREE.BoxGeometry(1.0, 0.045, 0.15), PALETTE.rockDark, { t: [0, 0.4, 0] })];
  for (let i = 0; i < 5; i++) {
    const x = (i / 4 - 0.5) * 0.86;
    crenels.push(part(new THREE.BoxGeometry(0.09, 0.07, 0.13), PALETTE.wallStone, { t: [x, 0.455, 0] }));
  }
  p3.add(vc(crenels));

  const p4 = phaseGroup(); // torch bowls
  for (const x of [-0.32, 0.32]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.14, 4), MATS.woodBeam);
    pole.position.set(x, 0.47, 0);
    p4.add(pole);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), MATS.lantern);
    bowl.position.set(x, 0.56, 0);
    p4.add(bowl);
  }
  return wrap([p1, p2, p3, p4]);
}

// ================= WALL GATE =================
// Spans one hex edge (1.0 along X), depth 0.24, height ≈ 0.72.
// Gate opening faces ±Z (road passes through).
export function makeWallGate(rng) {
  const p1 = phaseGroup(); // base slab + cobble threshold
  p1.add(vc([
    part(new THREE.BoxGeometry(1.0, 0.08, 0.2), PALETTE.rockDark, { t: [0, 0.04, 0] }),
    part(new THREE.BoxGeometry(0.24, 0.085, 0.26), PALETTE.road, { t: [0, 0.042, 0] }),
  ]));

  const p2 = phaseGroup(); // twin gate towers + flanking wall stubs
  p2.add(vc([
    part(new THREE.BoxGeometry(0.16, 0.56, 0.2), PALETTE.wallStoneB, { t: [-0.21, 0.36, 0] }),
    part(new THREE.BoxGeometry(0.16, 0.56, 0.2), PALETTE.wallStoneB, { t: [0.21, 0.36, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.3, 0.12), PALETTE.wallStone, { t: [-0.4, 0.23, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.3, 0.12), PALETTE.wallStone, { t: [0.4, 0.23, 0] }),
  ]));

  const p3 = phaseGroup(); // lintel bridge, crenellations, tower caps
  const top = [
    part(new THREE.BoxGeometry(0.28, 0.12, 0.18), PALETTE.wallStone, { t: [0, 0.5, 0] }),
    part(new THREE.BoxGeometry(0.3, 0.04, 0.2), PALETTE.rockDark, { t: [0, 0.58, 0] }),
    part(new THREE.BoxGeometry(0.08, 0.06, 0.16), PALETTE.wallStone, { t: [0, 0.63, 0] }),
  ];
  for (const x of [-0.21, 0.21]) {
    top.push(part(new THREE.BoxGeometry(0.2, 0.04, 0.24), PALETTE.rockDark, { t: [x, 0.66, 0] }));
    top.push(part(new THREE.ConeGeometry(0.13, 0.14, 4), PALETTE.roofSlate, { ry: Math.PI / 4, t: [x, 0.75, 0] }));
  }
  // arch shoulders over the opening
  top.push(part(new THREE.BoxGeometry(0.04, 0.08, 0.18), PALETTE.wallStoneB, { t: [-0.11, 0.42, 0] }));
  top.push(part(new THREE.BoxGeometry(0.04, 0.08, 0.18), PALETTE.wallStoneB, { t: [0.11, 0.42, 0] }));
  p3.add(vc(top));

  const p4 = phaseGroup(); // wooden doors ajar + banner + torches
  p4.add(vc([
    part(new THREE.BoxGeometry(0.1, 0.36, 0.025), PALETTE.woodBeam, { ry: 0.35, t: [-0.085, 0.26, 0.05] }),
    part(new THREE.BoxGeometry(0.1, 0.36, 0.025), PALETTE.woodBeam, { ry: -0.35, t: [0.085, 0.26, 0.05] }),
    part(new THREE.BoxGeometry(0.1, 0.02, 0.03), PALETTE.ironBand, { ry: 0.35, t: [-0.085, 0.36, 0.05] }),
    part(new THREE.BoxGeometry(0.1, 0.02, 0.03), PALETTE.ironBand, { ry: -0.35, t: [0.085, 0.36, 0.05] }),
  ]));
  const fl = makeFactionFlag(0.24, rng.pick(FACTION_IDS));
  fl.position.set(-0.21, 0.78, 0);
  p4.add(fl);
  for (const x of [-0.13, 0.13]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.06, 5), MATS.torchFlame);
    flame.position.set(x, 0.47, 0.12);
    p4.add(flame);
  }
  return wrap([p1, p2, p3, p4]);
}

// ================= WALL CORNER BASTION =================
// Footprint 0.4 × 0.4, height ≈ 0.68. Round tower joining wall runs.
export function makeWallTowerCorner(rng) {
  const p1 = phaseGroup(); // splayed footing
  p1.add(vc([part(new THREE.CylinderGeometry(0.18, 0.22, 0.1, 7), PALETTE.rockDark, { t: [0, 0.05, 0] })]));

  const p2 = phaseGroup(); // drum with string course
  p2.add(vc([
    part(new THREE.CylinderGeometry(0.15, 0.17, 0.42, 7), PALETTE.wallStone, { t: [0, 0.31, 0] }),
    part(new THREE.CylinderGeometry(0.165, 0.165, 0.035, 7), PALETTE.rockDark, { t: [0, 0.31, 0] }),
    part(new THREE.BoxGeometry(0.03, 0.08, 0.02), PALETTE.charcoal, { t: [0, 0.4, 0.15] }),
  ]));

  const p3 = phaseGroup(); // machicolated overhang + crenellations
  const top = [part(new THREE.CylinderGeometry(0.19, 0.16, 0.07, 7), PALETTE.rockDark, { t: [0, 0.555, 0] })];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    top.push(part(new THREE.BoxGeometry(0.07, 0.08, 0.045), PALETTE.wallStone, {
      ry: a, t: [Math.sin(a) * 0.165, 0.63, Math.cos(a) * 0.165],
    }));
  }
  p3.add(vc(top));

  const p4 = phaseGroup(); // faction flag + brazier glow
  const fl = makeFactionFlag(0.26, rng.pick(FACTION_IDS));
  fl.position.y = 0.6;
  p4.add(fl);
  const brazier = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), MATS.lantern);
  brazier.position.set(0.09, 0.61, 0.09);
  p4.add(brazier);
  return wrap([p1, p2, p3, p4]);
}

// -------- deterministic variant dispatchers (one rng draw) --------

const GARRISON_VARIANTS = [makeUnitSwordsman, makeUnitArcher, makeUnitKnight];
export function makeGarrison(rng) {
  return rng.pick(GARRISON_VARIANTS)(rng);
}

const SIEGE_VARIANTS = [makeSiegeCatapult, makeSiegeRam];
export function makeSiegeCamp(rng) {
  return rng.pick(SIEGE_VARIANTS)(rng);
}

/** registry fragment merged into BUILDING_MAKERS by BuildingFactory */
export const MILITARY_MAKERS = {
  // caravans & trade
  caravanWagon: makeCaravanWagon,
  caravanLoaded: makeCaravanLoaded,
  tradeMarker: makeTradeRoadMarker,
  // units (rng-picked faction; explicit color via second arg)
  unitSwordsman: makeUnitSwordsman,
  unitArcher: makeUnitArcher,
  unitKnight: makeUnitKnight,
  siegeCatapult: makeSiegeCatapult,
  siegeRam: makeSiegeRam,
  // banners
  armyBanner: makeArmyBanner,
  bannerRed: (rng) => makeArmyBanner(rng, 'red'),
  bannerBlue: (rng) => makeArmyBanner(rng, 'blue'),
  bannerGreen: (rng) => makeArmyBanner(rng, 'green'),
  garrison: makeGarrison,
  siegeCamp: makeSiegeCamp,
  // defense
  towerArcher: makeTowerArcher,
  towerBallista: makeTowerBallista,
  wallSegment: makeWallSegmentBuilt,
  wallGate: makeWallGate,
  wallCorner: makeWallTowerCorner,
};
