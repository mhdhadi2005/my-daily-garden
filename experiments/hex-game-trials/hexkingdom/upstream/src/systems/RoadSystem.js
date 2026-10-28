// ============================================================
// RoadSystem — gameplay connectivity graph built from road
// edges on placed tiles. Roads are graph edges, villages are
// terminal nodes. BFS components give kingdom networks, trade
// routes between villages, production / growth bonuses and the
// castle-evolution unlock. Also tracks auto-bridge cells where
// roads cross rivers.
// ============================================================
import { cellKey, DIRS, oppositeEdge } from '../grid/Hex.js';
import { events } from '../core/Events.js';

export class RoadSystem {
  constructor(grid) {
    this.grid = grid;
    this.nodes = new Map();       // key -> {q, r, cell, links: Set<key>}
    this.components = [];         // array of Set<key>
    this.componentOf = new Map(); // key -> component index
    this.tradeRoutes = [];        // [{a: key, b: key, length}]
    this.bridgeCells = [];        // cells where a road crosses a river
    this.connectedVillages = 0;
    this.totalVillages = 0;
    this._routeKeys = new Set();  // known trade routes (for delta detection)

    events.on('tile:placed', () => this.rebuild());
    events.on('connectors:changed', ({ type }) => { if (type === 'road') this.rebuild(); });
  }

  /** True if cell participates in the road graph. */
  _isNode(cell) {
    return (cell.roadEdges && cell.roadEdges.length > 0) || cell.tileType === 'village';
  }

  /** True if two adjacent cells are linked through edge i of `a`. */
  _linked(a, b, i) {
    const opp = oppositeEdge(i);
    const aRoad = a.roadEdges && a.roadEdges.includes(i);
    const bRoad = b.roadEdges && b.roadEdges.includes(opp);
    if (aRoad && bRoad) return true;
    // a road terminating into a village edge connects the village
    if (aRoad && b.tileType === 'village') return true;
    if (bRoad && a.tileType === 'village') return true;
    return false;
  }

  /** Recompute the whole graph from grid state (deterministic). */
  rebuild() {
    this.nodes.clear();
    this.components.length = 0;
    this.componentOf.clear();
    this.bridgeCells.length = 0;

    // gather nodes
    for (const cell of this.grid.cells.values()) {
      if (this._isNode(cell)) {
        this.nodes.set(cellKey(cell.q, cell.r), { q: cell.q, r: cell.r, cell, links: new Set() });
      }
      if (cell.roadEdges?.length && cell.riverEdges?.length) {
        this.bridgeCells.push(cell);
      }
    }

    // gather edges
    for (const node of this.nodes.values()) {
      const cell = node.cell;
      for (let i = 0; i < 6; i++) {
        const d = DIRS[i];
        const nCell = this.grid.get(cell.q + d.q, cell.r + d.r);
        if (!nCell || !this._isNode(nCell)) continue;
        if (this._linked(cell, nCell, i)) {
          const nKey = cellKey(nCell.q, nCell.r);
          node.links.add(nKey);
          const other = this.nodes.get(nKey);
          if (other) other.links.add(cellKey(cell.q, cell.r));
        }
      }
    }

    // BFS connected components (sorted keys for determinism)
    const visited = new Set();
    const sortedKeys = [...this.nodes.keys()].sort();
    for (const start of sortedKeys) {
      if (visited.has(start)) continue;
      const comp = new Set([start]);
      visited.add(start);
      const queue = [start];
      while (queue.length) {
        const k = queue.shift();
        for (const nk of this.nodes.get(k).links) {
          if (!visited.has(nk)) {
            visited.add(nk);
            comp.add(nk);
            queue.push(nk);
          }
        }
      }
      this.componentOf.set(start, this.components.length);
      for (const k of comp) this.componentOf.set(k, this.components.length);
      this.components.push(comp);
    }

    this._recomputeVillageStats();
    this._recomputeTradeRoutes();

    events.emit('roads:changed', {
      connectedVillages: this.connectedVillages,
      totalVillages: this.totalVillages,
      routes: this.tradeRoutes.length,
      components: this.components.length,
      bridges: this.bridgeCells.length,
    });
  }

  _recomputeVillageStats() {
    let total = 0;
    let connected = 0;
    for (const cell of this.grid.cells.values()) {
      if (cell.tileType !== 'village') continue;
      total++;
      if (this.isVillageConnected(cell)) connected++;
    }
    this.totalVillages = total;
    this.connectedVillages = connected;
  }

