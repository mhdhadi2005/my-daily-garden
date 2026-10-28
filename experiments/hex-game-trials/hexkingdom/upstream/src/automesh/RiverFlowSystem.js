// ============================================================
// RiverFlowSystem — directed-graph layer on top of the
// undirected connectivity masks. Rivers are NOT just masks:
// every river tile is a node in a flow graph with oriented
// edges (inMask / outMask), a role, and hook tags.
//
// ROLES
//   source  — no inputs, 1+ outputs (spring)
//   mouth   — flows into a water body (river -> lake transition)
//   merge   — 2+ inputs converge into fewer outputs
//   split   — 1 input fans out into 2+ outputs
//   stream  — 1 in, 1 out (plain flowing segment)
//   end     — 1+ inputs, no outputs, no lake (river soaks away)
//   still   — isolated river tile with no connections yet
//
// ORIENTATION ALGORITHM (per connected component)
//   1. Gather the component by undirected traversal over the
//      type's connectivity mask (LOCAL: only the touched river
//      network, never the world).
//   2. Find sink anchors (edges into lakes / config.isSink) and
//      source anchors (config.isSource, e.g. mountain-fed ends).
//   3. Multi-source BFS:
//        - if sinks exist:  distance-to-sink;   flow = downhill
//          toward the nearest sink (high dist -> low dist)
//        - else if sources: distance-from-source; flow = away
//          from the source (low dist -> high dist)
//        - else: deterministic pseudo-source (lowest cell key)
//   4. Each undirected edge is oriented by the distance field;
//      ties broken deterministically by cell key so results are
//      stable across runs / saves.
//   5. Roles derive from popcounts of inMask/outMask; hooks
//      (e.g. future waterfalls) tag nodes afterwards.
//
// MERGE:  a node whose oriented inputs >= 2  (2+ inputs -> 1 output)
// SPLIT:  a node whose oriented outputs >= 2 (1 input -> multiple streams)
// Both fall out of the orientation naturally — no special cases.
// Merge/split beat 'mouth': a confluence NEXT TO a lake is still
// a confluence (its sinkMask records the lake edge separately).
//
// TRUE DIRECTED GRAPH
//   Beyond per-node masks, the system exposes real graph
//   traversal: upstream()/downstream() neighbor queries,
//   traceUpstream()/traceDownstream() walks, componentOf(),
//   sources()/mouths() per component. None of these re-derive
//   anything from raw bitmasks — they walk the oriented node
//   graph, so future gameplay (pollution spreading downstream,
//   fish migrating upstream) plugs straight in.
// ============================================================
import { cellKey, DIRS, oppositeEdge } from '../grid/Hex.js';
import { popcount, maskEdges } from './Bitmask.js';

export class FlowNode {
  constructor(q, r) {
    this.q = q;
    this.r = r;
    this.inMask = 0;    // edges water arrives FROM
    this.outMask = 0;   // edges water leaves THROUGH
    this.sinkMask = 0;  // subset of outMask that enters a lake
    this.role = 'still';
    this.depth = 0;     // distance along the flow field
    this.tags = [];     // hook results ('waterfall', …)
  }
}

export class RiverFlowSystem {
  /**
   * @param engine AutoMeshSystem (for grid + mask access)
   * @param type   normalized type record whose `flow` config drives us:
   *   flow: {
   *     isSource(cell, engine) -> boolean   natural spring detector
   *     isSinkEdge(cell, nCell, edge, engine) -> boolean  lake/ocean edge
   *     hooks: [{name, test(node, cell, engine)}]  optional taggers
   *   }
   */
  constructor(engine, type) {
    this.engine = engine;
    this.type = type;
    this.nodes = new Map(); // cellKey -> FlowNode
    this.stats = { recomputes: 0, nodesVisited: 0 };
  }

  get(q, r) {
    return this.nodes.get(cellKey(q, r)) || null;
  }

