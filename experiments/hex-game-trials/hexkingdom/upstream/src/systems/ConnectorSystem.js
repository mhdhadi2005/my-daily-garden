// ============================================================
// ConnectorSystem — auto-sync river & road edges between tiles.
// Rivers extend through compatible neighbors on placement.
// Roads are player-built only and latch onto up to 6 neighbors
// when conditions match (existing roads, settlements).
// ============================================================
import { DIRS, oppositeEdge } from '../grid/Hex.js';
import { SETTLEMENT_TYPES } from '../automesh/AutoMeshAdapters.js';
import { events } from '../core/Events.js';

/** Terrain that blocks a river strip from continuing. */
const RIVER_BLOCKERS = new Set(['mountain', 'lake']);

/** Tile types where the player may lay a road. */
export const ROAD_TILES = new Set([
  'field', 'meadow', 'forest', 'hills', 'quarry', 'river', 'swamp', 'village', 'ruins',
]);

function ensureList(cell, key) {
  if (!cell[key]) cell[key] = [];
  return cell[key];
}

function addEdge(cell, key, edge) {
  const list = ensureList(cell, key);
  if (list.includes(edge)) return false;
  list.push(edge);
  list.sort((a, b) => a - b);
  return true;
}

export function canAcceptRiver(cell) {
  return cell && !RIVER_BLOCKERS.has(cell.tileType);
}

export function canHaveRoad(cell) {
  return cell && ROAD_TILES.has(cell.tileType);
}

/**
 * Bidirectionally sync river strips for one cell and its neighbors.
 * @returns {Set<object>} cells whose riverEdges changed
 */
export function syncRiverConnectors(cell, grid) {
  const changed = new Set();
  for (let i = 0; i < 6; i++) {
    const d = DIRS[i];
    const nCell = grid.get(cell.q + d.q, cell.r + d.r);
    if (!nCell) continue;
    const opp = oppositeEdge(i);

    if (nCell.riverEdges?.includes(opp) && canAcceptRiver(cell)) {
      if (addEdge(cell, 'riverEdges', i)) changed.add(cell);
    }
    if (cell.riverEdges?.includes(i) && canAcceptRiver(nCell)) {
      if (addEdge(nCell, 'riverEdges', opp)) changed.add(nCell);
    }
  }
  return changed;
}

/** After placing a tile, sync rivers locally and emit if anything moved. */
export function syncRiversOnPlacement(cell, grid) {
  const changed = syncRiverConnectors(cell, grid);
  for (const c of changed) {
    if (c !== cell) syncRiverConnectors(c, grid);
  }
  if (changed.size) events.emit('connectors:changed', { type: 'river', cells: [...changed] });
  return changed;
}

/** Full pass after save-restore (v2 saves lack connector data). */
export function syncAllRivers(grid) {
  const changed = new Set();
  for (const cell of grid.cells.values()) {
    for (const c of syncRiverConnectors(cell, grid)) changed.add(c);
  }
  if (changed.size) events.emit('connectors:changed', { type: 'river', cells: [...changed] });
  return changed;
}

/**
 * Lay road edges on `cell`, auto-connecting to every qualifying neighbor (≤6).
 * @returns {Set<object>} cells whose roadEdges changed
 */
export function buildRoadConnections(cell, grid) {
  if (!canHaveRoad(cell)) return new Set();
  const changed = new Set();

  for (let i = 0; i < 6; i++) {
    const d = DIRS[i];
    const nCell = grid.get(cell.q + d.q, cell.r + d.r);
    if (!nCell) continue;
    const opp = oppositeEdge(i);

    const nSettlement = SETTLEMENT_TYPES.has(nCell.tileType) && nCell.acceptsRoads !== false;
    const nHasRoads = !!nCell.roadEdges?.length;
    const nPointsAtUs = nCell.roadEdges?.includes(opp);

    if (!nSettlement && !nHasRoads && !nPointsAtUs) continue;

    if (addEdge(cell, 'roadEdges', i)) changed.add(cell);

    if (canHaveRoad(nCell) && !SETTLEMENT_TYPES.has(nCell.tileType)) {
      if (addEdge(nCell, 'roadEdges', opp)) changed.add(nCell);
    }
  }

  if (changed.size) {
    events.emit('connectors:changed', { type: 'road', cells: [...changed] });
    if (cell.riverEdges?.length && cell.roadEdges?.length) {
      events.emit('connectors:bridge-needed', { cell });
    }
  }
  return changed;
}

export class ConnectorSystem {
  constructor(grid) {
    this.grid = grid;
  }

  syncRiversOnPlacement(cell) {
    return syncRiversOnPlacement(cell, this.grid);
  }

  syncAllRivers() {
    return syncAllRivers(this.grid);
  }

  buildRoad(cell) {
    return buildRoadConnections(cell, this.grid);
  }
}
