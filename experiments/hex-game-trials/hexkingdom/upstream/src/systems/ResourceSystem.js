// ============================================================
// ResourceSystem — HARD economy layer.
// Six-value model: wood, stone, food, gold, influence (stocks)
// + stability (0..100 gauge). Production per tile with adjacency
// and road bonuses, building upkeep drain, population food
// upkeep, storage caps with overflow decay, and stability
// feedback into production. Pure game logic — no rendering.
// ============================================================
import { neighbors } from '../grid/Hex.js';
import { events } from '../core/Events.js';
import {
  RESOURCE_KEYS, STARTING_RESOURCES, STARTING_STABILITY,
  STABILITY_BASELINE, STABILITY_DRIFT, STABILITY_FOOD_SHORTAGE,
  STABILITY_OVERFLOW, STABILITY_POP_REGEN, STABILITY_POP_REGEN_MAX,
  stabilityProductionMult,
  BASE_PRODUCTION, BUILDING_UPKEEP, FOOD_PER_POP, OVERFLOW_DECAY,
} from '../config/EconomyConfig.js';

const TICK_INTERVAL = 1.0; // economy tick, seconds

export class ResourceSystem {
  /**
   * @param grid GridManager
   * @param roads RoadSystem (optional connectivity bonuses)
   */
  constructor(grid, roads = null) {
    this.grid = grid;
    this.roads = roads;
    this.resources = { ...STARTING_RESOURCES };
    this.stability = STARTING_STABILITY;
    this.rates = this._zeroRates();
    this._tickT = 0;
    this._ratesDirty = true;
    this.populationProvider = null;  // set by CitizenSystem (optional)
    this.storageCapProvider = null;  // set by ProgressionSystem
    this.productionMult = 1.0;       // world events (prosperity) hook
    this.researchMultProvider = null;   // (resKey) => mult, set by Game
    this.tierProdMultProvider = null;   // () => kingdom tier production mult
    this.stabilityRegenProvider = null; // () => +stability/s from buildings
    this.totalPopulationProvider = null;// () => total population (stability regen)
    this.buildings = { house: 0, tower: 0, castle: 0, bridge: 0 };
    this.spendLog = [];

    events.on('tile:placed', () => { this._ratesDirty = true; });
    events.on('roads:changed', () => { this._ratesDirty = true; });
    events.on('population:changed', () => { this._ratesDirty = true; });
    events.on('territory:changed', () => { this._ratesDirty = true; });

    // building upkeep tracking via evolution events (logic-only hooks)
    events.on('evolution:house', () => { this.buildings.house++; this._ratesDirty = true; });
    events.on('evolution:town', () => { this.buildings.tower++; this._ratesDirty = true; });
    events.on('evolution:castle', () => { this.buildings.castle++; this._ratesDirty = true; });
    events.on('evolution:bridge', () => { this.buildings.bridge++; this._ratesDirty = true; });
  }

  _zeroRates() {
    const out = {};
    for (const k of RESOURCE_KEYS) out[k] = 0;
    return out;
  }

  get storageCap() {
    return this.storageCapProvider ? this.storageCapProvider() : 999999;
  }

  // ---------------- production ----------------

  /** per-second production of a single cell, including adjacency modifiers */
  productionFor(cell) {
    if (cell.owner && cell.owner !== 'player') return null; // captured tiles produce nothing
    const base = BASE_PRODUCTION[cell.tileType];
    if (!base) return null;
    const out = {};
    let adjacency = 1.0;

    let forestAdj = 0, villageAdj = 0, roadAdj = 0;
    for (const n of neighbors(cell.q, cell.r)) {
      const nc = this.grid.get(n.q, n.r);
      if (!nc) continue;
      if (nc.tileType === 'forest') forestAdj++;
      if (nc.tileType === 'village') villageAdj++;
      if (nc.roadEdges && nc.roadEdges.length) roadAdj++;
    }
    if (cell.tileType === 'field' && villageAdj > 0) adjacency += 0.15 * Math.min(villageAdj, 2);
    if (cell.tileType === 'forest' && villageAdj > 0) adjacency += 0.1 * Math.min(villageAdj, 2);
    if (cell.tileType === 'village' && forestAdj > 0) adjacency += 0.1 * Math.min(forestAdj, 2);
    if (roadAdj > 0) adjacency += 0.05 * Math.min(roadAdj, 3);

    const roadBonus = this.roads ? this.roads.productionBonusFor(cell) : 1.0;

    let popScale = 1.0;
    if (cell.tileType === 'village' && this.populationProvider) {
      const pop = this.populationProvider(cell);
      popScale = 1 + pop * 0.12;
    }

    for (const [res, rate] of Object.entries(base)) {
      out[res] = rate * adjacency * roadBonus * (res === 'gold' ? popScale : 1);
    }
    return out;
  }

  _recomputeRates() {
    const totals = this._zeroRates();
    for (const cell of this.grid.cells.values()) {
      const p = this.productionFor(cell);
      if (!p) continue;
      for (const [res, v] of Object.entries(p)) totals[res] += v;
    }

    // stability + event + kingdom tier + research multipliers scale gross production
    const tierMult = this.tierProdMultProvider ? this.tierProdMultProvider() : 1;
    const mult = stabilityProductionMult(this.stability) * this.productionMult * tierMult;
    for (const k of RESOURCE_KEYS) {
      const rMult = this.researchMultProvider ? this.researchMultProvider(k) : 1;
      totals[k] *= mult * rMult;
    }

    // population food upkeep
    if (this.populationProvider) {
      let pop = 0;
      for (const cell of this.grid.cells.values()) {
        if (cell.tileType === 'village') pop += this.populationProvider(cell);
      }
      totals.food -= pop * FOOD_PER_POP;
    }

    // building upkeep (never scaled by stability — obligations are fixed)
    for (const [kind, count] of Object.entries(this.buildings)) {
      const upkeep = BUILDING_UPKEEP[kind];
      if (!upkeep || !count) continue;
      for (const [res, v] of Object.entries(upkeep)) totals[res] -= v * count;
    }

    this.rates = totals;
    this._ratesDirty = false;
  }