  /**
   * Recompute the flow component containing (q, r).
   * Returns the Set of cell keys whose flow data CHANGED —
   * the engine enqueues exactly those for variant refresh.
   */
  recomputeComponent(q, r) {
    this.stats.recomputes++;
    const { engine, type } = this;
    const startCell = engine.grid.get(q, r);
    const changed = new Set();

    // tile no longer part of the network -> drop node, neighbors recompute separately
    if (!startCell || !type.appliesTo(startCell)) {
      const key = cellKey(q, r);
      if (this.nodes.delete(key)) changed.add(key);
      return changed;
    }

    // ---- 1. gather component (undirected, local) ----
    const comp = new Map(); // key -> {cell, mask}
    const stack = [startCell];
    const seen = new Set([cellKey(q, r)]);
    while (stack.length) {
      const cell = stack.pop();
      const mask = engine.computeMask(type.typeId, cell);
      comp.set(cellKey(cell.q, cell.r), { cell, mask });
      this.stats.nodesVisited++;
      for (const e of maskEdges(mask)) {
        const d = DIRS[e];
        const nc = engine.grid.get(cell.q + d.q, cell.r + d.r);
        if (!nc || !type.appliesTo(nc)) continue; // lake edge etc.
        const k = cellKey(nc.q, nc.r);
        if (!seen.has(k)) { seen.add(k); stack.push(nc); }
      }
    }

    // ---- 2. anchors ----
    const flowCfg = type.flow || {};
    const sinkDist = new Map();   // key -> 0 for sink-adjacent nodes
    const sourceDist = new Map();
    const sinkEdges = new Map();  // key -> mask of edges entering lakes
    for (const [key, { cell, mask }] of comp) {
      let sm = 0;
      if (flowCfg.isSinkEdge) {
        for (const e of maskEdges(mask)) {
          const d = DIRS[e];
          const nc = engine.grid.get(cell.q + d.q, cell.r + d.r);
          if (nc && !type.appliesTo(nc) && flowCfg.isSinkEdge(cell, nc, e, engine)) {
            sm |= (1 << e);
          }
        }
      }
      if (sm) { sinkEdges.set(key, sm); sinkDist.set(key, 0); }
      if (flowCfg.isSource && flowCfg.isSource(cell, engine)) sourceDist.set(key, 0);
    }

    // ---- 3. distance field ----
    const useSinks = sinkDist.size > 0;
    let dist = useSinks ? sinkDist : sourceDist;
    if (dist.size === 0) {
      // no anchors: deterministic pseudo-source = lowest key
      const rootKey = [...comp.keys()].sort()[0];
      dist = new Map([[rootKey, 0]]);
    }
    const queue = [...dist.keys()];
    for (let qi = 0; qi < queue.length; qi++) {
      const key = queue[qi];
      const { cell, mask } = comp.get(key);
      const d0 = dist.get(key);
      for (const e of maskEdges(mask)) {
        const d = DIRS[e];
        const nk = cellKey(cell.q + d.q, cell.r + d.r);
        if (!comp.has(nk) || dist.has(nk)) continue;
        dist.set(nk, d0 + 1);
        queue.push(nk);
      }
    }
    // disconnected leftovers (shouldn't happen in one component) — safety
    for (const key of comp.keys()) if (!dist.has(key)) dist.set(key, Infinity);

    // ---- 4. orient edges + build nodes ----
    const fresh = new Map();
    for (const [key, { cell, mask }] of comp) {
      const node = new FlowNode(cell.q, cell.r);
      node.depth = dist.get(key);
      node.sinkMask = sinkEdges.get(key) || 0;
      for (const e of maskEdges(mask)) {
        const d = DIRS[e];
        const nk = cellKey(cell.q + d.q, cell.r + d.r);
        if (!comp.has(nk)) {
          // edge leaves the river network: sink edge -> outflow, else neutral outflow
          node.outMask |= (1 << e);
          continue;
        }
        const myD = dist.get(key), nD = dist.get(nk);
        let flowsOut;
        if (useSinks) flowsOut = nD < myD || (nD === myD && nk < key);  // toward sink
        else flowsOut = nD > myD || (nD === myD && nk > key);           // away from source
        if (flowsOut) node.outMask |= (1 << e);
        else node.inMask |= (1 << e);
      }
      node.role = classifyRole(node);
      fresh.set(key, node);
    }

    // ---- 5. hooks (waterfalls & future extensions) ----
    if (flowCfg.hooks) {
      for (const [key, node] of fresh) {
        const cell = comp.get(key).cell;
        for (const hook of flowCfg.hooks) {
          if (hook.test(node, cell, engine)) node.tags.push(hook.name);
        }
      }
    }

    // ---- diff against previous state, store, report changes ----
    for (const [key, node] of fresh) {
      const prev = this.nodes.get(key);
      if (!prev || prev.inMask !== node.inMask || prev.outMask !== node.outMask ||
          prev.role !== node.role || prev.tags.join() !== node.tags.join()) {
        changed.add(key);
      }
      this.nodes.set(key, node);
    }
    // nodes that fell out of this component but pointed into it get
    // recomputed by their own onTileChanged; stale-node GC:
    return changed;
  }

