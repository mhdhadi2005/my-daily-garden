// ============================================================
// NatureAssets — procedural low-poly nature geometry.
// Each asset is a single merged vertex-colored BufferGeometry
// with a high-detail and a low-detail (LOD) variant.
// ============================================================
import * as THREE from 'three';
import { part, merge } from './GeometryUtils.js';
import { PALETTE } from '../rendering/Materials.js';

// ---------- Tree type A: layered conifer ----------
function treeA(detail) {
  const seg = detail ? 6 : 4;
  const parts = [
    part(new THREE.CylinderGeometry(0.05, 0.07, 0.35, seg), PALETTE.trunk, { t: [0, 0.17, 0] }),
    part(new THREE.ConeGeometry(0.34, 0.5, seg), PALETTE.leafA, { t: [0, 0.5, 0] }),
    part(new THREE.ConeGeometry(0.26, 0.45, seg), PALETTE.leafB, { t: [0, 0.8, 0] }),
    part(new THREE.ConeGeometry(0.17, 0.38, seg), PALETTE.leafA, { t: [0, 1.08, 0] }),
  ];
  return merge(parts);
}

// ---------- Tree type B: round deciduous ----------
function treeB(detail) {
  const seg = detail ? 1 : 0;
  const parts = [
    part(new THREE.CylinderGeometry(0.06, 0.09, 0.45, detail ? 6 : 4), PALETTE.trunk, { t: [0, 0.22, 0] }),
    part(new THREE.IcosahedronGeometry(0.34, seg), PALETTE.leafC, { t: [0, 0.68, 0] }),
    part(new THREE.IcosahedronGeometry(0.22, seg), PALETTE.leafB, { t: [0.2, 0.55, 0.08] }),
    part(new THREE.IcosahedronGeometry(0.19, seg), PALETTE.leafB, { t: [-0.17, 0.58, -0.1] }),
  ];
  return merge(parts);
}

// ---------- Rock ----------
function rock(detail) {
  const parts = [
    part(new THREE.IcosahedronGeometry(0.22, 0), PALETTE.rock, { t: [0, 0.1, 0], s: [1, 0.7, 1] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.13, 0), PALETTE.rockDark, {
      t: [0.18, 0.06, 0.1], s: [1, 0.6, 1],
    }));
  }
  return merge(parts);
}

// ---------- Bush ----------
function bush(detail) {
  const parts = [
    part(new THREE.IcosahedronGeometry(0.18, 0), PALETTE.bush, { t: [0, 0.12, 0], s: [1, 0.75, 1] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.12, 0), PALETTE.leafB, { t: [0.14, 0.09, 0.06] }));
  }
  return merge(parts);
}

// ---------- Flowers (small cluster) ----------
function flowers(detail) {
  const colors = [PALETTE.flower1, PALETTE.flower2, PALETTE.flower3];
  const parts = [];
  const n = detail ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.08;
    parts.push(part(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 3), PALETTE.bush, { t: [x, 0.07, z] }));
    parts.push(part(new THREE.SphereGeometry(0.035, 5, 4), colors[i % 3], { t: [x, 0.16, z] }));
  }
  return merge(parts);
}

// ---------- Grass tuft ----------
function grassTuft() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(part(new THREE.ConeGeometry(0.025, 0.18, 3), PALETTE.grassDark, {
      t: [Math.cos(a) * 0.04, 0.09, Math.sin(a) * 0.04], ry: a,
    }));
  }
  return merge(parts);
}

// ---------- Crop row (wheat) ----------
function crop(detail) {
  const parts = [];
  const n = detail ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * 0.28;
    parts.push(part(new THREE.CylinderGeometry(0.012, 0.018, 0.22, 3), PALETTE.crop, { t: [x, 0.11, 0] }));
    parts.push(part(new THREE.SphereGeometry(0.035, 4, 3), PALETTE.fieldDark, { t: [x, 0.24, 0], s: [1, 1.6, 1] }));
  }
  return merge(parts);
}

// ============================================================
// WORLD CONTENT EXPANSION — extra nature assets (extension only)
// ============================================================

