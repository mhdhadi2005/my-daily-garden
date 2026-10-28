// ============================================================
// GridManager — infinite sparse hex grid store + placement logic.
// Holds Cell records: {q, r, tileType, rotation, edges[6], group}
// ============================================================
import { cellKey, DIRS, oppositeEdge, neighbors } from './Hex.js';

export class GridManager {
  constructor() {
    this.cells = new Map(); // key -> cell record
  }

  get size() {
    return this.cells.size;
  }

  has(q, r) {
    return this.cells.has(cellKey(q, r));
  }

  get(q, r) {
    return this.cells.get(cellKey(q, r)) || null;
  }

  set(cell) {
    this.cells.set(cellKey(cell.q, cell.r), cell);
  }

  remove(q, r) {
    this.cells.delete(cellKey(q, r));
  }

  clear() {
    this.cells.clear();
  }

  /** Valid placement: empty cell adjacent to at least one placed tile (or first tile). */
  canPlace(q, r) {
    if (this.has(q, r)) return false;
    if (this.cells.size === 0) return q === 0 && r === 0;
    return neighbors(q, r).some((n) => this.has(n.q, n.r));
  }

  /** All empty cells adjacent to placed tiles — used for placement ghosts. */
  frontierCells() {
    const out = new Map();
    if (this.cells.size === 0) {
      out.set(cellKey(0, 0), { q: 0, r: 0 });
      return [...out.values()];
    }
    for (const cell of this.cells.values()) {
      for (const n of neighbors(cell.q, cell.r)) {
        const k = cellKey(n.q, n.r);
        if (!this.cells.has(k) && !out.has(k)) out.set(k, n);
      }
    }
    return [...out.values()];
  }

  /**
   * Evaluate edge matches for placing `edges` (already rotated) at (q, r).
   * Returns {matches, total, perEdge:[{dir, neighborCell, myEdge, theirEdge, match}]}
   */
  evaluateEdges(q, r, edges) {
    let matches = 0;
    let total = 0;
    const perEdge = [];
    for (let i = 0; i < 6; i++) {
      const d = DIRS[i];
      const nCell = this.get(q + d.q, r + d.r);
      if (!nCell) continue;
      total++;
      const myEdge = edges[i];
      const theirEdge = nCell.edges[oppositeEdge(i)];
      const match = myEdge === theirEdge;
      if (match) matches++;
      perEdge.push({ dir: i, neighborCell: nCell, myEdge, theirEdge, match });
    }
    return { matches, total, perEdge };
  }

  /**
   * Flood-fill size of the connected region of the same tileType containing (q, r).
   */
  regionSize(q, r) {
    const start = this.get(q, r);
    if (!start) return 0;
    const type = start.tileType;
    const seen = new Set([cellKey(q, r)]);
    const stack = [start];
    while (stack.length) {
      const c = stack.pop();
      for (const n of neighbors(c.q, c.r)) {
        const k = cellKey(n.q, n.r);
        if (seen.has(k)) continue;
        const nc = this.cells.get(k);
        if (nc && nc.tileType === type) {
          seen.add(k);
          stack.push(nc);
        }
      }
    }
    return seen.size;
  }

  /**
   * All connected clusters of cells matching `predicate`.
   * Returns array of arrays of cells (deterministic order: sorted keys).
   */
  clusters(predicate) {
    const seen = new Set();
    const out = [];
    const keys = [...this.cells.keys()].sort();
    for (const key of keys) {
      if (seen.has(key)) continue;
      const cell = this.cells.get(key);
      if (!predicate(cell)) continue;
      const cluster = [cell];
      seen.add(key);
      const stack = [cell];
      while (stack.length) {
        const c = stack.pop();
        for (const n of neighbors(c.q, c.r)) {
          const k = cellKey(n.q, n.r);
          if (seen.has(k)) continue;
          const nc = this.cells.get(k);
          if (nc && predicate(nc)) {
            seen.add(k);
            cluster.push(nc);
            stack.push(nc);
          }
        }
      }
      out.push(cluster);
    }
    return out;
  }

  /**
   * Border edge segments of a set of cells: for every cell edge that does
   * NOT face another cell of the set, emit {cell, edge}. Used by WallSystem.
   */
  clusterBorder(cluster) {
    const inSet = new Set(cluster.map((c) => cellKey(c.q, c.r)));
    const border = [];
    for (const cell of cluster) {
      for (let i = 0; i < 6; i++) {
        const d = DIRS[i];
        if (!inSet.has(cellKey(cell.q + d.q, cell.r + d.r))) {
          border.push({ cell, edge: i });
        }
      }
    }
    return border;
  }

  /** cells whose roadEdges connect through edge i to a neighbor's road/village */
  roadNeighbors(cell) {
    const out = [];
    if (!cell.roadEdges || !cell.roadEdges.length) return out;
    for (const e of cell.roadEdges) {
      const d = DIRS[e];
      const nCell = this.get(cell.q + d.q, cell.r + d.r);
      if (!nCell) continue;
      const opp = oppositeEdge(e);
      if ((nCell.roadEdges && nCell.roadEdges.includes(opp)) || nCell.tileType === 'village') {
        out.push({ cell: nCell, edge: e });
      }
    }
    return out;
  }

  /** serialize for save system */
  serialize() {
    return [...this.cells.values()].map((c) => ({
      q: c.q, r: c.r, t: c.tileType, rot: c.rotation, seed: c.seed,
    }));
  }
}