  removeNode(q, r) {
    this.nodes.delete(cellKey(q, r));
  }

  clear() {
    this.nodes.clear();
  }

  // ==========================================================
  // DIRECTED GRAPH API — real topology queries, not mask reads
  // ==========================================================

  /** FlowNodes that feed water INTO (q, r) — the upstream neighbors. */
  upstream(q, r) {
    const node = this.get(q, r);
    if (!node) return [];
    const out = [];
    for (const e of maskEdges(node.inMask)) {
      const d = DIRS[e];
      const n = this.get(q + d.q, r + d.r);
      if (n) out.push(n);
    }
    return out;
  }

  /**
   * FlowNodes that (q, r) feeds water INTO — downstream neighbors.
   * Edges that exit the river network (lake mouths, drying deltas)
   * have no node and are simply not listed; use node.sinkMask to
   * inspect lake-exit edges.
   */
  downstream(q, r) {
    const node = this.get(q, r);
    if (!node) return [];
    const out = [];
    for (const e of maskEdges(node.outMask)) {
      const d = DIRS[e];
      const n = this.get(q + d.q, r + d.r);
      if (n) out.push(n);
    }
    return out;
  }

  /**
   * Walk the directed graph from (q, r) following outMask edges
   * (BFS, handles splits + merges + cycles safely).
   * @returns FlowNode[] in visit order, starting node included
   */
  traceDownstream(q, r, limit = 4096) {
    return this._trace(q, r, (n) => this.downstream(n.q, n.r), limit);
  }

  /** Walk against the flow toward every contributing source. */
  traceUpstream(q, r, limit = 4096) {
    return this._trace(q, r, (n) => this.upstream(n.q, n.r), limit);
  }

  _trace(q, r, next, limit) {
    const start = this.get(q, r);
    if (!start) return [];
    const seen = new Set([cellKey(q, r)]);
    const order = [start];
    for (let i = 0; i < order.length && order.length < limit; i++) {
      for (const n of next(order[i])) {
        const k = cellKey(n.q, n.r);
        if (!seen.has(k)) { seen.add(k); order.push(n); }
      }
    }
    return order;
  }

  /** Every FlowNode in the connected component containing (q, r). */
  componentOf(q, r) {
    const start = this.get(q, r);
    if (!start) return [];
    const seen = new Set([cellKey(q, r)]);
    const order = [start];
    for (let i = 0; i < order.length; i++) {
      const n = order[i];
      for (const m of [...this.upstream(n.q, n.r), ...this.downstream(n.q, n.r)]) {
        const k = cellKey(m.q, m.r);
        if (!seen.has(k)) { seen.add(k); order.push(m); }
      }
    }
    return order;
  }

  /** All source nodes of the component containing (q, r). */
  sources(q, r) {
    return this.componentOf(q, r).filter((n) => n.role === 'source' || n.role === 'still');
  }

  /** All mouth nodes (river -> lake transitions) of the component. */
  mouths(q, r) {
    return this.componentOf(q, r).filter((n) => n.sinkMask !== 0);
  }
}

/**
 * Derive the semantic role from oriented masks.
 * PRIORITY: merge/split are topology facts and beat 'mouth' —
 * a two-input confluence that empties into a lake is still a
 * merge (node.sinkMask keeps the lake edge for rendering).
 */
export function classifyRole(node) {
  const inN = popcount(node.inMask);
  const outN = popcount(node.outMask);
  if (inN === 0 && outN === 0) return 'still';
  if (inN >= 2) return 'merge';                 // 2+ inputs converge
  if (inN >= 1 && outN >= 2) return 'split';    // 1 input fans out
  if (node.sinkMask) return 'mouth';            // river -> lake transition
  if (inN === 0) return 'source';
  if (outN === 0) return 'end';
  return 'stream';
}