// ---------- Oak: broad trunk, wide layered canopy ----------
function oakTree(detail) {
  const seg = detail ? 6 : 4;
  const ico = detail ? 1 : 0;
  const parts = [
    part(new THREE.CylinderGeometry(0.07, 0.11, 0.5, seg), PALETTE.trunk, { t: [0, 0.25, 0] }),
    part(new THREE.CylinderGeometry(0.03, 0.045, 0.22, 4), PALETTE.trunk, { t: [0.14, 0.5, 0.05], ry: 0.4 }),
    part(new THREE.IcosahedronGeometry(0.4, ico), PALETTE.leafA, { t: [0, 0.78, 0], s: [1.15, 0.85, 1.15] }),
    part(new THREE.IcosahedronGeometry(0.26, ico), PALETTE.leafB, { t: [0.28, 0.64, 0.12] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.22, ico), PALETTE.leafC, { t: [-0.24, 0.68, -0.14] }));
    parts.push(part(new THREE.IcosahedronGeometry(0.18, ico), PALETTE.leafB, { t: [0.05, 0.98, -0.05] }));
  }
  return merge(parts);
}

// ---------- Pine: tall dark narrow conifer ----------
function pineTree(detail) {
  const seg = detail ? 6 : 4;
  const parts = [
    part(new THREE.CylinderGeometry(0.04, 0.06, 0.5, seg), PALETTE.trunk, { t: [0, 0.25, 0] }),
    part(new THREE.ConeGeometry(0.26, 0.5, seg), PALETTE.leafPine, { t: [0, 0.6, 0] }),
    part(new THREE.ConeGeometry(0.2, 0.45, seg), PALETTE.leafPine, { t: [0, 0.92, 0] }),
    part(new THREE.ConeGeometry(0.13, 0.4, seg), PALETTE.leafA, { t: [0, 1.22, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.ConeGeometry(0.07, 0.24, seg), PALETTE.leafPine, { t: [0, 1.46, 0] }));
  }
  return merge(parts);
}

// ---------- Birch: pale trunk with dark marks, light canopy ----------
function birchTree(detail) {
  const seg = detail ? 6 : 4;
  const ico = detail ? 1 : 0;
  const parts = [
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.62, seg), PALETTE.birchBark, { t: [0, 0.31, 0] }),
    part(new THREE.IcosahedronGeometry(0.24, ico), PALETTE.leafBirch, { t: [0, 0.74, 0], s: [1, 1.25, 1] }),
  ];
  if (detail) {
    // dark bark marks
    parts.push(part(new THREE.BoxGeometry(0.055, 0.03, 0.04), PALETTE.birchMark, { t: [0.015, 0.22, 0.015] }));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.025, 0.045), PALETTE.birchMark, { t: [-0.015, 0.42, -0.01] }));
    parts.push(part(new THREE.IcosahedronGeometry(0.14, ico), PALETTE.leafC, { t: [0.14, 0.6, 0.06] }));
  }
  return merge(parts);
}

// ---------- Dead tree: bare gnarled branches ----------
function deadTree(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.035, 0.07, 0.55, 5), PALETTE.deadWood, { t: [0, 0.27, 0] }),
    part(new THREE.CylinderGeometry(0.015, 0.03, 0.3, 4), PALETTE.deadWood, {
      t: [0.13, 0.55, 0.02], ry: 0.3, s: [1, 1, 1],
    }),
  ];
  // tilt the branch
  const branch = new THREE.CylinderGeometry(0.012, 0.026, 0.26, 4);
  branch.rotateZ(-0.7);
  parts.push(part(branch, PALETTE.deadWood, { t: [-0.1, 0.48, -0.03] }));
  if (detail) {
    const twig = new THREE.CylinderGeometry(0.008, 0.014, 0.18, 3);
    twig.rotateZ(0.9);
    parts.push(part(twig, PALETTE.deadWood, { t: [0.16, 0.66, 0.04] }));
    parts.push(part(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 3), PALETTE.deadWood, { t: [0, 0.6, 0.06], ry: 1 }));
  }
  return merge(parts);
}

