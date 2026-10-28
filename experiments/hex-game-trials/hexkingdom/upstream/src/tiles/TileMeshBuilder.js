// ============================================================
// TileMeshBuilder — constructs the static base mesh of a tile:
// hex ground, river strips, road strips, mountain massifs.
// Dynamic props (trees, houses…) are added later by systems.
// ============================================================
import * as THREE from 'three';
import { MATS, PALETTE } from '../rendering/Materials.js';
import { edgeAngle, HEX_SIZE } from '../grid/Hex.js';
import { part, merge } from '../assets/GeometryUtils.js';

const APOTHEM = HEX_SIZE * Math.sqrt(3) / 2;
export const TILE_H = 0.22; // hex prism height

export let skipConnectorMeshes = false;
export function setSkipConnectorMeshes(v) { skipConnectorMeshes = v; }

// cached hex prism geometry (pointy-top: edge 0 faces +X)
let _hexGeo = null;
export function hexPrismGeometry() {
  if (!_hexGeo) {
    _hexGeo = new THREE.CylinderGeometry(HEX_SIZE * 0.985, HEX_SIZE * 1.02, TILE_H, 6, 1, false, Math.PI / 3);
    _hexGeo.translate(0, TILE_H / 2, 0);
    _hexGeo.userData.shared = true;
  }
  return _hexGeo;
}

let _hexFlatGeo = null;
export function hexFlatGeometry() {
  if (!_hexFlatGeo) {
    _hexFlatGeo = new THREE.CylinderGeometry(HEX_SIZE * 0.96, HEX_SIZE * 0.96, 0.02, 6, 1, false, Math.PI / 3);
    _hexFlatGeo.userData.shared = true;
  }
  return _hexFlatGeo;
}

/** thin strip from tile center to edge i midpoint (road / river) */
function edgeStrip(i, width, y, material) {
  const len = APOTHEM + 0.06;
  const geo = new THREE.BoxGeometry(len, 0.03, width);
  geo.translate(len / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.rotation.y = edgeAngle(i);
  return mesh;
}

function groundMaterialFor(type) {
  switch (type) {
    case 'forest': return MATS.grassDark;
    case 'field': return MATS.field;
    case 'river': return MATS.grass;
    case 'mountain': return MATS.rockDark;
    case 'village': return MATS.grass;
    case 'lake': return MATS.sand;
    case 'meadow': return MATS.grass;
    case 'swamp': return MATS.swamp;
    case 'hills': return MATS.grassDark;
    case 'quarry': return MATS.rockDark;
    case 'ruins': return MATS.grassDark;
    default: return MATS.grass;
  }
}

/** merged low-poly mountain massif with snow caps */
function mountainMassif(rng) {
  const parts = [];
  const peaks = rng.int(2, 3);
  for (let p = 0; p < peaks; p++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 0.34);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = rng.range(0.55, 1.05);
    const r = rng.range(0.3, 0.45);
    parts.push(part(new THREE.ConeGeometry(r, h, 5), PALETTE.rock, { t: [x, h / 2, z], ry: rng.range(0, 2) }));
    // snow cap
    parts.push(part(new THREE.ConeGeometry(r * 0.42, h * 0.32, 5), PALETTE.snow, {
      t: [x, h - h * 0.16 + 0.01, z], ry: rng.range(0, 2),
    }));
  }
  return new THREE.Mesh(merge(parts), MATS.vcStatic);
}

/**
 * Build tile base group.
 * @param cell {tileType, rotation, riverEdges, roadEdges}
 * @param rng seeded per-cell Rng
 */
