// ============================================================
// AutoMeshSystem — UNIVERSAL CONNECTIVITY ENGINE
//
// "Tile-based graph engine + rendering selector", not a simple
// autotile system. The engine owns NO domain logic: everything
// about roads / rivers / lakes / villages / castles / future
// walls / fences / railways / borders / trenches lives in
// data-driven type configs (see AutoMeshAdapters.js).
//
// COMPOSITION
//   TypeRegistry       — runtime-extensible type configs
//   Bitmask            — 6-dir masks + rotation-invariant shapes
//   VariantResolver    — priority pipeline, fallbacks, layers
//   PropagationQueue   — deduplicated local-only updates
//   RiverFlowSystem    — directed flow graphs (per flow-enabled type)
//   LakeSmoothing      — per-edge shore classification (via configs)
//
// HYBRID MASK + TOPOLOGY
//   For each active type on a tile we keep:
//     mask      — 6-bit undirected connectivity (bit i = edge i)
//     variant   — resolved rendering variant (label + rotation…)
//     flow      — optional directed graph node (inMask/outMask/role)
//   Asymmetric connections are supported natively: side A's
//   connects() and side B's acceptsFrom() are consulted
//   independently, so "village accepts road" without "village
//   emits road" works out of the box.
//
// PERFORMANCE MODEL
//   updateTile     O(types × 6)            amortized O(1)
//   onTileChanged  tile + ≤6 neighbors + affected flow component
//   flow recompute O(component)  — the touched river only,
//                                  NEVER the world
//   change detection via variant signatures — overlays rebuild
//   only when the visible result actually differs.
//   No full-grid rebuild exists outside explicit refreshAll()
//   (save-restore bulk path).
//
// PURE LOGIC — no three.js import; rendering goes through the
// per-type buildOverlay/disposeOverlay callbacks.
// ============================================================
import { DIRS, cellKey, oppositeEdge } from '../grid/Hex.js';
import {
  DIRECTION_NAMES, bitFor, maskFromString, maskToString,
  rotateMask, popcount, maskEdges, edgesToMask,
  SHAPES, MASK_LUT, classifyMask,
} from './Bitmask.js';
import { TypeRegistry, createType } from './TypeRegistry.js';
import { PropagationQueue } from './PropagationQueue.js';
import { resolveVariant, variantSignature, ResolveContext } from './VariantResolver.js';
import { RiverFlowSystem } from './RiverFlowSystem.js';

// re-export the mask toolkit so existing imports keep working
export {
  DIRECTION_NAMES, bitFor, maskFromString, maskToString,
  rotateMask, popcount, maskEdges, edgesToMask,
  SHAPES, MASK_LUT, classifyMask, cellKey,
};

// official plugin factory — `createType({...})` + `registerType(plugin)`
// is the stable extension contract (zero core edits for new systems)
export { createType };

export class AutoMeshSystem {
  /** @param grid GridManager-like store with .get(q,r) and .cells Map */
  constructor(grid) {
    this.grid = grid;
    this.registry = new TypeRegistry();
    this.flows = new Map(); // typeId -> RiverFlowSystem (flow-enabled types)
    this.queue = new PropagationQueue((q, r) => this._processTile(q, r));
    this.stats = { updates: 0, rebuilds: 0, flowRecomputes: 0 };

    // types whose connectivity depends on OTHER types' tiles
    // (affects[] hints) — rebuilt on registry change
    this._affectsIndex = new Map(); // typeId -> Set<typeId that must refresh>
    this.registry.onChange((event, rec) => {
      this._rebuildAffectsIndex();
      // hot rule swap: refresh every tile the type applies to so
      // the new rules take visible effect immediately
      if (event === 'update') this._refreshType(rec.typeId);
    });
  }

  // ==========================================================
  // TYPE REGISTRY API
  // ==========================================================

  /**
   * Register a connectivity type at runtime — new systems plug in
   * without modifying the engine. Accepts (typeId, config) or a
   * single plugin object from createType(). See TypeRegistry.
   */
  registerType(typeId, config) {
    const rec = this.registry.registerType(typeId, config);
    if (rec.flow) this.flows.set(rec.typeId, new RiverFlowSystem(this, rec));
    return this;
  }