// ---------- Cherry: pink blossom canopy ----------
function cherryTree(detail) {
  const seg = detail ? 6 : 4;
  const ico = detail ? 1 : 0;
  const parts = [
    part(new THREE.CylinderGeometry(0.05, 0.08, 0.42, seg), PALETTE.trunk, { t: [0, 0.21, 0] }),
    part(new THREE.IcosahedronGeometry(0.3, ico), PALETTE.cherryPink, { t: [0, 0.62, 0], s: [1.15, 0.9, 1.15] }),
    part(new THREE.IcosahedronGeometry(0.18, ico), PALETTE.cherryDeep, { t: [0.2, 0.52, 0.1] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.15, ico), PALETTE.cherryPink, { t: [-0.18, 0.56, -0.1] }));
  }
  return merge(parts);
}

// ---------- Apple: green canopy dotted with red fruit ----------
function appleTree(detail) {
  const seg = detail ? 6 : 4;
  const ico = detail ? 1 : 0;
  const parts = [
    part(new THREE.CylinderGeometry(0.05, 0.08, 0.4, seg), PALETTE.trunk, { t: [0, 0.2, 0] }),
    part(new THREE.IcosahedronGeometry(0.3, ico), PALETTE.leafB, { t: [0, 0.6, 0], s: [1.1, 0.95, 1.1] }),
  ];
  const fruit = detail ? 4 : 1;
  for (let i = 0; i < fruit; i++) {
    const a = (i / fruit) * Math.PI * 2 + 0.6;
    parts.push(part(new THREE.SphereGeometry(0.035, 4, 3), PALETTE.appleRed, {
      t: [Math.cos(a) * 0.26, 0.56 + (i % 2) * 0.12, Math.sin(a) * 0.26],
    }));
  }
  return merge(parts);
}

// ---------- Large rock: chunky boulder cluster ----------
function rockLarge(detail) {
  const parts = [
    part(new THREE.IcosahedronGeometry(0.34, 0), PALETTE.rock, { t: [0, 0.16, 0], s: [1.15, 0.75, 1] }),
    part(new THREE.IcosahedronGeometry(0.2, 0), PALETTE.rockDark, { t: [0.28, 0.09, 0.12], s: [1, 0.65, 1] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.13, 0), PALETTE.rock, { t: [-0.26, 0.06, -0.1], s: [1, 0.6, 1.1] }));
  }
  return merge(parts);
}

// ---------- Small rock: single pebble ----------
function rockSmall(detail) {
  const parts = [
    part(new THREE.IcosahedronGeometry(0.1, 0), PALETTE.rock, { t: [0, 0.05, 0], s: [1.1, 0.6, 0.9] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.06, 0), PALETTE.rockDark, { t: [0.09, 0.03, 0.04], s: [1, 0.55, 1] }));
  }
  return merge(parts);
}

// ---------- Moss rock: boulder with mossy top ----------
function rockMoss(detail) {
  const parts = [
    part(new THREE.IcosahedronGeometry(0.2, 0), PALETTE.rock, { t: [0, 0.09, 0], s: [1.1, 0.7, 1] }),
    part(new THREE.IcosahedronGeometry(0.15, 0), PALETTE.moss, { t: [0, 0.15, 0], s: [1.15, 0.45, 1.05] }),
  ];
  if (detail) {
    parts.push(part(new THREE.IcosahedronGeometry(0.09, 0), PALETTE.moss, { t: [0.13, 0.05, 0.08], s: [1, 0.5, 1] }));
  }
  return merge(parts);
}

// ---------- Tree stump ----------
function stump(detail) {
  const seg = detail ? 7 : 5;
  const parts = [
    part(new THREE.CylinderGeometry(0.09, 0.12, 0.12, seg), PALETTE.trunk, { t: [0, 0.06, 0] }),
    part(new THREE.CylinderGeometry(0.085, 0.085, 0.015, seg), PALETTE.deadWood, { t: [0, 0.125, 0] }),
  ];
  if (detail) {
    // root flare
    parts.push(part(new THREE.BoxGeometry(0.06, 0.05, 0.05), PALETTE.trunk, { t: [0.11, 0.025, 0.02], ry: 0.4 }));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.04, 0.06), PALETTE.trunk, { t: [-0.1, 0.02, -0.04], ry: -0.5 }));
  }
  return merge(parts);
}