export function buildTileMesh(cell, rng) {
  const group = new THREE.Group();

  // --- hex ground prism ---
  const base = new THREE.Mesh(hexPrismGeometry(), groundMaterialFor(cell.tileType));
  base.receiveShadow = true;
  group.add(base);

  const topY = TILE_H;

  // --- river strips ---
  if (!skipConnectorMeshes && cell.riverEdges && cell.riverEdges.length) {
    // river bed (darker) + animated water on top
    for (const e of cell.riverEdges) {
      const bed = edgeStrip(e, 0.36, topY + 0.005, MATS.dirt);
      group.add(bed);
      const water = edgeStrip(e, 0.28, topY + 0.028, MATS.water);
      group.add(water);
    }
    // pond at the middle joining strips
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 8), MATS.water);
    pond.position.y = topY + 0.028;
    group.add(pond);
  }

  // --- road strips ---
  if (!skipConnectorMeshes && cell.roadEdges && cell.roadEdges.length) {
    for (const e of cell.roadEdges) {
      group.add(edgeStrip(e, 0.3, topY + 0.02, MATS.road));
    }
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.028, 8), MATS.road);
    plaza.position.y = topY + 0.02;
    group.add(plaza);
  }

  // --- mountain massif ---
  if (cell.tileType === 'mountain') {
    const m = mountainMassif(rng);
    m.position.y = topY;
    group.add(m);
  }

  // --- lake: large central water body with sandy shore ---
  if (!skipConnectorMeshes && cell.tileType === 'lake') {
    const shore = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.02, 8), MATS.dirt);
    shore.position.y = topY + 0.004;
    group.add(shore);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.03, 8), MATS.water);
    water.position.y = topY + 0.026;
    group.add(water);
  }

  // --- swamp: murky pools + dead trunks ---
  if (cell.tileType === 'swamp') {
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.15, 0.55);
      const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(rng.range(0.14, 0.24), rng.range(0.16, 0.26), 0.022, 7),
        MATS.swampWater
      );
      pool.position.set(Math.cos(a) * d, topY + 0.012, Math.sin(a) * d);
      group.add(pool);
    }
    const snags = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.2, 0.6);
      snags.push(part(new THREE.CylinderGeometry(0.025, 0.045, rng.range(0.3, 0.5), 5),
        PALETTE.deadWood, { t: [Math.cos(a) * d, 0.18, Math.sin(a) * d], ry: rng.range(0, 2) }));
    }
    const s = new THREE.Mesh(merge(snags), MATS.vcStatic);
    s.position.y = topY;
    group.add(s);
  }

  // --- hills: gentle grassy mounds ---
  if (cell.tileType === 'hills') {
    const mounds = [];
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.05, 0.4);
      const r = rng.range(0.28, 0.46);
      mounds.push(part(new THREE.SphereGeometry(r, 7, 5), PALETTE.grass, {
        t: [Math.cos(a) * d, -r * 0.55, Math.sin(a) * d], s: [1, 0.65, 1],
      }));
    }
    const m = new THREE.Mesh(merge(mounds), MATS.vcStatic);
    m.position.y = topY;
    group.add(m);
  }

  // --- quarry: terraced stone pit + rubble ---
  if (cell.tileType === 'quarry') {
    const pitParts = [
      part(new THREE.CylinderGeometry(0.55, 0.62, 0.05, 7), PALETTE.rock, { t: [0, 0.025, 0] }),
      part(new THREE.CylinderGeometry(0.38, 0.46, 0.06, 7), PALETTE.rockDark, { t: [0, 0.06, 0] }),
      part(new THREE.CylinderGeometry(0.2, 0.28, 0.05, 7), PALETTE.rock, { t: [0, 0.1, 0] }),
    ];
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.55, 0.75);
      pitParts.push(part(new THREE.BoxGeometry(0.12, 0.1, 0.1), PALETTE.rockDark, {
        t: [Math.cos(a) * d, 0.05, Math.sin(a) * d], ry: rng.range(0, 2),
      }));
    }
    const pit = new THREE.Mesh(merge(pitParts), MATS.vcStatic);
    pit.position.y = topY;
    group.add(pit);
  }

  // --- ruins: broken columns + collapsed walls ---
  if (cell.tileType === 'ruins') {
    const ruinParts = [];
    const cols = rng.int(3, 5);
    for (let i = 0; i < cols; i++) {
      const a = (i / cols) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const d = rng.range(0.25, 0.5);
      const h = rng.range(0.12, 0.42);
      ruinParts.push(part(new THREE.CylinderGeometry(0.05, 0.06, h, 6), PALETTE.ruinStone, {
        t: [Math.cos(a) * d, h / 2, Math.sin(a) * d],
      }));
    }
    ruinParts.push(part(new THREE.BoxGeometry(0.4, rng.range(0.08, 0.18), 0.08), PALETTE.ruinStone, {
      t: [rng.range(-0.2, 0.2), 0.06, rng.range(-0.2, 0.2)], ry: rng.range(0, 3),
    }));
    ruinParts.push(part(new THREE.BoxGeometry(0.1, 0.05, 0.1), PALETTE.ruinStone, {
      t: [rng.range(-0.4, 0.4), 0.025, rng.range(-0.4, 0.4)], ry: rng.range(0, 3),
    }));
    const ru = new THREE.Mesh(merge(ruinParts), MATS.vcStatic);
    ru.position.y = topY;
    group.add(ru);
  }

  // --- field furrows: alternating darker strips ---
  if (cell.tileType === 'field') {
    const furrows = [];
    for (let i = -2; i <= 2; i++) {
      furrows.push(part(new THREE.BoxGeometry(1.35 - Math.abs(i) * 0.22, 0.015, 0.09),
        PALETTE.fieldDark, { t: [0, 0, i * 0.24] }));
    }
    const f = new THREE.Mesh(merge(furrows), MATS.vcStatic);
    f.position.y = topY + 0.008;
    f.rotation.y = rng.range(0, Math.PI);
    group.add(f);
  }

  // --- forest floor: scattered rocks + fallen twigs + small flower clusters ---
  if (cell.tileType === 'forest') {
    const floorParts = [];
    const nrocks = rng.int(1, 3);
    for (let i = 0; i < nrocks; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.2, 0.55);
      const r = rng.range(0.03, 0.07);
      floorParts.push(part(new THREE.IcosahedronGeometry(r, 0), PALETTE.rock, {
        t: [Math.cos(a) * d, r * 0.4, Math.sin(a) * d], s: [1.1, 0.6, 1],
      }));
    }
    // small flower patches
    const nflowers = rng.int(0, 2);
    const flowerColors = [PALETTE.flower1, PALETTE.flower2, PALETTE.flower3];
    for (let i = 0; i < nflowers; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.25, 0.55);
      const fc = flowerColors[rng.int(0, 2)];
      floorParts.push(part(new THREE.SphereGeometry(0.025, 4, 3), fc, {
        t: [Math.cos(a) * d, 0.04, Math.sin(a) * d],
      }));
    }
    if (floorParts.length) {
      const fm = new THREE.Mesh(merge(floorParts), MATS.vcStatic);
      fm.position.y = topY;
      group.add(fm);
    }
  }

  // --- mountain: scattered boulders at base ---
  if (cell.tileType === 'mountain') {
    const boulders = [];
    const nb = rng.int(1, 3);
    for (let i = 0; i < nb; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.35, 0.6);
      const r = rng.range(0.06, 0.12);
      boulders.push(part(new THREE.IcosahedronGeometry(r, 0), PALETTE.rockDark, {
        t: [Math.cos(a) * d, r * 0.35, Math.sin(a) * d], s: [1.15, 0.7, 1],
      }));
    }
    if (boulders.length) {
      const bm = new THREE.Mesh(merge(boulders), MATS.vcStatic);
      bm.position.y = topY;
      group.add(bm);
    }
  }

  // --- village: dirt path splatters near road edges ---
  if (cell.tileType === 'village') {
    const pathParts = [];
    const npath = rng.int(1, 2);
    for (let i = 0; i < npath; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.1, 0.4);
      pathParts.push(part(new THREE.CylinderGeometry(
        rng.range(0.06, 0.14), rng.range(0.08, 0.16), 0.012, 6
      ), PALETTE.dirt, { t: [Math.cos(a) * d, 0.006, Math.sin(a) * d] }));
    }
    if (pathParts.length) {
      const pm = new THREE.Mesh(merge(pathParts), MATS.vcStatic);
      pm.position.y = topY;
      group.add(pm);
    }
  }

  // --- river: small stone pebbles along banks ---
  if (cell.tileType === 'river') {
    const pebbles = [];
    const np = rng.int(1, 3);
    for (let i = 0; i < np; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.28, 0.55);
      pebbles.push(part(new THREE.IcosahedronGeometry(rng.range(0.025, 0.05), 0), PALETTE.rock, {
        t: [Math.cos(a) * d, 0.02, Math.sin(a) * d], s: [1, 0.5, 1],
      }));
    }
    if (pebbles.length) {
      const pm = new THREE.Mesh(merge(pebbles), MATS.vcStatic);
      pm.position.y = topY;
      group.add(pm);
    }
  }

  return group;
}