  _recomputeTradeRoutes() {
    // trade route: pair of DISTINCT villages in the same component,
    // linked through at least one actual road tile.
    this.tradeRoutes.length = 0;
    const villagesByComp = new Map();
    for (const [key, node] of this.nodes) {
      if (node.cell.tileType !== 'village') continue;
      const comp = this.componentOf.get(key);
      if (comp === undefined) continue;
      if (!villagesByComp.has(comp)) villagesByComp.set(comp, []);
      villagesByComp.get(comp).push(key);
    }
    for (const list of villagesByComp.values()) {
      list.sort();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const path = this.pathBetween(list[i], list[j]);
          if (path && path.length > 1) {
            this.tradeRoutes.push({ a: list[i], b: list[j], length: path.length - 1 });
          }
        }
      }
    }
  }

  /** number of trade routes created since the last call (score hook) */
  consumeNewRoutes() {
    let fresh = 0;
    for (const r of this.tradeRoutes) {
      const rk = r.a + '|' + r.b;
      if (!this._routeKeys.has(rk)) {
        this._routeKeys.add(rk);
        fresh++;
      }
    }
    return fresh;
  }

  /** True if a village cell has at least one road link into the network. */
  isVillageConnected(cell) {
    const node = this.nodes.get(cellKey(cell.q, cell.r));
    if (!node) return false;
    // connected means: linked to at least one road tile (not just another village)
    for (const nk of node.links) {
      const other = this.nodes.get(nk);
      if (other && other.cell.roadEdges?.length) return true;
      if (other) return true; // direct village-village adjacency also counts
    }
    return false;
  }

  /** True if any node exists at (q, r) and belongs to a component with >1 node. */
  isConnected(q, r) {
    const key = cellKey(q, r);
    const comp = this.componentOf.get(key);
    if (comp === undefined) return false;
    return this.components[comp].size > 1;
  }

  /** BFS shortest path between two node keys → array of {q, r} or null. */
  pathBetween(keyA, keyB) {
    if (keyA === keyB) return null;
    if (!this.nodes.has(keyA) || !this.nodes.has(keyB)) return null;
    if (this.componentOf.get(keyA) !== this.componentOf.get(keyB)) return null;
    const prev = new Map([[keyA, null]]);
    const queue = [keyA];
    while (queue.length) {
      const k = queue.shift();
      if (k === keyB) break;
      const links = [...this.nodes.get(k).links].sort(); // deterministic order
      for (const nk of links) {
        if (!prev.has(nk)) {
          prev.set(nk, k);
          queue.push(nk);
        }
      }
    }
    if (!prev.has(keyB)) return null;
    const path = [];
    let cur = keyB;
    while (cur) {
      const n = this.nodes.get(cur);
      path.push({ q: n.q, r: n.r });
      cur = prev.get(cur);
    }
    path.reverse();
    return path;
  }

  /** All village node keys in the same component as `key` (excluding itself). */
  villagesReachableFrom(key) {
    const comp = this.componentOf.get(key);
    if (comp === undefined) return [];
    const out = [];
    for (const k of this.components[comp]) {
      if (k === key) continue;
      const n = this.nodes.get(k);
      if (n && n.cell.tileType === 'village') out.push(k);
    }
    return out.sort();
  }

  /** production multiplier a tile gets from being road-connected */
  productionBonusFor(cell) {
    const key = cellKey(cell.q, cell.r);
    if (!this.componentOf.has(key)) return 1.0;
    if (!this.isConnected(cell.q, cell.r)) return 1.0;
    if (cell.tileType === 'village') {
      // villages scale with reachable trade partners
      const partners = this.villagesReachableFrom(key).length;
      return 1.5 + Math.min(partners, 4) * 0.25;
    }
    return 1.2;
  }

  /** population growth multiplier for connected villages */
  growthBonusFor(cell) {
    return this.isVillageConnected(cell) ? 1.5 : 1.0;
  }

  serialize() {
    // graph is fully derived from grid state — save summary only (debug/UI)
    return {
      connectedVillages: this.connectedVillages,
      totalVillages: this.totalVillages,
      routes: this.tradeRoutes.length,
    };
  }

  clear() {
    this.nodes.clear();
    this.components.length = 0;
    this.componentOf.clear();
    this.tradeRoutes.length = 0;
    this.bridgeCells.length = 0;
    this._routeKeys.clear();
    this.connectedVillages = 0;
    this.totalVillages = 0;
  }
}