// ---------- Fallen log ----------
function fallenLog(detail) {
  const seg = detail ? 6 : 4;
  const log = new THREE.CylinderGeometry(0.07, 0.08, 0.55, seg);
  log.rotateZ(Math.PI / 2);
  const parts = [part(log, PALETTE.deadWood, { t: [0, 0.07, 0] })];
  if (detail) {
    parts.push(part(new THREE.CylinderGeometry(0.065, 0.065, 0.012, seg), PALETTE.trunk, {
      t: [0.28, 0.07, 0], s: [1, 1, 1],
    }));
    parts.push(part(new THREE.IcosahedronGeometry(0.06, 0), PALETTE.moss, { t: [-0.1, 0.13, 0.01], s: [1.4, 0.5, 1] }));
  }
  return merge(parts);
}

// ---------- Fern: arching fronds ----------
function fern(detail) {
  const parts = [];
  const n = detail ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const frond = new THREE.ConeGeometry(0.035, 0.24, 3);
    frond.translate(0, 0.12, 0);
    frond.rotateX(0.85);
    frond.rotateY(a);
    parts.push(part(frond, PALETTE.fern, { t: [0, 0.03, 0] }));
  }
  return merge(parts);
}

// ---------- Mushroom cluster ----------
function mushrooms(detail) {
  const parts = [];
  const n = detail ? 3 : 2;
  const spots = [[0, 0], [0.07, 0.05], [-0.06, 0.06]];
  for (let i = 0; i < n; i++) {
    const [x, z] = spots[i];
    const h = 0.06 + i * 0.02;
    parts.push(part(new THREE.CylinderGeometry(0.014, 0.02, h, 4), PALETTE.mushStem, { t: [x, h / 2, z] }));
    parts.push(part(new THREE.SphereGeometry(0.04 - i * 0.006, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2),
      PALETTE.mushroomCap, { t: [x, h, z] }));
  }
  if (detail) {
    parts.push(part(new THREE.SphereGeometry(0.008, 3, 2), PALETTE.mushroomDot, { t: [0.015, 0.085, 0.02] }));
  }
  return merge(parts);
}

// ---------- Tall grass ----------
function tallGrass(detail) {
  const parts = [];
  const n = detail ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    parts.push(part(new THREE.ConeGeometry(0.02, 0.3, 3), PALETTE.grassDark, {
      t: [Math.cos(a) * 0.05, 0.15, Math.sin(a) * 0.05], ry: a,
    }));
  }
  return merge(parts);
}

// ---------- Dry grass ----------
function dryGrass(detail) {
  const parts = [];
  const n = detail ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.8;
    parts.push(part(new THREE.ConeGeometry(0.022, 0.2, 3), PALETTE.grassDry, {
      t: [Math.cos(a) * 0.045, 0.1, Math.sin(a) * 0.045], ry: a,
    }));
  }
  return merge(parts);
}

// ---------- Reeds: tall stalks with brown seed heads ----------
function reeds(detail) {
  const parts = [];
  const n = detail ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.5;
    const x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
    const h = 0.32 + (i % 2) * 0.08;
    parts.push(part(new THREE.CylinderGeometry(0.008, 0.012, h, 3), PALETTE.reed, { t: [x, h / 2, z] }));
    parts.push(part(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 4), PALETTE.reedHead, { t: [x, h + 0.03, z] }));
  }
  return merge(parts);
}

// ---------- Lily pads: flat discs + optional flower ----------
function lilyPads(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 6), PALETTE.lilyPad, { t: [0, 0.006, 0] }),
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 6), PALETTE.lilyPad, { t: [0.13, 0.006, 0.08] }),
  ];
  if (detail) {
    parts.push(part(new THREE.ConeGeometry(0.03, 0.05, 5), PALETTE.lilyFlower, { t: [0, 0.035, 0] }));
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 6), PALETTE.lilyPad, { t: [-0.11, 0.006, -0.07] }));
  }
  return merge(parts);
}

// ---------- Water plants: submerged leafy tufts ----------
function waterPlants(detail) {
  const parts = [];
  const n = detail ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 1.1;
    const blade = new THREE.ConeGeometry(0.02, 0.16, 3);
    blade.rotateX(0.35);
    blade.rotateY(a);
    parts.push(part(blade, PALETTE.waterPlant, {
      t: [Math.cos(a) * 0.05, 0.07, Math.sin(a) * 0.05],
    }));
  }
  return merge(parts);
}