  // ---------------- spending ----------------

  canAfford(cost) {
    for (const [res, v] of Object.entries(cost)) {
      if ((this.resources[res] || 0) < v) return false;
    }
    return true;
  }

  /** deduct cost if affordable, returns true on success */
  spend(cost, label = '') {
    if (!this.canAfford(cost)) return false;
    for (const [res, v] of Object.entries(cost)) {
      this.resources[res] -= v;
    }
    this.spendLog.push({ cost, label, at: performance.now() });
    if (this.spendLog.length > 20) this.spendLog.shift();
    events.emit('resources:spent', { cost, label });
    this._emitChanged();
    return true;
  }

  /** direct grant (event rewards, caravan income) — capped by storage */
  grant(gains, label = '') {
    const cap = this.storageCap;
    for (const [res, v] of Object.entries(gains)) {
      this.resources[res] = Math.min(cap, (this.resources[res] || 0) + v);
    }
    this._emitChanged(label);
  }

  /** exchange: subtract losses and add gains in one change event (trade) */
  convert(losses, gains, label = '') {
    const cap = this.storageCap;
    for (const [res, v] of Object.entries(losses)) {
      this.resources[res] = Math.max(0, (this.resources[res] || 0) - v);
    }
    for (const [res, v] of Object.entries(gains)) {
      this.resources[res] = Math.min(cap, (this.resources[res] || 0) + v);
    }
    this._emitChanged(label);
  }

  /** forced loss (raids, famine) — never below zero */
  plunder(losses, label = '') {
    for (const [res, v] of Object.entries(losses)) {
      this.resources[res] = Math.max(0, (this.resources[res] || 0) - v);
    }
    this._emitChanged(label);
  }

  adjustStability(delta) {
    this.stability = Math.max(0, Math.min(100, this.stability + delta));
    this._ratesDirty = true;
    events.emit('stability:changed', { stability: this.stability });
  }

  // ---------------- tick ----------------

  update(dt) {
    this._tickT += dt;
    if (this._tickT < TICK_INTERVAL) return;
    const step = this._tickT;
    this._tickT = 0;

    if (this._ratesDirty) this._recomputeRates();

    for (const [res, rate] of Object.entries(this.rates)) {
      this.resources[res] = Math.max(0, this.resources[res] + rate * step);
    }

    // trade route income
    if (this.roads && this.roads.tradeRoutes.length) {
      this.resources.gold += this.roads.tradeRoutes.length * 0.15 * step;
    }

    // ---- overflow decay: resources above cap rot away ----
    const cap = this.storageCap;
    let overflowing = 0;
    for (const k of RESOURCE_KEYS) {
      if (this.resources[k] > cap) {
        overflowing++;
        const excess = this.resources[k] - cap;
        this.resources[k] -= excess * OVERFLOW_DECAY;
        if (this.resources[k] < cap) this.resources[k] = cap;
      }
    }

    // ---- stability dynamics ----
    // drift toward baseline + building regen (temples…) + fed citizens
    let sDelta = (STABILITY_BASELINE - this.stability) * STABILITY_DRIFT * step;
    if (this.stabilityRegenProvider) sDelta += this.stabilityRegenProvider() * step;
    if (!this.foodShortage && this.totalPopulationProvider) {
      const pop = this.totalPopulationProvider();
      sDelta += Math.min(pop * STABILITY_POP_REGEN, STABILITY_POP_REGEN_MAX) * step;
    }
    if (this.foodShortage) sDelta += STABILITY_FOOD_SHORTAGE * step;
    if (overflowing) sDelta += STABILITY_OVERFLOW * overflowing * step;
    if (sDelta !== 0) {
      const prev = this.stability;
      this.stability = Math.max(0, Math.min(100, this.stability + sDelta));
      if (Math.abs(this.stability - prev) > 0.001) {
        this._ratesDirty = true;
        events.emit('stability:changed', { stability: this.stability });
      }
    }

    this._emitChanged();
  }

  _emitChanged(label = '') {
    events.emit('resources:changed', {
      resources: this.resources,
      rates: this.rates,
      stability: this.stability,
      cap: this.storageCap,
      label,
    });
  }

  /** true when food production is negative and stores are low */
  get foodShortage() {
    return this.resources.food < 5 && this.rates.food < 0;
  }

  serialize() {
    const out = { stability: Math.round(this.stability * 10) / 10, buildings: { ...this.buildings } };
    for (const k of RESOURCE_KEYS) out[k] = Math.round(this.resources[k] * 100) / 100;
    return out;
  }

  restore(data) {
    if (!data) return;
    for (const k of RESOURCE_KEYS) {
      this.resources[k] = data[k] ?? STARTING_RESOURCES[k];
    }
    this.stability = data.stability ?? STARTING_STABILITY;
    if (data.buildings) this.buildings = { ...this.buildings, ...data.buildings };
    this._ratesDirty = true;
    this._emitChanged();
  }

  reset() {
    this.resources = { ...STARTING_RESOURCES };
    this.stability = STARTING_STABILITY;
    this.rates = this._zeroRates();
    this._tickT = 0;
    this._ratesDirty = true;
    this.productionMult = 1.0;
    this.buildings = { house: 0, tower: 0, castle: 0, bridge: 0 };
    this.spendLog.length = 0;
    this._emitChanged();
  }
}
