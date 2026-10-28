// ============================================================
// DebugOverlays — 3D visualization layer for EXISTING system
// data. Nothing here mutates gameplay state: every overlay is
// a pure read of grid / RoadSystem / AutoMeshSystem /
// TerritorySystem / FactionSystem / CitizenSystem data.
//
// Each overlay is an independent toggle. Enabled overlays are
// rebuilt on relevant events + a slow refresh timer, so they
// track the live simulation without per-frame cost.
// ============================================================
import * as THREE from 'three';
import { axialToWorld, cellKey, edgeAngle, HEX_SIZE, DIRS } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { maskEdges } from '../automesh/Bitmask.js';
import { events } from '../core/Events.js';

const Y = TILE_H + 0.09;        // hover height above tile tops
const APOTHEM = HEX_SIZE * Math.sqrt(3) / 2;
const REFRESH_INTERVAL = 1.0;   // seconds between live refreshes

// ---------- shared helpers ----------

const _texCache = new Map();

/** canvas-based text sprite (cached per string+color) */
function textSprite(text, color = '#ffffff', scale = 0.55) {
  const key = text + '|' + color;
  let tex = _texCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 128, 48);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 25);
    tex = new THREE.CanvasTexture(c);
    tex.userData.shared = true;
    _texCache.set(key, tex);
  }
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(scale, scale * 0.375, 1);
  return sp;
}

let _flatHexGeo = null;
function flatHexGeo() {
  if (!_flatHexGeo) {
    _flatHexGeo = new THREE.CylinderGeometry(HEX_SIZE * 0.92, HEX_SIZE * 0.92, 0.015, 6, 1, false, Math.PI / 3);
    _flatHexGeo.userData.shared = true;
  }
  return _flatHexGeo;
}

let _arrowGeo = null;
function arrowGeo() {
  if (!_arrowGeo) {
    _arrowGeo = new THREE.ConeGeometry(0.09, 0.26, 4);
    _arrowGeo.rotateX(Math.PI / 2); // point along +Z, we'll orient
    _arrowGeo.userData.shared = true;
  }
  return _arrowGeo;
}

function flatHex(q, r, color, opacity = 0.35, y = TILE_H + 0.05) {
  const m = new THREE.Mesh(flatHexGeo(), new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
  }));
  const w = axialToWorld(q, r);
  m.position.set(w.x, y, w.z);
  return m;
}

function lineBetween(a, b, color, y = Y) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(a.x, y, a.z),
    new THREE.Vector3(b.x, y, b.z),
  ]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && !o.material.userData?.shared) {
      // sprite materials share cached textures — dispose material only
      o.material.dispose();
    }
  });
  if (g.parent) g.parent.remove(g);
  g.clear();
}

// faction archetype colors (visualization only)
const FACTION_COLORS = {
  friendly_kingdom: 0x4caf7a,
  neutral_village: 0xb0a850,
  hostile_kingdom: 0xd0453a,
  barbarian_clan: 0xc06a2a,
  bandit_camp: 0x8a4aa0,
};

// per-type mask marker colors (AutoMesh Masks overlay)
const MASK_COLORS = {
  road: 0xd8c27a,
  river: 0x4ea8e8,
  lake: 0x2a6ac4,
  village: 0xe06a4a,
  castle: 0xb04ae0,
};

// lake edge-class colors
const LAKE_CLASS_COLORS = {
  water: 0x2a6ac4,
  inlet: 0x40d0d0,
  shore: 0xd7c08a,
  shore_corner: 0xe08a3a,
};

// ============================================================
// overlay builders — each returns a fresh THREE.Group
// ============================================================