// ---------- Wildflower variants (purple / orange mixes) ----------
function wildflowersA(detail) {
  const colors = [PALETTE.flower4, PALETTE.flower3, PALETTE.flower1];
  const parts = [];
  const n = detail ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 0.09, z = Math.sin(a) * 0.09;
    parts.push(part(new THREE.CylinderGeometry(0.007, 0.009, 0.16, 3), PALETTE.bush, { t: [x, 0.08, z] }));
    parts.push(part(new THREE.SphereGeometry(0.032, 5, 4), colors[i % 3], { t: [x, 0.18, z] }));
  }
  return merge(parts);
}

function wildflowersB(detail) {
  const colors = [PALETTE.flower5, PALETTE.flower2, PALETTE.flower4];
  const parts = [];
  const n = detail ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 1.7;
    const x = Math.cos(a) * 0.08, z = Math.sin(a) * 0.08;
    parts.push(part(new THREE.CylinderGeometry(0.007, 0.009, 0.13, 3), PALETTE.fern, { t: [x, 0.065, z] }));
    parts.push(part(new THREE.ConeGeometry(0.03, 0.045, 5), colors[i % 3], { t: [x, 0.15, z] }));
  }
  return merge(parts);
}

// ============================================================
// DECORATION ASSETS — village / field / forest props
// ============================================================

// ---------- Barrel ----------
function barrel(detail) {
  const seg = detail ? 7 : 5;
  const parts = [
    part(new THREE.CylinderGeometry(0.08, 0.09, 0.14, seg), PALETTE.barrelWood, { t: [0, 0.07, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.TorusGeometry(0.082, 0.008, 4, seg), PALETTE.barrelBand, { t: [0, 0.11, 0], ry: 0, s: [1, 1, 1] }));
    parts.push(part(new THREE.TorusGeometry(0.084, 0.008, 4, seg), PALETTE.barrelBand, { t: [0, 0.04, 0] }));
  }
  return merge(parts);
}

// ---------- Crate ----------
function crate(detail) {
  const s = 0.1;
  const parts = [
    part(new THREE.BoxGeometry(s, s, s), PALETTE.crateWood, { t: [0, s / 2, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.BoxGeometry(s + 0.01, 0.012, 0.012), PALETTE.barrelBand, { t: [0, s * 0.3, s / 2 + 0.006] }));
    parts.push(part(new THREE.BoxGeometry(s + 0.01, 0.012, 0.012), PALETTE.barrelBand, { t: [0, s * 0.3, -s / 2 - 0.006] }));
  }
  return merge(parts);
}

// ---------- Bench ----------
function bench(detail) {
  const parts = [
    part(new THREE.BoxGeometry(0.22, 0.02, 0.08), PALETTE.fence, { t: [0, 0.12, 0] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.025), PALETTE.fence, { t: [-0.09, 0.06, -0.03] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.025), PALETTE.fence, { t: [0.09, 0.06, -0.03] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.025), PALETTE.fence, { t: [-0.09, 0.06, 0.03] }),
    part(new THREE.BoxGeometry(0.025, 0.12, 0.025), PALETTE.fence, { t: [0.09, 0.06, 0.03] }),
  ];
  if (detail) {
    parts.push(part(new THREE.BoxGeometry(0.22, 0.015, 0.015), PALETTE.fence, { t: [0, 0.19, -0.03] }));
  }
  return merge(parts);
}

// ---------- Fence segment ----------
function fenceSegment(detail) {
  const parts = [
    part(new THREE.BoxGeometry(0.02, 0.14, 0.02), PALETTE.fence, { t: [-0.1, 0.07, 0] }),
    part(new THREE.BoxGeometry(0.02, 0.14, 0.02), PALETTE.fence, { t: [0.1, 0.07, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.018, 0.015), PALETTE.fence, { t: [0, 0.1, 0] }),
    part(new THREE.BoxGeometry(0.22, 0.018, 0.015), PALETTE.fence, { t: [0, 0.055, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.BoxGeometry(0.22, 0.015, 0.012), PALETTE.fence, { t: [0, 0.14, 0] }));
  }
  return merge(parts);
}

// ---------- Wagon ----------
function wagon(detail) {
  const parts = [
    part(new THREE.BoxGeometry(0.32, 0.08, 0.2), PALETTE.crateWood, { t: [0, 0.1, 0] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, detail ? 8 : 5), PALETTE.wagonWheel, { t: [-0.13, 0.05, 0.12] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, detail ? 8 : 5), PALETTE.wagonWheel, { t: [0.13, 0.05, 0.12] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, detail ? 8 : 5), PALETTE.wagonWheel, { t: [-0.13, 0.05, -0.12] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.02, detail ? 8 : 5), PALETTE.wagonWheel, { t: [0.13, 0.05, -0.12] }),
  ];
  if (detail) {
    const pole = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4);
    pole.rotateX(Math.PI / 2);
    parts.push(part(pole, PALETTE.fence, { t: [0, 0.14, 0.2] }));
  }
  return merge(parts);
}

// ---------- Cart (small handcart) ----------
function cart(detail) {
  const parts = [
    part(new THREE.BoxGeometry(0.18, 0.06, 0.12), PALETTE.crateWood, { t: [0, 0.1, 0] }),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.018, detail ? 7 : 4), PALETTE.wagonWheel, { t: [-0.06, 0.04, 0.07] }),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.018, detail ? 7 : 4), PALETTE.wagonWheel, { t: [0.06, 0.04, 0.07] }),
  ];
  if (detail) {
    const handle = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 3);
    handle.rotateX(Math.PI / 2);
    parts.push(part(handle, PALETTE.fence, { t: [0, 0.16, -0.14] }));
  }
  return merge(parts);
}

