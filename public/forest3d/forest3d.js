/* ===================================================================
   My Daily Garden — 3D hex forest
   Harvested trees stand on hex tiles, with the river, animals and
   waterfalls readers build around them. The tree you're growing now stays
   the 2D drawing in app.js; this module only draws the forest around it and
   reports where the centre hex lands on screen so app.js can stand that
   tree on it.

   Models: tree-reference.glb, from experiments/clay-almonds/reference_trees.py
   (Blender), matched to Harry's reference dioramas.
   Served as forest3d.min.js (three.js bundled in): after editing this file,
   run  npm run build:forest
   =================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

// Tiered pines (P) and round trees (R). Blossom looks get a round tree in
// flower; of the rest, two in three are pines. For comparing shapes:
// &style=p  pines only   &style=r  round trees only
const STYLE = (new URLSearchParams(window.location.search).get("style") || "g").toLowerCase();
const MODEL_URL = new URL("./tree-reference.glb", import.meta.url).href;

// Each tree look's canopy colours (shadow, mid, highlight) and, for the
// flowering looks, its blossom colours. Same looks as tree-stages.js,
// brightened a touch for the clay finish.
const LOOKS = {
  blossom: { canopy: ["#5FA35A", "#7CC36B", "#A6DD8C"], flowers: ["#F7A8BC", "#FFD3DE"] },
  white:   { canopy: ["#5E9F63", "#7DBE7F", "#AEDDA9"], flowers: ["#FFFFFF", "#FFF2F5"] },
  spring:  { canopy: ["#7BB443", "#9CD055", "#C8EA7C"], flowers: null },
  summer:  { canopy: ["#3F8A4E", "#55A65F", "#7FC484"], flowers: null },
  autumn:  { canopy: ["#D9782E", "#F0973D", "#FBC165"], flowers: null },
  golden:  { canopy: ["#C9A42C", "#E3C243", "#F4DD7A"], flowers: null },
};

// Flat-top hex grid used by the Blender study: axial (q, r) → world x/z.
const hexToWorld = (q, r) => new THREE.Vector3(2.25 * q, 0, -2.6 * (r + q / 2));
// Centre (0,0) is the reader's current tree. The hex straight in front of it
// holds the pond — a tree there would stand in front of the 2D tree drawn on
// top of the canvas, which would read as the wrong way round.
const POND_HEX = [0, -1];
// Animals of the reference picture (reference_trees.py). Which hexes get one, and which animal, is fixed per hex.
const ANIMAL_MIX = ["deer", "rabbit", "fox", "sheep", "deer", "rabbit", "boar", "stag", "fox", "sheep"];
const ANIMAL_CHANCE = 55; // per cent of tiles
const ANIMAL_SCALE = 1.3;
const cellHash = (q, r) => {
  let h = (Math.imul(q, 73856093) ^ Math.imul(r, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
};
// Where each harvested tree stands comes from the reader's saved layout
// (rules: hex-layout.js), not from here.

// A kit builds the pieces: tile(q, r), pond(), tree(t) … — each a fresh Object3D.
let kit = null;
function loadKit() {
  kit ??= referenceKit();
  return kit;
}

// TREE_P0 … TREE_R2 (three shape variants of each design), six dressed
// grass tiles, the pond, animals, a bird and the waterfall rocks.
async function referenceKit() {
  const { scene } = await new GLTFLoader().loadAsync(MODEL_URL);
  const piece = (name) => {
    const o = scene.getObjectByName(name);
    if (!o) throw new Error(`the tree model has no ${name}`);
    o.position.set(0, 0, 0);
    return o;
  };
  // The reference set dresses its grass tile six ways (mushrooms, a stump, bushes, rocks …).
  // A tile's dressing and the spot it keeps free for an animal turn together, so they share a group.
  const dressed = (tile) => {
    const dress = new THREE.Group();
    dress.name = "dress";
    tile.children.filter((c) => /_(decor|spot)$/.test(c.name)).forEach((c) => dress.add(c));
    tile.add(dress);
    return tile;
  };
  const grasses = [0, 1, 2, 3, 4, 5].map((i) => dressed(piece(`TILE_grass${i}`)));
  const pond = piece("TILE_pond");
  const optional = (name) => { const o = scene.getObjectByName(name); if (o) o.position.set(0, 0, 0); return o || null; };
  const animals = Object.fromEntries([...new Set(ANIMAL_MIX)].map((kind) => [kind, optional(`ANIMAL_${kind}`)]));
  const falls = optional("PROP_falls"), fallsOpen = optional("PROP_falls_open"), bird = optional("ANIMAL_bird");
  const designs = Object.fromEntries([..."PR"].map((d) => [d, [0, 1, 2].map((v) => piece(`TREE_${d}${v}`))]));
  const designFor = (t) => {
    if (STYLE === "p" || STYLE === "r") return STYLE.toUpperCase();
    const look = LOOKS[t.look];
    return (look && look.flowers) || t.num % 3 === 0 ? "R" : "P";
  };
  const swaps = new Map(); // look:material → recoloured copy (keeps the baked shading in vertex colours)
  return {
    // Each hex keeps its own dressing; the centre, under the growing tree, is the open meadow.
    // (q + 3r keeps any two neighbouring hexes different; the dressing is also turned
    // a sixth of a turn either way, so repeats of one dressing don't look alike.)
    // life: about half the tiles also get an animal on their free spot — always
    // the same animal on the same hex, facing roughly towards the reader.
    tile: (q = 0, r = 0, { life = false } = {}) => {
      const n = grasses.length, tile = grasses[q || r ? (((q + 3 * r) % n) + n) % n : 0].clone();
      const dress = tile.getObjectByName("dress");
      if (!dress) return tile;
      dress.rotation.y = (((((2 * q - r) % 3) + 3) % 3) - 1) * Math.PI / 3;
      const spot = dress.children.find((c) => c.name.endsWith("_spot"));
      const h = cellHash(q, r), kind = ANIMAL_MIX[(h >>> 8) % ANIMAL_MIX.length];
      if (life && spot && animals[kind] && h % 100 < ANIMAL_CHANCE) {
        const animal = animals[kind].clone();
        animal.scale.multiplyScalar(ANIMAL_SCALE);
        animal.rotation.y = -Math.PI / 2 + ((((h >>> 4) % 150) - 75) * Math.PI) / 180 - dress.rotation.y;
        animal.userData.critter = { kind, phase: (h % 628) / 100, size: animal.scale.y };
        spot.add(animal);
      }
      return tile;
    },
    pond: () => pond.clone(),
    // The rocks a river's source pours out of. open: bare on one side (the model's -z), for a river that turns that way.
    falls: falls ? (open = false) => ((open && fallsOpen) || falls).clone() : null,
    bird: bird ? () => bird.clone() : null,
    tree: (t) => {
      const L = LOOKS[t.look] || LOOKS.blossom;
      const colours = {
        Leaf_C: L.canopy[0], Leaf_B: L.canopy[1], Leaf_A: L.canopy[2], Ball_B: L.canopy[1],
        Blossom_Pink: L.flowers && L.flowers[0], Blossom_White: L.flowers && L.flowers[1],
      };
      const tree = designs[designFor(t)][(t.num * 7) % 3].clone();
      tree.traverse((o) => {
        if (o.name.includes("_blossom")) o.visible = !!L.flowers; // a design-E tree without a blossom look shows just its canopy
        if (!o.isMesh) return;
        const swap = (m) => {
          const colour = colours[m.name];
          if (!colour) return m;
          const key = `${t.look}:${m.name}`;
          if (!swaps.has(key)) { const c = m.clone(); c.color.set(colour); swaps.set(key, c); }
          return swaps.get(key);
        };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
      return tree;
    },
    toneMapping: THREE.NeutralToneMapping,
    lights: { sky: 2.4, key: 2.1, exposure: 1 },
  };
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const views = new WeakMap(); // container → live view, so a re-render reuses its renderer

// Translucent hex marking a spot a picked-up tree can move to.
const TARGET_GEOMETRY = new THREE.CylinderGeometry(1.32, 1.32, 0.08, 6);
TARGET_GEOMETRY.rotateY(Math.PI / 6); // flat-top, matching the tiles
// Pale and bright so the spots stand out against the green woodland backdrop.
const TARGET_MATERIAL = new THREE.MeshBasicMaterial({ color: "#FFF7DC", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
const TARGET_RIM = new THREE.LineBasicMaterial({ color: "#3E8E5A", toneMapped: false });
const TARGET_EDGES = new THREE.EdgesGeometry(TARGET_GEOMETRY);
const WATER_TARGET_MATERIAL = new THREE.MeshBasicMaterial({ color: "#DDF2FA", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
const WATER_TARGET_RIM = new THREE.LineBasicMaterial({ color: "#2F86B0", toneMapped: false });
const SELECTED_MATERIAL = new THREE.MeshBasicMaterial({ color: "#F2A23A", transparent: true, opacity: 0.75, depthWrite: false });

// Arranging: a gold outline round the top of each tile you can pick up, and
// round the one you've picked up, which also lifts, glows and bobs.
const OUTLINE_GEOMETRY = new THREE.RingGeometry(1.2, 1.42, 6, 1);
OUTLINE_GEOMETRY.rotateX(-Math.PI / 2); // flat on the tile; the ring's corners fall on the hex's corners
const TAPPABLE_OUTLINE = new THREE.MeshBasicMaterial({ color: "#FFD45C", transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
const PICKED_OUTLINE = new THREE.MeshBasicMaterial({ color: "#FFB020", transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
const LIFT_HEIGHT = 0.85, LIFT_MS = 380;
const glowMaterials = new Map(); // material → its glowing copy, for the picked-up tile
function outline(material) {
  const ring = new THREE.Mesh(OUTLINE_GEOMETRY, material);
  ring.position.y = 0.2 + 0.012;
  ring.renderOrder = 2;
  ring.userData.noShadow = true;
  return ring;
}
function glow(tile) {
  tile.traverse((o) => {
    if (!o.isMesh || o.userData.noShadow) return;
    const swap = (m) => {
      if (!m || !("emissive" in m)) return m;
      if (!glowMaterials.has(m)) { const g = m.clone(); g.emissive = new THREE.Color("#FFB547"); g.emissiveIntensity = 0.3; glowMaterials.set(m, g); }
      return glowMaterials.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}
const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

// ── River pieces ──
// Every water tile works out its own piece from which of its six edges have
// water next door (HexLayout.waterShape). Each channel leaves an edge at that
// edge's exact midpoint, square to the edge, and at the same width — so two
// neighbouring pieces always meet seamlessly, whatever shape the reader makes.
const RIVER_Y = 0.2 + 0.014;   // just above the tile's grass top (TOP = 0.2 in build.py)
const BANK_Y = 0.2 + 0.006;
const RIVER_W = 0.62, BANK_W = 0.92;
const POOL_R = 0.46;           // springs, forks and lone water tiles have a little pool
const edgeMid = (i) => { const [dq, dr] = window.HexLayout.DIRS[i]; const v = hexToWorld(dq, dr).multiplyScalar(0.5); return new THREE.Vector2(v.x, v.z); };

const EDGE_REACH = 1.3;        // from a hex's centre to the middle of an edge
const FLOW_PERIOD = 2.6;       // world units for one repeat of the moving streaks
const FLOW_SPEED = 0.6;        // world units a second, always towards the pond
const RIPPLE_EVERY = 3.2;      // seconds for one ring to spread and fade

// Light streaks on the water colour. The river's strips scroll this along
// their length, which is what makes the water run.
function flowTexture(base, streaks = 18) {
  const W = 64, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.lineCap = "round";
  for (let i = 0; i < streaks; i++) {
    const x = 7 + rnd() * (W - 14), y = rnd() * H, len = 28 + rnd() * 50, drift = (rnd() - 0.5) * 5;
    g.strokeStyle = i % 4 === 3 ? "rgba(20, 96, 140, 0.2)" : `rgba(255, 255, 255, ${0.34 + rnd() * 0.3})`;
    g.lineWidth = 3 + rnd() * 3;
    for (const wrap of [-H, 0, H]) { // drawn three times so the pattern tiles top to bottom
      g.beginPath();
      g.moveTo(x, y + wrap);
      g.quadraticCurveTo(x + drift, y + wrap + len / 2, x, y + wrap + len);
      g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

let riverMats = null;
function riverMaterials(k) {
  if (riverMats) return riverMats;
  let still = null; // reuse the pond's own water so river and pond match
  k.pond().traverse((o) => { if (!still && o.isMesh && /water/i.test(o.material && o.material.name)) still = o.material; });
  still = still ? still.clone() : new THREE.MeshStandardMaterial({ color: "#6EC6E8", roughness: 0.25 });
  still.side = THREE.DoubleSide;
  still.vertexColors = false; // the pond's baked shading lives in vertex colours the river strips don't have
  const flow = flowTexture(`#${still.color.getHexString()}`);
  const water = still.clone(); // the running water: the same colour, carried by the streak texture
  water.map = flow;
  water.color.set("#ffffff");
  const bank = new THREE.MeshStandardMaterial({ color: "#E9D6A6", roughness: 0.9, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true });
  const ripple = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false });
  // Falling water: paler, busier and faster than the river.
  const plunge = flowTexture(`#${still.color.clone().lerp(new THREE.Color("#ffffff"), 0.45).getHexString()}`, 34);
  const fall = still.clone();
  fall.map = plunge;
  fall.color.set("#ffffff");
  const foam = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 });
  return (riverMats = { water, still, bank, stone, ripple, flow, fall, plunge, foam });
}

// A flat strip following pts (Vector2 in the tile's x/z) at height y. vs gives
// each point's distance upstream, which becomes the strip's texture coordinate.
function ribbon(pts, width, y, vs = null) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    const n = new THREE.Vector2(-t.y, t.x).multiplyScalar(width / 2);
    pos.push(p.x + n.x, y, p.y + n.y, p.x - n.x, y, p.y - n.y);
    const v = vs ? vs[i] / FLOW_PERIOD : 0;
    uv.push(0, v, 1, v);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function disc(radius, y) {
  const g = new THREE.CircleGeometry(radius, 28);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// A bend through the middle of a tile, from edge a to edge b.
const bend = (a, b) => Array.from({ length: 17 }, (_, i) => {
  const t = i / 16; // quadratic Bézier with its control point at the centre
  return edgeMid(a).multiplyScalar((1 - t) * (1 - t)).add(edgeMid(b).multiplyScalar(t * t));
});
const runLengths = (pts) => pts.reduce((s, p, i) => { s.push(i ? s[i - 1] + p.distanceTo(pts[i - 1]) : 0); return s; }, []);

// Curves for one tile's piece, each point with its distance upstream of the
// pond so the streaks line up from tile to tile. Two edges: one smooth bend
// through the middle (straight, gentle or sharp falls out of the geometry).
// Otherwise each edge runs straight to a pool in the middle.
//   out     the edge the water leaves by (-1: it ends in this tile)
//   mileage the distance upstream at that edge
function riverPaths(edges, out, mileage, stopAt = 0) {
  if (edges.length === 2 && !stopAt) {
    const [a, b] = out === edges[0] ? [edges[1], edges[0]] : edges; // drawn towards the way out
    const pts = bend(a, b), run = runLengths(pts), length = run[run.length - 1];
    return [{ pts, vs: run.map((d) => (out < 0 ? Math.abs(d - length / 2) : mileage + length - d)) }];
  }
  const centre = stopAt ? -EDGE_REACH : out < 0 ? 0 : mileage + EDGE_REACH; // the pond's own channels count down from its edge
  return edges.map((i) => {
    const m = edgeMid(i), length = m.length() - stopAt;
    const pts = [m, m.clone().multiplyScalar(stopAt / m.length())];
    return { pts, vs: i === out ? [mileage, mileage + length] : [centre + EDGE_REACH, centre + EDGE_REACH - length] };
  });
}

// How far upstream of the pond each water tile's way out is, following the river.
function riverMileage(water) {
  const H = window.HexLayout, memo = new Map();
  const at = (q, r) => {
    const key = `${q},${r}`;
    if (memo.has(key)) return memo.get(key);
    const { out } = H.waterShape(water, q, r);
    let v = 0;
    if (out >= 0) { // carry on from where this tile's water enters the next one down
      const nq = q + H.DIRS[out][0], nr = r + H.DIRS[out][1];
      if (nq !== POND_HEX[0] || nr !== POND_HEX[1]) {
        const next = H.waterShape(water, nq, nr);
        const through = next.edges.length === 2 ? runLengths(bend(...next.edges)).pop() : 2 * EDGE_REACH;
        v = next.out < 0 ? through / 2 : at(nq, nr) + through;
      }
    }
    memo.set(key, v);
    return v;
  };
  return at;
}

// Rings that spread and fade on still water (springs, pools, the pond).
function ripples(x, z, y, reach, phase) {
  const { ripple } = riverMats;
  return [0, 0.5].map((offset) => {
    const g = new THREE.RingGeometry(0.86, 1, 32);
    g.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(g, ripple.clone());
    ring.position.set(x, y, z);
    ring.userData.noShadow = true;
    ring.userData.ripple = { reach, phase: phase + offset };
    return ring;
  });
}

const STONE_GEOMETRY = new THREE.IcosahedronGeometry(1, 0);
const STONE_COLOURS = ["#A9B0B4", "#C3C8CA", "#B9AD98"].map((c) => new THREE.Color(c));

// Pebbles along both banks, the same every time for the same tile.
function bankStones(paths, seed, clearOf) {
  let s = (Math.abs(seed) % 2147483646) + 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const spots = [];
  for (const { pts } of paths) {
    const run = runLengths(pts), length = run[run.length - 1];
    for (let d = 0.22 + rnd() * 0.2; d < length - 0.15; d += 0.3 + rnd() * 0.34) {
      let i = 1;
      while (run[i] < d) i++;
      const a = pts[i - 1], b = pts[i], p = a.clone().lerp(b, (d - run[i - 1]) / (run[i] - run[i - 1]));
      const t = b.clone().sub(a).normalize(), side = rnd() < 0.5 ? -1 : 1, off = BANK_W / 2 + 0.03 + rnd() * 0.1;
      p.add(new THREE.Vector2(-t.y, t.x).multiplyScalar(side * off));
      if (p.length() > clearOf) spots.push(p);
    }
  }
  const stones = new THREE.InstancedMesh(STONE_GEOMETRY, riverMats.stone, spots.length);
  const m = new THREE.Matrix4(), turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((p, i) => {
    const size = 0.06 + rnd() * 0.06;
    turn.setFromAxisAngle(up, rnd() * Math.PI * 2);
    m.compose(new THREE.Vector3(p.x, BANK_Y + size * 0.3, p.y), turn, new THREE.Vector3(size * 1.35, size * 0.75, size));
    stones.setMatrixAt(i, m);
    stones.setColorAt(i, STONE_COLOURS[Math.floor(rnd() * STONE_COLOURS.length)]);
  });
  return stones;
}

// Where a river starts, its water pours out of a pile of rocks (PROP_falls,
// modelled so the water runs towards +x). These must match FALL_LINE and
// FALL_POOL in reference_trees.py, which shapes the rocks round them.
const FALL_H = 0.72, FALL_W = 0.46;
const FALL_LINE = [[-0.66, FALL_H + 0.012], [-0.2, FALL_H + 0.012], [-0.11, FALL_H + 0.008], [-0.05, FALL_H - 0.06], [-0.02, FALL_H - 0.18], [0, 0.3], [0.03, 0.03], [0.14, 0.02]]; // along the flow, above the grass
const FALL_POOL = [0.24, 0.4]; // the pool at its foot: how far along the flow, and its radius
const FALL_SPEED = 2.1;
const FOAM_GEOMETRY = new THREE.IcosahedronGeometry(1, 1);

function fallStrip() {
  const pos = [], uv = [], idx = [], half = FALL_W / 2;
  let run = 0;
  FALL_LINE.forEach(([x, h], i) => {
    if (i) run += Math.hypot(x - FALL_LINE[i - 1][0], h - FALL_LINE[i - 1][1]);
    pos.push(x, 0.2 + h, -half, x, 0.2 + h, half);
    uv.push(0, -run / FLOW_PERIOD, 1, -run / FLOW_PERIOD);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The fall always pours towards the reader: out of one of the three edges on
// the camera's side (1 front-right, 2 front, 3 front-left). When the river
// leaves by one of the back three, it turns out of the pool to reach it.
const FALL_FACING = [1, 1, 2, 3, 3];

function fallsPiece(k, out, mileage, seed) {
  const { water, still, bank, fall, foam } = riverMats;
  const face = out === 5 ? (Math.abs(seed) % 2 ? 1 : 3) : FALL_FACING[out];
  const f = edgeMid(face).normalize(), m = edgeMid(out), [poolX, poolR] = FALL_POOL;
  const turns = face !== out;
  const piece = new THREE.Group(), rocks = new THREE.Group();
  const angle = Math.atan2(-f.y, f.x); // turn the model's +x the way the water falls
  rocks.rotation.y = angle;
  // Mirror the rocks if need be, so their bare side (the model's -z) is where the river leaves.
  if (turns && new THREE.Vector2(-Math.sin(angle), -Math.cos(angle)).dot(m) < 0) rocks.scale.z = -1;
  rocks.add(k.falls(turns), new THREE.Mesh(fallStrip(), fall));
  const pool = (radius, y, material) => { const g = disc(radius, y); g.translate(poolX, 0, 0); rocks.add(new THREE.Mesh(g, material)); };
  pool(poolR + 0.13, BANK_Y + 0.001, bank);
  pool(poolR, RIVER_Y + 0.001, still);
  rocks.add(...ripples(0.17, 0, RIVER_Y + 0.004, poolR * 0.86, (Math.abs(seed) % 7) / 7));
  for (let i = 0; i < 6; i++) { // foam churning where the water lands
    const puff = new THREE.Mesh(FOAM_GEOMETRY, foam), size = 0.045 + (i % 3) * 0.014;
    puff.position.set(0.07 + (i % 2) * 0.07, RIVER_Y + 0.02, (i - 2.5) * 0.085);
    puff.scale.setScalar(size);
    puff.userData.noShadow = true;
    puff.userData.foam = { size, phase: i * 1.9 };
    rocks.add(puff);
  }
  piece.add(rocks);
  let paths = riverPaths([out], out, mileage, poolX + 0.1); // the river, from the pool straight to the edge
  if (turns) { // … or round past the rocks: a curve that still meets the edge square on
    const steps = Math.min((face - out + 6) % 6, (out - face + 6) % 6);
    const a = f.clone().multiplyScalar(poolX), c = m.clone().normalize().multiplyScalar(steps === 1 ? 0.55 : 0.85);
    const pts = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20;
      return a.clone().multiplyScalar((1 - t) * (1 - t)).add(c.clone().multiplyScalar(2 * t * (1 - t))).add(m.clone().multiplyScalar(t * t));
    });
    const run = runLengths(pts), length = run[run.length - 1];
    paths = [{ pts, vs: run.map((d) => mileage + length - d) }];
  }
  for (const { pts, vs } of paths) piece.add(new THREE.Mesh(ribbon(pts, BANK_W, BANK_Y), bank), new THREE.Mesh(ribbon(pts, RIVER_W, RIVER_Y, vs), water));
  const stones = bankStones(paths, seed, poolX + poolR + 0.14);
  if (stones.count) piece.add(stones);
  return piece;
}

// Birds circling over the forest. They live outside the world group, so they
// neither change how the forest is framed nor get in the way of a tap.
const BIRD_TINTS = ["#FFFFFF", "#CBD2D8", "#C79C7A"];
const BIRD_SCALE = 1.9;
const tints = new Map();
function flock(k, world) {
  const sky = new THREE.Group(), birds = [];
  if (!k.bird) return { sky, birds };
  const box = new THREE.Box3().setFromObject(world), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  BIRD_TINTS.forEach((tint, i) => {
    const bird = k.bird();
    bird.scale.setScalar(BIRD_SCALE);
    bird.traverse((o) => {
      if (!o.isMesh) return;
      const key = `${tint}:${o.material.uuid}`;
      if (!tints.has(key)) { const copy = o.material.clone(); copy.color.set(tint); tints.set(key, copy); }
      o.material = tints.get(key);
      o.castShadow = true;
    });
    sky.add(bird);
    birds.push({
      bird, wings: bird.children.filter((w) => /wing/i.test(w.name)),
      cx: c.x, cz: c.z + size.z * 0.08, rx: Math.max(1.5, size.x * (0.2 + 0.08 * i)), rz: Math.max(1.1, size.z * (0.15 + 0.06 * i)),
      height: box.max.y + 0.45 + i * 0.3, speed: (i % 2 ? -1 : 1) * (0.34 + i * 0.07), phase: i * 2.3,
    });
  });
  return { sky, birds };
}

// Everything that moves, posed for time t (ms).
function animate(view, t) {
  const s = t / 1000;
  if (view.arranging) {
    const pulse = 0.5 + 0.5 * Math.sin(s * 4.2);
    TAPPABLE_OUTLINE.opacity = 0.35 + 0.6 * pulse;
    TARGET_MATERIAL.opacity = WATER_TARGET_MATERIAL.opacity = 0.55 + 0.4 * pulse;
    for (const g of glowMaterials.values()) g.emissiveIntensity = 0.22 + 0.22 * pulse;
    if (view.lifted) {
      const p = Math.min(1, Math.max(0, (t - view.liftStart) / LIFT_MS));
      const bob = p >= 1 && !reduceMotion ? 0.05 * Math.sin(s * 2.6) : 0;
      view.lifted.obj.position.y = view.lifted.base + LIFT_HEIGHT * easeOutBack(p) + bob;
    }
  }
  for (const w of view.sway) w.obj.rotation.z = Math.sin(s * w.speed + w.phase) * 0.03;
  if (riverMats) {
    riverMats.flow.offset.y = (s * FLOW_SPEED / FLOW_PERIOD) % 1;   // the river runs
    riverMats.plunge.offset.y = (s * FALL_SPEED / FLOW_PERIOD) % 1; // and falls faster
  }
  for (const ring of view.ripples) {
    const { reach, phase } = ring.userData.ripple;
    const age = (s / RIPPLE_EVERY + phase) % 1;
    ring.scale.setScalar(reach * (0.12 + 0.88 * age));
    ring.material.opacity = 0.6 * (1 - age) * Math.min(1, age * 6);
  }
  for (const puff of view.foam) {
    const { size, phase } = puff.userData.foam;
    puff.scale.setScalar(size * (0.7 + 0.55 * Math.abs(Math.sin(s * 3.1 + phase))));
  }
  for (const c of view.critters) {
    const { kind, phase, size } = c.userData.critter;
    if (kind === "rabbit") { // a hop now and then
      const u = (s * 0.3 + phase) % 1;
      c.position.y = u < 0.14 ? Math.sin((u / 0.14) * Math.PI) * 0.12 : 0;
    } else c.scale.y = size * (1 + 0.022 * Math.sin(s * 1.8 + phase)); // breathing
  }
  for (const b of view.birds) {
    const a = s * b.speed + b.phase;
    b.bird.position.set(b.cx + Math.cos(a) * b.rx, b.height + Math.sin(s * 0.7 + b.phase) * 0.15, b.cz + Math.sin(a) * b.rz);
    b.bird.rotation.y = Math.atan2(-Math.cos(a) * b.rz * b.speed, -Math.sin(a) * b.rx * b.speed); // nose along its path
    const flap = Math.sin(s * 10 + b.phase) * 0.65;
    b.wings.forEach((w) => { w.rotation.x = /L$/.test(w.name) ? flap : -flap; });
  }
}

// shape: HexLayout.waterShape for this tile. mileage: see riverMileage.
function riverPiece(k, shape, { pond = false, mileage = 0, seed = 1 } = {}) {
  const { water, still, bank } = riverMaterials(k);
  const { edges, out } = shape;
  if (!pond && k.falls && edges.length === 1 && out === edges[0]) return fallsPiece(k, out, mileage, seed);
  const piece = new THREE.Group();
  // The strips cast shadows like everything else: left out of the shadow map, they
  // picked up a faint false shadow from the grass just beneath, except over the
  // gap between two tiles, which showed as a pale line across every joint.
  const add = (geometry, material) => piece.add(new THREE.Mesh(geometry, material));
  // On the pond tile the channels just run into the pond's own water.
  const paths = riverPaths(edges, out, mileage, pond ? 0.8 : 0);
  const pool = !pond && edges.length !== 2;
  for (const { pts, vs } of paths) { add(ribbon(pts, BANK_W, BANK_Y), bank); add(ribbon(pts, RIVER_W, RIVER_Y, vs), water); }
  if (pool) {
    add(disc(POOL_R + 0.15, BANK_Y + 0.001), bank);
    add(disc(POOL_R, RIVER_Y + 0.001), still);
    piece.add(...ripples(0, 0, RIVER_Y + 0.004, POOL_R * 0.92, (seed % 7) / 7));
  }
  const stones = bankStones(paths, seed, pond ? 1.12 : pool ? POOL_R + 0.3 : 0);
  if (stones.count) piece.add(stones);
  return piece;
}

// Remove the stones, tufts and flowers a grass tile is scattered with, so
// water can lie across it.
function bareTile(tile) {
  const decor = [];
  tile.traverse((o) => { if (o !== tile && /_(stones|tufts|flowers|decor)/i.test(o.name)) decor.push(o); });
  decor.forEach((o) => o.parent && o.parent.remove(o));
  return tile;
}

// trees:   [{ harvestNumber, num, look, label, q, r }] — each on its own hex
// plots:   [[q, r]] empty meadow tiles hinting where the next trees go
// water:   [[q, r]] water tiles; they join up into a river by themselves
// targets: [[q, r]] light spots to tap (arranging only): where the selected
//          tree can go, or — targetStyle "water" — where water can be added
// onAnchor({ x, y, hexWidth }) — where the centre hex lands, in CSS px from
//   the canvas's top-left, so app.js can stand the growing tree on it.
// onPick({ kind: "tree", harvestNumber } | { kind: "water", q, r } | { kind: "cell", q, r } | { kind: "none" })
//   — a tap on the forest while arranging.
async function render(container, { trees = [], plots = [], water = [], arranging = false, selected = null, targets = [], targetStyle = "tree", onAnchor, onPick } = {}) {
  const k = await loadKit();

  let view = views.get(container);
  if (!view) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = k.toneMapping;
    renderer.toneMappingExposure = k.lights.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#fff9e7", "#b6baa1", k.lights.sky));
    const key = new THREE.DirectionalLight("#fff1d4", k.lights.key);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.normalBias = 0.04;
    scene.add(key, key.target);

    view = { renderer, scene, key, camera: new THREE.OrthographicCamera(), world: null, sky: null, sway: [], ripples: [], foam: [], critters: [], birds: [], visible: true, frame: 0 };
    views.set(container, view);

    // A tap (not a drag or scroll) picks whatever tile is under the finger.
    const canvas = renderer.domElement;
    let down = null;
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("pointerup", (e) => {
      if (!down || !view.arranging || !view.onPick) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 10) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, view.camera);
      for (const hit of ray.intersectObject(view.world, true)) {
        for (let o = hit.object; o; o = o.parent) {
          if (o.userData.pick) return view.onPick(o.userData.pick);
        }
      }
      view.onPick({ kind: "none" });
    });

    // Draw only while on screen; a hidden page or scrolled-away forest costs nothing.
    new IntersectionObserver(([e]) => { view.visible = e.isIntersecting; }).observe(container);
    new ResizeObserver(() => { fit(container, view); draw(view); }).observe(container);
    if (!reduceMotion) {
      let last = 0;
      renderer.setAnimationLoop((t) => {
        if (!view.visible || document.hidden || t - last < 33) return; // ~30 fps is plenty for a breeze
        last = t;
        animate(view, t);
        draw(view);
      });
    }
  }

  // Rebuild the world for this forest.
  if (view.world) view.scene.remove(view.world);
  const world = new THREE.Group();
  view.sway = [];
  view.lifted = null;
  if (!arranging || selected == null) view.liftKey = null;
  const place = (piece, q, r) => { piece.position.copy(hexToWorld(q, r)); world.add(piece); return piece; };
  place(k.tile(0, 0), 0, 0); // a plain meadow tile: a bench or path would crowd the growing tree
  const pond = place(k.pond(), ...POND_HEX);
  const pondShape = window.HexLayout.waterShape(water, ...POND_HEX);
  if (pondShape.edges.length) pond.add(riverPiece(k, pondShape, { pond: true, seed: 5 }));
  riverMaterials(k);
  pond.add(...ripples(0.05, 0.55, 0.2 + 0.012, 0.3, 0), ...ripples(-0.23, -0.5, 0.2 + 0.012, 0.3, 0.3)); // round two of its lily pads
  const mileage = riverMileage(water);
  for (const [q, r] of water) {
    const tile = place(bareTile(k.tile(q, r)), q, r);
    tile.add(riverPiece(k, window.HexLayout.waterShape(water, q, r), { mileage: mileage(q, r), seed: q * 31 + r * 17 + 100 }));
    tile.userData.pick = { kind: "water", q, r };
  }
  if (!arranging) plots.forEach(([q, r]) => place(k.tile(q, r, { life: true }), q, r)); // empty plots waiting for the next harvests
  const shown = trees.filter((t) => Number.isInteger(t.q) && Number.isInteger(t.r));
  shown.forEach((t) => {
    const tile = place(k.tile(t.q, t.r, { life: true }), t.q, t.r);
    tile.userData.pick = { kind: "tree", harvestNumber: t.harvestNumber };
    if (arranging && t.harvestNumber === selected) {
      // The one you're moving: it lifts (animate() eases it up and bobs it),
      // glows, and an orange mark shows the spot it came from.
      if (view.liftKey !== t.harvestNumber) { view.liftKey = t.harvestNumber; view.liftStart = reduceMotion ? -Infinity : performance.now(); }
      view.lifted = { obj: tile, base: tile.position.y };
      glow(tile);
      tile.add(outline(PICKED_OUTLINE));
      const mark = new THREE.Mesh(TARGET_GEOMETRY, SELECTED_MATERIAL);
      mark.position.copy(hexToWorld(t.q, t.r)).setY(0.06);
      world.add(mark);
    } else if (arranging && selected == null && targetStyle !== "water") {
      tile.add(outline(TAPPABLE_OUTLINE)); // you can pick this one up
    }
    const tree = k.tree(t);
    tree.rotation.y = ((t.num * 53) % 360) * (Math.PI / 180); // each tree faces its own way
    tree.userData.label = t.label;
    tile.add(tree);
    view.sway.push({ obj: tree, speed: 0.7 + (t.num % 5) * 0.08, phase: t.num * 1.7 });
  });
  view.ripples = [];
  view.foam = [];
  view.critters = [];
  world.traverse((o) => {
    if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; }
    if (o.userData.ripple) view.ripples.push(o);
    if (o.userData.foam) view.foam.push(o);
    if (o.userData.critter) view.critters.push(o);
  });
  if (view.sky) view.scene.remove(view.sky);
  const { sky, birds } = flock(k, world);
  view.scene.add(sky);
  view.sky = sky;
  view.birds = birds;
  if (arranging) {
    for (const [q, r] of targets) {
      const forWater = targetStyle === "water";
      const spot = new THREE.Mesh(TARGET_GEOMETRY, forWater ? WATER_TARGET_MATERIAL : TARGET_MATERIAL);
      spot.position.copy(hexToWorld(q, r)).setY(0.06);
      spot.userData.pick = { kind: "cell", q, r };
      spot.add(new THREE.LineSegments(TARGET_EDGES, forWater ? WATER_TARGET_RIM : TARGET_RIM));
      world.add(spot);
    }
  }
  view.scene.add(world);
  view.world = world;
  view.onAnchor = onAnchor;
  view.onPick = onPick;
  view.arranging = arranging;
  view.renderer.domElement.style.cursor = arranging ? "pointer" : "";

  const extent = 16; // the shadow camera covers the largest forest (ring 5)
  view.key.position.set(-extent, extent * 1.8, extent);
  Object.assign(view.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: extent * 5 });
  view.key.shadow.camera.updateProjectionMatrix();

  container.setAttribute("role", "img");
  container.setAttribute("aria-label", shown.length
    ? `Your forest: ${shown.map((t) => t.label).join(", ")}.`
    : "Your forest: empty meadow plots waiting for your first harvested tree.");
  fit(container, view);
  animate(view, performance.now()); // posed even where motion is switched off
  draw(view);
}

// Frame every tile (and tree tops) in the canvas, front-on and slightly from above.
function fit(container, view) {
  const width = container.clientWidth, height = container.clientHeight;
  if (!width || !height || !view.world) return;
  view.renderer.setSize(width, height, false);
  const cam = view.camera;
  // Mirror the bounds across x = 0 so the growing tree's hex is always in the
  // middle, however lopsided the outer ring is so far.
  const bounds = new THREE.Box3().setFromObject(view.world);
  if (view.arranging) bounds.max.y += LIFT_HEIGHT + 0.1; // room for a picked-up tile
  const halfX = Math.max(-bounds.min.x, bounds.max.x);
  bounds.min.x = -halfX;
  bounds.max.x = halfX;
  const centre = bounds.getCenter(new THREE.Vector3());
  cam.position.copy(centre).add(new THREE.Vector3(0, 10, 12.5));
  cam.lookAt(centre);
  cam.updateMatrixWorld(true);
  const pts = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    pts.push(new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse));
  }
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  cam.position.add(new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0).applyQuaternion(cam.quaternion));
  cam.updateMatrixWorld(true);
  const aspect = width / height;
  const half = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect) * 1.04;
  Object.assign(cam, { left: -half * aspect, right: half * aspect, top: half, bottom: -half, near: 0.1, far: 80 });
  cam.updateProjectionMatrix();

  // Where the centre hex's top sits on screen, and how wide one hex looks.
  const project = (v) => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height }; };
  const top = 0.2;
  const c = project(new THREE.Vector3(0, top, 0.35));
  const l = project(new THREE.Vector3(-1.5, top, 0)), r = project(new THREE.Vector3(1.5, top, 0));
  if (view.onAnchor) view.onAnchor({ x: c.x, y: c.y, hexWidth: r.x - l.x });
}

function draw(view) {
  view.renderer.render(view.scene, view.camera);
}

window.Forest3D = { render, supported: webglAvailable };