const BUILDERS = {
  /** Road Graph — RoadSystem nodes + links + trade routes */
  roadGraph(game) {
    const g = new THREE.Group();
    const roads = game.roadSystem;
    const drawn = new Set();
    for (const [key, node] of roads.nodes) {
      const a = axialToWorld(node.q, node.r);
      // node dot: village = orange, road = yellow
      const isVillage = node.cell.tileType === 'village';
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(isVillage ? 0.12 : 0.07, 6, 5),
        new THREE.MeshBasicMaterial({ color: isVillage ? 0xff8a3a : 0xf0e05a, depthTest: false })
      );
      dot.position.set(a.x, Y, a.z);
      g.add(dot);
      for (const nk of node.links) {
        const ek = key < nk ? key + '|' + nk : nk + '|' + key;
        if (drawn.has(ek)) continue;
        drawn.add(ek);
        const other = roads.nodes.get(nk);
        if (!other) continue;
        const b = axialToWorld(other.q, other.r);
        g.add(lineBetween(a, b, 0xf0e05a));
      }
    }
    // trade routes drawn slightly higher in green
    for (const route of roads.tradeRoutes) {
      const path = roads.pathBetween(route.a, route.b);
      if (!path) continue;
      for (let i = 0; i < path.length - 1; i++) {
        const a = axialToWorld(path[i].q, path[i].r);
        const b = axialToWorld(path[i + 1].q, path[i + 1].r);
        g.add(lineBetween(a, b, 0x50e070, Y + 0.06));
      }
    }
    return g;
  },

  /** AutoMesh Masks — connected-edge markers per registered type */
  autoMeshMasks(game) {
    const g = new THREE.Group();
    const am = game.autoMesh;
    for (const cell of game.grid.cells.values()) {
      const data = cell.autoMesh;
      if (!data) continue;
      let lane = 0;
      for (const type of am.registry.all()) {
        const entry = data[type.typeId];
        if (!entry) continue;
        const color = MASK_COLORS[type.typeId] || 0xffffff;
        const w = axialToWorld(cell.q, cell.r);
        for (const e of maskEdges(entry.mask)) {
          const a = edgeAngle(e);
          const d = APOTHEM * (0.62 - lane * 0.09);
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.02, 0.05),
            new THREE.MeshBasicMaterial({ color, depthTest: false })
          );
          bar.position.set(w.x + Math.cos(a) * d, Y, w.z - Math.sin(a) * d);
          bar.rotation.y = a;
          g.add(bar);
        }
        lane++;
      }
    }
    return g;
  },

  /** Territory Ownership — player (green) vs captured (red) tiles */
  territory(game) {
    const g = new THREE.Group();
    const captured = game.territorySystem.captured;
    const borderSet = new Set(
      game.territorySystem.playerBorderCells().map((c) => cellKey(c.q, c.r))
    );
    for (const cell of game.grid.cells.values()) {
      const key = cellKey(cell.q, cell.r);
      if (captured.has(key)) {
        g.add(flatHex(cell.q, cell.r, 0xd0453a, 0.45));
      } else if (borderSet.has(key)) {
        g.add(flatHex(cell.q, cell.r, 0xe0c040, 0.3));
      } else {
        g.add(flatHex(cell.q, cell.r, 0x4caf7a, 0.22));
      }
    }
    return g;
  },

  /** Population Centers — discs scaled by village population */
  population(game) {
    const g = new THREE.Group();
    for (const v of game.citizenSystem.villages.values()) {
      const w = axialToWorld(v.cell.q, v.cell.r);
      const r = 0.15 + v.population * 0.06;
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.02, 12),
        new THREE.MeshBasicMaterial({ color: 0x50b8f0, transparent: true, opacity: 0.55, depthTest: false })
      );
      disc.position.set(w.x, Y, w.z);
      g.add(disc);
      const label = textSprite(`${v.population}👥 ${v.houses}🏠`, '#a0e0ff');
      label.position.set(w.x, Y + 0.35, w.z);
      g.add(label);
    }
    return g;
  },

  /** Faction Territories — virtual hex sets of every faction */
  factions(game) {
    const g = new THREE.Group();
    for (const f of game.factionSystem.factions) {
      const color = FACTION_COLORS[f.archetype] || 0xffffff;
      for (const key of f.territory) {
        const [q, r] = key.split(',').map(Number);
        g.add(flatHex(q, r, color, 0.35, TILE_H + 0.03));
      }
      const hw = axialToWorld(f.home.q, f.home.r);
      const label = textSprite(`${f.icon} ${Math.round(f.strength)}`, '#ffffff', 0.9);
      label.position.set(hw.x, Y + 0.5, hw.z);
      g.add(label);
    }
    return g;
  },

  /** AutoMesh Variants — resolved variant labels per tile */
  variants(game) {
    const g = new THREE.Group();
    for (const cell of game.grid.cells.values()) {
      const data = cell.autoMesh;
      if (!data) continue;
      const labels = [];
      for (const [typeId, entry] of Object.entries(data)) {
        if (entry && entry.label) labels.push(`${typeId[0]}:${entry.label}`);
      }
      if (!labels.length) continue;
      const w = axialToWorld(cell.q, cell.r);
      labels.forEach((txt, i) => {
        const sp = textSprite(txt, '#ffe08a', 0.75);
        sp.position.set(w.x, Y + 0.3 + i * 0.2, w.z);
        g.add(sp);
      });
    }
    return g;
  },

  /** River Flow Directions — arrows along outMask edges + role labels */
  riverFlow(game) {
    const g = new THREE.Group();
    const flow = game.autoMesh.flows.get('river');
    if (!flow) return g;
    for (const node of flow.nodes.values()) {
      const w = axialToWorld(node.q, node.r);
      for (const e of maskEdges(node.outMask)) {
        const a = edgeAngle(e);
        const arrow = new THREE.Mesh(arrowGeo(), new THREE.MeshBasicMaterial({
          color: ((node.sinkMask >> e) & 1) ? 0x40e0c0 : 0x40a0ff, depthTest: false,
        }));
        const d = APOTHEM * 0.55;
        arrow.position.set(w.x + Math.cos(a) * d, Y, w.z - Math.sin(a) * d);
        arrow.rotation.y = a + Math.PI / 2; // cone points along its local +Z
        g.add(arrow);
      }
      const label = textSprite(node.role, '#80c8ff', 0.6);
      label.position.set(w.x, Y + 0.28, w.z);
      g.add(label);
    }
    return g;
  },

  /** Lake Classification — per-edge shore classes + tile class */
  lakes(game) {
    const g = new THREE.Group();
    for (const cell of game.grid.cells.values()) {
      const entry = cell.autoMesh?.lake;
      if (!entry) continue;
      const w = axialToWorld(cell.q, cell.r);
      const ec = entry.edgeClasses;
      if (ec) {
        for (let e = 0; e < 6; e++) {
          const cls = ec.edges[e];
          const color = LAKE_CLASS_COLORS[cls] || 0x888888;
          const a = edgeAngle(e);
          const d = APOTHEM * 0.72;
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 5, 4),
            new THREE.MeshBasicMaterial({ color, depthTest: false })
          );
          dot.position.set(w.x + Math.cos(a) * d, Y, w.z - Math.sin(a) * d);
          g.add(dot);
        }
        const label = textSprite(ec.tileClass, '#80d0ff', 0.7);
        label.position.set(w.x, Y + 0.3, w.z);
        g.add(label);
      } else {
        const label = textSprite(entry.label, '#80d0ff', 0.7);
        label.position.set(w.x, Y + 0.3, w.z);
        g.add(label);
      }
    }
    return g;
  },

  /** Tile Coordinates — q,r label on every placed tile */
  coords(game) {
    const g = new THREE.Group();
    for (const cell of game.grid.cells.values()) {
      const w = axialToWorld(cell.q, cell.r);
      const sp = textSprite(`${cell.q},${cell.r}`, '#e8e8e8', 0.6);
      sp.position.set(w.x, Y + 0.15, w.z);
      g.add(sp);
    }
    return g;
  },
};