// ---------- Hay bale (round) ----------
function hayBale(detail) {
  const seg = detail ? 8 : 5;
  const parts = [
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.12, seg), PALETTE.hay, { t: [0, 0.06, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.TorusGeometry(0.102, 0.006, 4, seg), PALETTE.fence, { t: [0, 0.1, 0] }));
  }
  return merge(parts);
}

// ---------- Well (stone + wood roof) ----------
function well(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 8), PALETTE.wallStoneB, { t: [0, 0.05, 0] }),
    part(new THREE.CylinderGeometry(0.13, 0.13, 0.01, 8), PALETTE.waterDeep, { t: [0, 0.105, 0] }),
  ];
  if (detail) {
    const post = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4);
    parts.push(part(post, PALETTE.fence, { t: [0.14, 0.21, 0] }));
    parts.push(part(post, PALETTE.fence, { t: [-0.14, 0.21, 0] }));
    const roof = new THREE.ConeGeometry(0.18, 0.08, 4);
    parts.push(part(roof, PALETTE.roofThatch, { t: [0, 0.37, 0], ry: Math.PI / 4 }));
  }
  return merge(parts);
}

// ---------- Lamp post ----------
function lampPost(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.012, 0.016, 0.28, 4), PALETTE.woodBeam, { t: [0, 0.14, 0] }),
    part(new THREE.CylinderGeometry(0.04, 0.03, 0.06, detail ? 6 : 4), PALETTE.lantern, { t: [0, 0.31, 0] }),
  ];
  if (detail) {
    const arm = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 3);
    arm.rotateZ(Math.PI / 2);
    parts.push(part(arm, PALETTE.woodBeam, { t: [0, 0.33, 0] }));
  }
  return merge(parts);
}

// ---------- Torch ----------
function torch(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.014, 0.02, 0.2, 4), PALETTE.deadWood, { t: [0, 0.1, 0] }),
    part(new THREE.ConeGeometry(0.025, 0.06, 4), PALETTE.fire, { t: [0, 0.22, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.ConeGeometry(0.015, 0.04, 3), PALETTE.lantern, { t: [0.008, 0.26, 0] }));
  }
  return merge(parts);
}

// ---------- Signpost ----------
function signpost(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.012, 0.015, 0.24, 4), PALETTE.signWood, { t: [0, 0.12, 0] }),
    part(new THREE.BoxGeometry(0.12, 0.06, 0.012), PALETTE.signWood, { t: [0.04, 0.24, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.BoxGeometry(0.008, 0.008, 0.018), PALETTE.woodBeam, { t: [0, 0.24, 0] }));
  }
  return merge(parts);
}

