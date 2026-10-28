// ============================================================
// TerritorySystem — tile ownership & border control.
// Every PLACED cell has an `owner` ('player' or a faction id).
// Hostile factions can capture player border tiles (production
// stops there); the crown's influence slowly reclaims lost
// tiles, spending influence points. Borders therefore shift
// dynamically over time. Pure game logic — no rendering.
// ============================================================
import { cellKey, neighbors } from '../grid/Hex.js';
import { events } from '../core/Events.js';
import {
  RECLAIM_BASE_COST, RECLAIM_COST_PER_CAPTURE,
  CAPTURE_STABILITY_HIT, RECLAIM_STABILITY_GAIN,
  INFLUENCE_SPREAD_INTERVAL,
} from '../config/EconomyConfig.js';

export class TerritorySystem {
  /**
   * @param grid GridManager
   * @param resources ResourceSystem
   */
  constructor(grid, resources) {
    this.grid = grid;
    this.resources = resources;
    this.captured = new Map();   // key -> {factionId, at}
    this.capturesSuffered = 0;   // lifetime counter (raises reclaim cost)
    this._spreadT = 0;

    // every new tile the player places belongs to the player
    events.on('tile:placed', ({ cell }) => {
      if (!cell.owner) cell.owner = 'player';
    });
  }

  /** current influence cost to reclaim one tile */
  get reclaimCost() {
    return RECLAIM_BASE_COST + Math.min(this.capturesSuffered, 10) * RECLAIM_COST_PER_CAPTURE;
  }

  /** player-owned cells that touch a non-player or empty cell */
  playerBorderCells() {
    const out = [];
    for (const cell of this.grid.cells.values()) {
      if (cell.owner && cell.owner !== 'player') continue;
      for (const n of neighbors(cell.q, cell.r)) {
        const nc = this.grid.get(n.q, n.r);
        if (!nc || (nc.owner && nc.owner !== 'player')) { out.push(cell); break; }
      }
    }
    return out;
  }

  /** a faction seizes a player tile */
  capture(cell, factionId, factionLabel = '') {
    if (!cell || (cell.owner && cell.owner !== 'player')) return false;
    cell.owner = factionId;
    this.captured.set(cellKey(cell.q, cell.r), { factionId, at: performance.now() });
    this.capturesSuffered++;
    this.resources.adjustStability(CAPTURE_STABILITY_HIT);
    events.emit('territory:captured', { cell, factionId, factionLabel });
    events.emit('territory:changed', {});
    return true;
  }

  /** the crown reclaims a captured tile (costs influence) */
  reclaim(cell) {
    const key = cellKey(cell.q, cell.r);
    if (!this.captured.has(key)) return false;
    const cost = this.reclaimCost;
    if (!this.resources.spend({ influence: cost }, 'Reclaim territory')) return false;
    cell.owner = 'player';
    this.captured.delete(key);
    this.resources.adjustStability(RECLAIM_STABILITY_GAIN);
    events.emit('territory:reclaimed', { cell });
    events.emit('territory:changed', {});
    return true;
  }

  /**
   * Passive influence spread: every interval, if the player can
   * afford it, the captured tile closest to the kingdom heart is
   * automatically reclaimed. Influence literally pushes borders back.
   */
  update(dt) {
    if (!this.captured.size) return;
    this._spreadT += dt;
    if (this._spreadT < INFLUENCE_SPREAD_INTERVAL) return;
    this._spreadT = 0;

    if ((this.resources.resources.influence || 0) < this.reclaimCost) return;

    // pick captured cell nearest origin, but only if it borders player land
    let best = null, bestD = Infinity;
    for (const key of this.captured.keys()) {
      const [q, r] = key.split(',').map(Number);
      const cell = this.grid.get(q, r);
      if (!cell) { this.captured.delete(key); continue; }
      const touchesPlayer = neighbors(q, r).some((n) => {
        const nc = this.grid.get(n.q, n.r);
        return nc && (!nc.owner || nc.owner === 'player');
      });
      if (!touchesPlayer) continue;
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
      if (d < bestD) { bestD = d; best = cell; }
    }
    if (best) this.reclaim(best);
  }

  serialize() {
    const out = [];
    for (const [key, rec] of this.captured) out.push({ key, factionId: rec.factionId });
    return { captured: out, suffered: this.capturesSuffered };
  }

  restore(data) {
    if (!data) return;
    this.capturesSuffered = data.suffered || 0;
    for (const rec of data.captured || []) {
      const [q, r] = rec.key.split(',').map(Number);
      const cell = this.grid.get(q, r);
      if (!cell) continue;
      cell.owner = rec.factionId;
      this.captured.set(rec.key, { factionId: rec.factionId, at: 0 });
    }
    if (this.captured.size) events.emit('territory:changed', {});
  }

  reset() {
    this.captured.clear();
    this.capturesSuffered = 0;
    this._spreadT = 0;
  }
}