  /**
   * Hot-swap rules of a registered type (resolvers, aliases,
   * connects…). Tiles of that type are refreshed automatically.
   * Returns the updated record.
   */
  setTypeRules(typeId, patch) {
    const rec = this.registry.setTypeRules(typeId, patch);
    // flow config may have been (re)attached / detached
    if (rec.flow && !this.flows.has(typeId)) {
      this.flows.set(typeId, new RiverFlowSystem(this, rec));
    } else if (rec.flow && this.flows.has(typeId)) {
      this.flows.get(typeId).type = rec;
    } else if (!rec.flow) {
      this.flows.delete(typeId);
    }
    return rec;
  }

  /** Remove a type at runtime; disposes its overlays everywhere. */
  unregisterType(typeId) {
    const rec = this.registry.unregisterType(typeId);
    if (!rec) return false;
    this.flows.delete(typeId);
    for (const cell of this.grid.cells.values()) {
      const entry = cell.autoMesh?.[typeId];
      if (entry) {
        this._disposeEntry(rec, cell, entry);
        delete cell.autoMesh[typeId];
      }
    }
    return true;
  }

  hasType(typeId) {
    return this.registry.has(typeId);
  }

  // ==========================================================
  // MASK + TOPOLOGY QUERIES
  // ==========================================================

  /**
   * Compute the 6-bit connectivity mask of `cell` for a type.
   * Bit i is set when:
   *   - this type's connects() approves the OUTBOUND link, and
   *   - the neighbor side accepts it (same-type acceptsFrom(),
   *     when defined) — asymmetric rules resolve here.
   */
  computeMask(typeId, cell) {
    const type = this.registry.require(typeId);
    let mask = 0;
    for (let i = 0; i < 6; i++) {
      if (this._edgeConnects(type, cell, i)) mask |= (1 << i);
    }
    return mask;
  }

  _edgeConnects(type, cell, edge) {
    const d = DIRS[edge];
    const nCell = this.grid.get(cell.q + d.q, cell.r + d.r);
    const ctx = { cell, neighbor: nCell, edge, grid: this.grid, engine: this };
    if (!type.connects(ctx)) return false;
    // asymmetric acceptance: if the neighbor runs the SAME type,
    // ask its acceptsFrom() (when declared) for the inbound side.
    if (nCell && type.acceptsFrom && type.appliesTo(nCell)) {
      return type.acceptsFrom({
        cell: nCell, from: cell, edge: oppositeEdge(edge),
        grid: this.grid, engine: this,
      });
    }
    return true;
  }

  /**
   * Logical connection list for a tile+type:
   * [{edge, neighbor, direction}] — direction is 'both' for
   * symmetric types, 'in'/'out' for directed (flow) types.
   */
  getConnections(typeId, q, r) {
    const cell = this.grid.get(q, r);
    if (!cell) return [];
    const type = this.registry.require(typeId);
    if (!type.appliesTo(cell)) return [];
    const mask = this.computeMask(typeId, cell);
    const flowNode = this.flows.get(typeId)?.get(q, r) || null;
    const out = [];
    for (const e of maskEdges(mask)) {
      const d = DIRS[e];
      let direction = 'both';
      if (flowNode) {
        if ((flowNode.outMask >> e) & 1) direction = 'out';
        else if ((flowNode.inMask >> e) & 1) direction = 'in';
      }
      out.push({ edge: e, neighbor: this.grid.get(cell.q + d.q, cell.r + d.r), direction });
    }
    return out;
  }

  /**
   * Run the variant resolution pipeline for a tile+type.
   * mask may be omitted (computed fresh).
   */
  resolveVariant(typeId, cell, mask = null) {
    const type = this.registry.require(typeId);
    const m = mask ?? this.computeMask(typeId, cell);
    const extras = {};
    const flowSys = this.flows.get(typeId);
    if (flowSys) extras.flow = flowSys.get(cell.q, cell.r);
    if (type.edgeClassifier) {
      const ctx = new ResolveContext(this, type, cell, m);
      extras.edgeClasses = type.edgeClassifier(ctx);
    }
    return resolveVariant(this, type, cell, m, extras);
  }

  /** Full stored automesh state for a tile: {typeId: entry, …} or null. */
  getTileData(q, r) {
    const cell = this.grid.get(q, r);
    return cell?.autoMesh || null;
  }