// ---------- Scarecrow ----------
function scarecrow(detail) {
  const parts = [
    part(new THREE.CylinderGeometry(0.012, 0.015, 0.28, 4), PALETTE.fence, { t: [0, 0.14, 0] }),
    part(new THREE.SphereGeometry(0.04, detail ? 5 : 3, detail ? 4 : 3), PALETTE.hay, { t: [0, 0.32, 0] }),
    part(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 3), PALETTE.fence, { t: [0, 0.24, 0] }),
  ];
  if (detail) {
    parts.push(part(new THREE.BoxGeometry(0.08, 0.05, 0.01), PALETTE.roofThatch, { t: [0, 0.35, 0] }));
  }
  return merge(parts);
}

/**
 * Build the full nature asset library.
 * Each entry: { hi, lo, windy } — geometry variants + material flavor.
 */
export function buildNatureAssets() {
  return {
    treeA:   { hi: treeA(true),  lo: treeA(false),  windy: true },
    treeB:   { hi: treeB(true),  lo: treeB(false),  windy: true },
    rock:    { hi: rock(true),   lo: rock(false),   windy: false },
    bush:    { hi: bush(true),   lo: bush(false),   windy: true },
    flowers: { hi: flowers(true),lo: flowers(false),windy: 'strong' },
    grass:   { hi: grassTuft(),  lo: grassTuft(),   windy: 'strong' },
    crop:    { hi: crop(true),   lo: crop(false),   windy: 'strong' },

    // ---- world content expansion (extension only) ----
    oak:         { hi: oakTree(true),      lo: oakTree(false),      windy: true },
    pine:        { hi: pineTree(true),     lo: pineTree(false),     windy: true },
    birch:       { hi: birchTree(true),    lo: birchTree(false),    windy: true },
    deadTree:    { hi: deadTree(true),     lo: deadTree(false),     windy: false },
    cherry:      { hi: cherryTree(true),   lo: cherryTree(false),   windy: true },
    apple:       { hi: appleTree(true),    lo: appleTree(false),    windy: true },
    rockLarge:   { hi: rockLarge(true),    lo: rockLarge(false),    windy: false },
    rockSmall:   { hi: rockSmall(true),    lo: rockSmall(false),    windy: false },
    rockMoss:    { hi: rockMoss(true),     lo: rockMoss(false),     windy: false },
    stump:       { hi: stump(true),        lo: stump(false),        windy: false },
    fallenLog:   { hi: fallenLog(true),    lo: fallenLog(false),    windy: false },
    fern:        { hi: fern(true),         lo: fern(false),         windy: 'strong' },
    mushrooms:   { hi: mushrooms(true),    lo: mushrooms(false),    windy: false },
    tallGrass:   { hi: tallGrass(true),    lo: tallGrass(false),    windy: 'strong' },
    dryGrass:    { hi: dryGrass(true),     lo: dryGrass(false),     windy: 'strong' },
    reeds:       { hi: reeds(true),        lo: reeds(false),        windy: 'strong' },
    lilyPads:    { hi: lilyPads(true),     lo: lilyPads(false),     windy: false },
    waterPlants: { hi: waterPlants(true),  lo: waterPlants(false),  windy: 'strong' },
    wildflowersA:{ hi: wildflowersA(true), lo: wildflowersA(false), windy: 'strong' },
    wildflowersB:{ hi: wildflowersB(true), lo: wildflowersB(false), windy: 'strong' },

    // ---- decoration props ----
    barrel:      { hi: barrel(true),      lo: barrel(false),      windy: false },
    crate:       { hi: crate(true),       lo: crate(false),       windy: false },
    bench:       { hi: bench(true),       lo: bench(false),       windy: false },
    fenceSeg:    { hi: fenceSegment(true), lo: fenceSegment(false), windy: false },
    wagon:       { hi: wagon(true),       lo: wagon(false),       windy: false },
    cart:        { hi: cart(true),        lo: cart(false),        windy: false },
    hayBale:     { hi: hayBale(true),     lo: hayBale(false),     windy: false },
    well:        { hi: well(true),        lo: well(false),        windy: false },
    lampPost:    { hi: lampPost(true),    lo: lampPost(false),    windy: false },
    torch:       { hi: torch(true),       lo: torch(false),       windy: false },
    signpost:    { hi: signpost(true),    lo: signpost(false),    windy: false },
    scarecrow:   { hi: scarecrow(true),   lo: scarecrow(false),   windy: false },
  };
}