export const OVERLAY_DEFS = [
  { id: 'roadGraph', label: 'Road Graph' },
  { id: 'autoMeshMasks', label: 'AutoMesh Masks' },
  { id: 'territory', label: 'Territory Ownership' },
  { id: 'population', label: 'Population Centers' },
  { id: 'factions', label: 'Faction Territories' },
  { id: 'variants', label: 'AutoMesh Variants' },
  { id: 'riverFlow', label: 'River Flow Directions' },
  { id: 'lakes', label: 'Lake Classification' },
  { id: 'coords', label: 'Tile Coordinates' },
];

export class DebugOverlays {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'debug-overlays';
    game.scene.add(this.root);
    this.enabled = new Set();
    this.groups = new Map(); // id -> THREE.Group
    this._refreshT = 0;
    this._dirty = false;

    // rebuild enabled overlays when the underlying data changes
    const markDirty = () => { this._dirty = true; };
    events.on('tile:placed', markDirty);
    events.on('faction:tile-placed', markDirty);
    events.on('roads:changed', markDirty);
    events.on('territory:changed', markDirty);
    events.on('factions:tick', markDirty);
    events.on('population:changed', markDirty);
  }

  isEnabled(id) {
    return this.enabled.has(id);
  }

  setEnabled(id, on) {
    if (on) {
      this.enabled.add(id);
      this._rebuild(id);
    } else {
      this.enabled.delete(id);
      const g = this.groups.get(id);
      if (g) { disposeGroup(g); this.groups.delete(id); }
    }
  }

  _rebuild(id) {
    const old = this.groups.get(id);
    if (old) { disposeGroup(old); this.groups.delete(id); }
    const builder = BUILDERS[id];
    if (!builder) return;
    const g = builder(this.game);
    this.groups.set(id, g);
    this.root.add(g);
  }

  update(dt) {
    if (!this.enabled.size) return;
    this._refreshT += dt;
    if (this._dirty || this._refreshT >= REFRESH_INTERVAL) {
      this._refreshT = 0;
      this._dirty = false;
      for (const id of this.enabled) this._rebuild(id);
    }
  }

  clear() {
    for (const g of this.groups.values()) disposeGroup(g);
    this.groups.clear();
  }
}