  /** Debug/back-compat: stored variant info of a cell for a type. */
  variantAt(typeId, q, r) {
    const cell = this.grid.get(q, r);
    return cell?.autoMesh?.[typeId] || null;
  }

  /** Back-compat: resolve a variant from a raw mask (no flow extras). */
  getVariant(typeId, mask, cell = null) {
    const type = this.registry.require(typeId);
    const fakeCell = cell || { q: 0, r: 0 };
    const extras = {};
    if (cell) {
      const flowSys = this.flows.get(typeId);
      if (flowSys) extras.flow = flowSys.get(cell.q, cell.r);
      if (type.edgeClassifier) {
        const ctx = new ResolveContext(this, type, cell, mask);
        extras.edgeClasses = type.edgeClassifier(ctx);
      }
    }
    return resolveVariant(this, type, fakeCell, mask, extras);
  }

  // ==========================================================
  // MUTATION API
  // ==========================================================

  /**
   * Change a tile's logical type and propagate locally.
   * (Convenience wrapper — placement systems may mutate the cell
   * themselves and call onTileChanged.)
   */
  setTileType(q, r, tileType, patch = null) {
    const cell = this.grid.get(q, r);
    if (!cell) return false;
    cell.tileType = tileType;
    if (patch) Object.assign(cell, patch);
    this.onTileChanged(q, r);
    return true;
  }

  /**
   * Entry point after a tile is placed or its connectors changed.
   * Enqueues ONLY the tile + its 6 neighbors (+ flow-component
   * refreshes) and flushes the deduplicated queue. Never scans
   * or rebuilds the whole world. Inside batch() the flush is
   * deferred until the batch closes.
   */
  onTileChanged(q, r) {
    this._recomputeFlowsAround(q, r);
    this.queue.enqueue(q, r);
    this._enqueueNeighbors(q, r);
    if (!this._batchDepth) this.queue.flush();
  }

  /**
   * BATCH UPDATE — group many tile changes into ONE deduplicated
   * flush (bulk placement, map generation, save import):
   *
   *   engine.batch(() => {
   *     for (const t of tiles) { grid.set(t); engine.onTileChanged(t.q, t.r); }
   *   });
   *
   * Nested batches are safe; the outermost one flushes.
   * @returns {number} tiles processed by the closing flush
   */
  batch(fn) {
    this._batchDepth = (this._batchDepth || 0) + 1;
    try {
      fn();
    } finally {
      this._batchDepth--;
    }
    return this._batchDepth === 0 ? this.queue.flush() : 0;
  }

  /** Entry point after a tile is removed. */
  onTileRemoved(q, r) {
    for (const flow of this.flows.values()) flow.removeNode(q, r);
    this._recomputeFlowsAround(q, r);
    this._enqueueNeighbors(q, r);
    if (!this._batchDepth) this.queue.flush();
  }

  /**
   * Recompute the tile at (q, r) immediately (no queue).
   * Returns true if anything visible changed.
   */
  updateTile(q, r) {
    return this._processTile(q, r);
  }

