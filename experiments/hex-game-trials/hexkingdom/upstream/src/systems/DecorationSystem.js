// ============================================================
// DecorationSystem — procedurally spawns visual props on tiles.
// Handles: barrels, crates, benches, fences, wagons, carts,
// hay bales, wells, lamps, torches, signs, scarecrows.
// Only visual — no gameplay or logic changes.
// ============================================================
import { Rng } from '../core/Rng.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';

const TOP = TILE_H;

// spawn tables: prop → { min, max, avoidCenter, minDist }
// avoidCenter keeps props away from river/road strips
const SPAWN_TABLES = {
  forest: {
    barrel:   { min: 0, max: 2, avoidCenter: true },
    crate:    { min: 0, max: 1, avoidCenter: true },
    signpost: { min: 0, max: 1, avoidCenter: false },
  },
  field: {
    hayBale:   { min: 1, max: 3, avoidCenter: true },
    scarecrow: { min: 0, max: 1, avoidCenter: false },
    fenceSeg:  { min: 0, max: 2, avoidCenter: true },
  },
  village: {
    barrel:   { min: 1, max: 3, avoidCenter: true },
    crate:    { min: 1, max: 3, avoidCenter: true },
    bench:    { min: 0, max: 2, avoidCenter: false },
    fenceSeg: { min: 0, max: 3, avoidCenter: true },
    lampPost: { min: 0, max: 2, avoidCenter: false },
    well:     { min: 0, max: 1, avoidCenter: false },
    wagon:    { min: 0, max: 1, avoidCenter: true },
    cart:     { min: 0, max: 1, avoidCenter: true },
    signpost: { min: 0, max: 1, avoidCenter: false },
    torch:    { min: 0, max: 2, avoidCenter: false },
  },
  river: {
    hayBale: { min: 0, max: 1, avoidCenter: true },
    barrel:  { min: 0, max: 1, avoidCenter: true },
    crate:   { min: 0, max: 1, avoidCenter: true },
  },
  mountain: {
    barrel:    { min: 0, max: 1, avoidCenter: true },
    crate:     { min: 0, max: 1, avoidCenter: true },
    signpost:  { min: 0, max: 1, avoidCenter: false },
    torch:     { min: 0, max: 1, avoidCenter: false },
  },
  meadow: {
    fenceSeg: { min: 0, max: 2, avoidCenter: true },
    bench:    { min: 0, max: 1, avoidCenter: false },
    signpost: { min: 0, max: 1, avoidCenter: false },
  },
  swamp: {
    barrel:  { min: 0, max: 1, avoidCenter: true },
    crate:   { min: 0, max: 1, avoidCenter: true },
    torch:   { min: 0, max: 1, avoidCenter: false },
  },
  hills: {
    barrel:   { min: 0, max: 1, avoidCenter: true },
    signpost: { min: 0, max: 1, avoidCenter: false },
    fenceSeg: { min: 0, max: 1, avoidCenter: true },
  },
  quarry: {
    cart:     { min: 0, max: 1, avoidCenter: true },
    crate:    { min: 0, max: 2, avoidCenter: true },
    barrel:   { min: 0, max: 1, avoidCenter: true },
    signpost: { min: 0, max: 1, avoidCenter: false },
  },
  ruins: {
    torch:    { min: 0, max: 1, avoidCenter: false },
    signpost: { min: 0, max: 1, avoidCenter: false },
  },
  lake: {
    barrel: { min: 0, max: 1, avoidCenter: true },
    cart:   { min: 0, max: 1, avoidCenter: true },
  },
};

export class DecorationSystem {
  constructor(pool) {
    this.pool = pool;
    this.spawns = new Map(); // cellKey → [{kind, idx}]
  }

  /**
   * Spawn decorations for a newly placed tile.
   * Call after tile group is in scene and pool is ready.
   */
  decorate(cell) {
    const key = `${cell.q},${cell.r}`;
    if (this.spawns.has(key)) return;

    const table = SPAWN_TABLES[cell.tileType];
    if (!table) return;

    const rng = new Rng(cell.seed ^ 0xDEC0DE);
    const cellSpawns = [];

    for (const [kind, cfg] of Object.entries(table)) {
      const count = rng.int(cfg.min, cfg.max);
      for (let i = 0; i < count; i++) {
        const pos = this._pickPosition(cell, rng, cfg.avoidCenter);
        if (!pos) continue;

        const rotY = rng.range(0, Math.PI * 2);
        const scale = rng.range(0.85, 1.15);
        const idx = this.pool.spawn(kind, pos.x, pos.y, pos.z, rotY, scale, 1.8);
        if (idx >= 0) {
          cellSpawns.push({ kind, idx });
        }
      }
    }

    this.spawns.set(key, cellSpawns);
  }

  /** Remove decorations for a tile (used on restart). */
  clearCell(q, r) {
    const key = `${q},${r}`;
    const list = this.spawns.get(key);
    if (!list) return;
    for (const { kind, idx } of list) {
      this.pool.release(kind, idx);
    }
    this.spawns.delete(key);
  }

  /** Clear all decorations. */
  clear() {
    for (const [key, list] of this.spawns) {
      for (const { kind, idx } of list) {
        this.pool.release(kind, idx);
      }
    }
    this.spawns.clear();
  }

  _pickPosition(cell, rng, avoidCenter) {
    const a = rng.range(0, Math.PI * 2);
    let d = rng.range(0.18, 0.58);

    // for tiles with roads/rivers, bias away from center strips
    if (avoidCenter && (cell.riverEdges?.length || cell.roadEdges?.length)) {
      d = rng.range(0.35, 0.62);
    }

    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = TOP + 0.005;

    return { x, y, z };
  }
}