  /** Update the (up to) 6 existing neighbors of (q, r). Returns changed count. */
  refreshNeighbors(q, r) {
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const d = DIRS[i];
      const nq = q + d.q, nr = r + d.r;
      if (this.grid.get(nq, nr) && this._processTile(nq, nr)) n++;
    }
    return n;
  }

  /** Full pass — used once after save-restore (bulk world rebuild). */
  refreshAll() {
    // flow graphs first so variants see fresh orientation
    for (const [typeId, flow] of this.flows) {
      const type = this.registry.get(typeId);
      const done = new Set();
      for (const cell of this.grid.cells.values()) {
        const key = cellKey(cell.q, cell.r);
        if (done.has(key) || !type.appliesTo(cell)) continue;
        const changed = flow.recomputeComponent(cell.q, cell.r);
        for (const k of changed) done.add(k);
        done.add(key);
      }
    }
    for (const cell of this.grid.cells.values()) {
      this._processTile(cell.q, cell.r);
    }
  }

  /** Dispose every overlay + reset records (restart). */
  clear() {
    for (const cell of this.grid.cells.values()) {
      if (!cell.autoMesh) continue;
      for (const type of this.registry.all()) {
        const entry = cell.autoMesh[type.typeId];
        if (entry) this._disposeEntry(type, cell, entry);
      }
      cell.autoMesh = null;
    }
    for (const flow of this.flows.values()) flow.clear();
    this.queue.clear();
    this.stats.updates = 0;
    this.stats.rebuilds = 0;
    this.stats.flowRecomputes = 0;
  }

  // ==========================================================
  // INTERNALS
  // ==========================================================

  /** recompute + rebuild overlays for one tile; queue-processor */
  _processTile(q, r) {
    const cell = this.grid.get(q, r);
    if (!cell) return false;
    this.stats.updates++;
    let changed = false;
    if (!cell.autoMesh) cell.autoMesh = {};

    for (const type of this.registry.all()) {
      const prev = cell.autoMesh[type.typeId] || null;

      if (!type.appliesTo(cell)) {
        if (prev) {
          this._disposeEntry(type, cell, prev);
          delete cell.autoMesh[type.typeId];
          changed = true;
        }
        continue;
      }

      const mask = this.computeMask(type.typeId, cell);
      const variant = this.resolveVariant(type.typeId, cell, mask);
      const sig = variantSignature(variant);
      const hasOverlay = !!(type.buildOverlay && cell.group);

      // change detection: skip rebuild when nothing visible changed
      if (prev && prev.sig === sig && prev.hasOverlay === hasOverlay) continue;

      if (prev) this._disposeEntry(type, cell, prev);
      let handle = null;
      if (hasOverlay) handle = type.buildOverlay(cell, variant, this);
      cell.autoMesh[type.typeId] = { ...variant, sig, handle, hasOverlay };
      this.stats.rebuilds++;
      changed = true;
    }
    return changed;
  }

  _enqueueNeighbors(q, r) {
    for (let i = 0; i < 6; i++) {
      const d = DIRS[i];
      const nq = q + d.q, nr = r + d.r;
      if (this.grid.get(nq, nr)) this.queue.enqueue(nq, nr);
    }
  }

  /**
   * Recompute directed-flow components touching (q, r): the tile
   * itself if flow-typed, plus flow-typed neighbors (a placed or
   * removed tile can re-orient an adjacent river). Every node
   * whose flow data changed is enqueued for a variant refresh —
   * this is how a NEW lake downstream flips arrows on an OLD
   * river without any global pass.
   */
  _recomputeFlowsAround(q, r) {
    for (const [typeId, flow] of this.flows) {
      const type = this.registry.get(typeId);
      const seeds = [];
      const cell = this.grid.get(q, r);
      if (cell && type.appliesTo(cell)) seeds.push([q, r]);
      for (let i = 0; i < 6; i++) {
        const d = DIRS[i];
        const nc = this.grid.get(q + d.q, r + d.r);
        if (nc && type.appliesTo(nc)) seeds.push([nc.q, nc.r]);
      }
      const done = new Set();
      for (const [sq, sr] of seeds) {
        const key = cellKey(sq, sr);
        if (done.has(key)) continue;
        const changedKeys = flow.recomputeComponent(sq, sr);
        this.stats.flowRecomputes++;
        done.add(key);
        for (const k of changedKeys) {
          done.add(k);
          const [cq, cr] = k.split(',').map(Number);
          this.queue.enqueue(cq, cr);
        }
      }
    }
  }

  /** refresh every placed tile a given type applies to (rule hot-swap) */
  _refreshType(typeId) {
    const type = this.registry.get(typeId);
    if (!type) return;
    for (const cell of this.grid.cells.values()) {
      if (type.appliesTo(cell) || cell.autoMesh?.[typeId]) {
        this.queue.enqueue(cell.q, cell.r);
      }
    }
    if (!this._batchDepth) this.queue.flush();
  }

  _rebuildAffectsIndex() {
    this._affectsIndex.clear();
    for (const type of this.registry.all()) {
      for (const other of type.affects) {
        if (!this._affectsIndex.has(other)) this._affectsIndex.set(other, new Set());
        this._affectsIndex.get(other).add(type.typeId);
      }
    }
  }

  _disposeEntry(type, cell, entry) {
    if (entry.handle != null && type.disposeOverlay) {
      type.disposeOverlay(entry.handle, cell);
    }
  }
}
