// ============================================================
// BuildingSystem — PLAYER-BUILT structures gameplay layer.
// Sits on top of the existing systems and reuses them:
//   ResourceSystem      → canAfford / spend / grant (production)
//   ConstructionSystem  → staged 3D reveal of finished buildings
//   ResearchSystem      → building unlock gates + bonuses
//   CitizenSystem       → village population requirement
//   ProgressionSystem   → kingdom tier requirement
// Handles: build queue with real construction time, per-second
// production granted through the ResourceSystem public API,
// storage cap bonuses, MANUAL village→town upgrades, and full
// serialize/restore for the SaveSystem.
// ============================================================
import * as THREE from 'three';
import { cellKey, neighbors } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { scatterPoint } from './EvolutionSystem.js';
import { BUILDINGS, VILLAGE_UPGRADE, MAX_BUILDINGS_PER_TILE, fmtCost } from '../config/BuildingConfig.js';
import { TRADE_SELL_START, TRADE_SELL_UNITS, TRADE_SELL_PRICES } from '../config/EconomyConfig.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';

const PRODUCTION_TICK = 1.0; // seconds between production grants

export class BuildingSystem {
  /**
   * @param game Game (grid, resourceSystem, citizenSystem,
   *             progressionSystem, construction, research)
   */
  constructor(game) {
    this.game = game;
    this.grid = game.grid;
    this.resources = game.resourceSystem;
    this.construction = game.construction;

    // key -> array of {id, remaining, done, slot}
    this.byCell = new Map();
    // key -> {remaining} for villages upgrading right now
    this.upgrading = new Map();
    // keys of villages already upgraded to towns
    this.upgradedVillages = new Set();

    this._prodT = 0;
  }

  get research() { return this.game.researchSystem; }

  // ---------------- queries ----------------

  buildingsOn(cell) {
    return this.byCell.get(cellKey(cell.q, cell.r)) || [];
  }

  countOf(id) {
    let n = 0;
    for (const list of this.byCell.values()) {
      for (const b of list) if (b.id === id) n++;
    }
    return n;
  }

  /** sum a numeric config field over all completed player buildings */
  _sumDoneField(field) {
    let total = 0;
    for (const [key, list] of this.byCell) {
      const cell = this.grid.cells.get(key);
      if (!cell || (cell.owner && cell.owner !== 'player')) continue;
      for (const b of list) {
        if (b.done && BUILDINGS[b.id]?.[field]) total += BUILDINGS[b.id][field];
      }
    }
    return total;
  }

  /** surplus auto-sell power from markets / trade posts / ports */
  get tradePower() { return this._sumDoneField('trade'); }

  /** passive stability regen from temples, banners, garrisons… */
  stabilityRegen() { return this._sumDoneField('stability'); }

  /** total storage cap bonus from completed Storage buildings */
  get capBonus() {
    let bonus = 0;
    for (const list of this.byCell.values()) {
      for (const b of list) {
        if (b.done && BUILDINGS[b.id]?.capBonus) bonus += BUILDINGS[b.id].capBonus;
      }
    }
    return bonus;
  }

  /** is this cell on the frontier (touches an empty hex)? */
  isFrontier(cell) {
    return neighbors(cell.q, cell.r).some((n) => !this.grid.has(n.q, n.r));
  }

  /** does the building type fit this tile at all (ignoring cost)? */
  fitsTile(def, cell) {
    if (def.upgradeOnly) return false; // only reachable via upgrade chain
    if (def.tiles !== '*' && !def.tiles.includes(cell.tileType)) return false;
    if (def.frontierOnly && !this.isFrontier(cell)) return false;
    if (def.townOnly && !this.isVillageUpgraded(cell)) return false;
    if (def.context && !this._contextOk(def.context, cell)) return false;
    return true;
  }

  /** contextual availability: border walls / enemies nearby */
  _contextOk(ctx, cell) {
    if (ctx === 'wall') return this._hasHostileBorder(cell);
    if (ctx === 'enemyNear') return this._enemyWithin(cell, 2);
    return true;
  }

  /** tile has a walled edge (WallSystem raises walls on hostile borders) */
  _hasHostileBorder(cell) {
    return neighbors(cell.q, cell.r).some((n) => {
      const nc = this.grid.get(n.q, n.r);
      return !!(nc && nc.owner && nc.owner !== 'player');
    });
  }

  /** any enemy-owned tile within the given hex radius */
  _enemyWithin(cell, radius) {
    const seen = new Set([cellKey(cell.q, cell.r)]);
    let ring = [cell];
    for (let d = 0; d < radius; d++) {
      const next = [];
      for (const c of ring) {
        for (const n of neighbors(c.q, c.r)) {
          const k = cellKey(n.q, n.r);
          if (seen.has(k)) continue;
          seen.add(k);
          const nc = this.grid.get(n.q, n.r);
          if (nc && nc.owner && nc.owner !== 'player') return true;
          next.push(n);
        }
      }
      ring = next;
    }
    return false;
  }

  /**
   * Full precondition check. Returns { ok, reason }.
   * Reuses the EXISTING resource / research checks.
   */
  canBuild(cell, id) {
    const def = BUILDINGS[id];
    if (!def) return { ok: false, reason: 'Unknown building' };
    if (cell.owner && cell.owner !== 'player') return { ok: false, reason: 'Tile is occupied by enemies' };
    if (!this.fitsTile(def, cell)) {
      let reason = def.frontierOnly ? 'Only on frontier tiles' : `Needs a ${def.tiles} tile`;
      if (def.upgradeOnly) reason = 'Built by upgrading';
      else if (def.townOnly && !this.isVillageUpgraded(cell)) reason = 'Towns only (upgrade the village)';
      else if (def.context === 'wall') reason = 'Needs a walled border (enemy adjacent)';
      else if (def.context === 'enemyNear') reason = 'No enemies nearby';
      return { ok: false, reason };
    }
    const list = this.buildingsOn(cell);
    if (list.length >= MAX_BUILDINGS_PER_TILE) return { ok: false, reason: 'Tile is full' };
    if (list.some((b) => b.id === id)) return { ok: false, reason: 'Already built here' };
    if (def.isRoad && cell.roadEdges?.length) return { ok: false, reason: 'Road already here' };
    if (def.research && this.research && !this.research.isCompleted(def.research)) {
      return { ok: false, reason: `Requires ${this.research.nameOf(def.research)} research` };
    }
    if (!this.resources.canAfford(def.cost)) {
      return { ok: false, reason: `Not enough resources (${fmtCost(def.cost)})` };
    }
    return { ok: true, reason: '' };
  }

  /** start construction: pay now, wait buildTime seconds */
  build(cell, id) {
    const check = this.canBuild(cell, id);
    if (!check.ok) {
      events.emit('build:denied', { cell, id, reason: check.reason });
      return false;
    }
    const def = BUILDINGS[id];
    if (!this.resources.spend(def.cost, `Build ${def.name}`)) return false;

    const key = cellKey(cell.q, cell.r);
    if (!this.byCell.has(key)) this.byCell.set(key, []);
    const list = this.byCell.get(key);
    const timeMult = this.research ? this.research.buildTimeMult : 1;
    const rec = {
      id,
      remaining: def.buildTime * timeMult,
      total: def.buildTime * timeMult,
      done: false,
      slot: list.length,
    };
    list.push(rec);
    this._spawnSiteMarker(cell, rec);
    events.emit('build:started', { cell, id, time: rec.remaining });
    events.emit('buildings:changed', {});
    return true;
  }

  /** small construction-site post while the timer runs */
  _spawnSiteMarker(cell, rec) {
    if (!cell.group) return;
    const rng = new Rng((cell.seed ^ (rec.slot * 0x5bd1e995)) >>> 0);
    const p = scatterPoint(rng, cell, 0.15, 0.55) || { x: 0, z: 0 };
    rec.pos = p;
    const marker = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), mat);
      const a = (i / 3) * Math.PI * 2 + 0.4;
      post.position.set(Math.cos(a) * 0.16, 0.11, Math.sin(a) * 0.16);
      marker.add(post);
    }
    marker.position.set(p.x, TILE_H, p.z);
    cell.group.add(marker);
    rec.marker = marker;
  }

  _completeBuilding(cell, rec, { instant = false, silent = false } = {}) {
    const def = BUILDINGS[rec.id];
    rec.done = true;
    rec.remaining = 0;
    if (rec.marker) {
      if (rec.marker.parent) rec.marker.parent.remove(rec.marker);
      rec.marker = null;
    }

    if (def.isRoad) {
      const changed = this.game.connectorSystem.buildRoad(cell);
      this.game.autoMesh.batch(() => {
        for (const c of changed) this.game.autoMesh.onTileChanged(c.q, c.r);
      });
      this.game.roadSystem.rebuild();
      if (!silent) {
        events.emit('build:completed', { cell, id: rec.id, name: def.name, icon: def.icon });
        events.emit('buildings:changed', {});
      }
      return;
    }

    // 3D reveal through the EXISTING ConstructionSystem
    if (cell.group) {
      const rng = new Rng((cell.seed ^ (rec.slot * 0x5bd1e995)) >>> 0);
      // always draw the scatter point so rng state stays replay-identical
      const drawn = scatterPoint(rng, cell, 0.15, 0.55) || { x: 0, z: 0 };
      const p = rec.pos || drawn;
      rec.pos = p;
      rec.visual = this.construction.build(def.maker, cell.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
        rotY: rng.range(0, Math.PI * 2),
        scale: 0.85,
        instant,
      });
    }
    // watchtower counts toward kingdom defense (existing counter)
    if (def.onComplete === 'tower' && !silent) {
      this.resources.buildings.tower++;
      this.resources._ratesDirty = true;
    }
    if (!silent) {
      events.emit('build:completed', { cell, id: rec.id, name: def.name, icon: def.icon });
      events.emit('buildings:changed', {});
    }
  }

  // ---------------- building upgrades (tower chain) ----------------

  /** can this completed building be upgraded to its next tier? */
  canUpgradeBuilding(cell, rec) {
    const def = BUILDINGS[rec.id];
    const target = def?.upgradesTo ? BUILDINGS[def.upgradesTo] : null;
    if (!target) return { ok: false, reason: 'No upgrade available' };
    if (!rec.done || rec.upgradeTo) return { ok: false, reason: 'Upgrade in progress' };
    if (cell.owner && cell.owner !== 'player') return { ok: false, reason: 'Tile is occupied by enemies' };
    if (target.research && this.research && !this.research.isCompleted(target.research)) {
      return { ok: false, reason: `Requires ${this.research.nameOf(target.research)} research` };
    }
    if (!this.resources.canAfford(target.cost)) {
      return { ok: false, reason: `Not enough resources (${fmtCost(target.cost)})` };
    }
    return { ok: true, reason: '' };
  }

  /** start an in-place upgrade: pay now, swap the model when done */
  upgradeBuilding(cell, rec) {
    const check = this.canUpgradeBuilding(cell, rec);
    if (!check.ok) {
      events.emit('build:denied', { cell, id: rec.id, reason: check.reason });
      return false;
    }
    const target = BUILDINGS[BUILDINGS[rec.id].upgradesTo];
    if (!this.resources.spend(target.cost, `Upgrade to ${target.name}`)) return false;
    const timeMult = this.research ? this.research.buildTimeMult : 1;
    rec.upgradeTo = target.id;
    rec.upRemaining = target.buildTime * timeMult;
    rec.upTotal = rec.upRemaining;
    events.emit('build:started', { cell, id: target.id, time: rec.upRemaining });
    events.emit('buildings:changed', {});
    return true;
  }

  /** swap the old model for the next tier and reveal it in phases */
  _completeUpgrade(cell, rec, opts = {}) {
    rec.id = rec.upgradeTo;
    rec.upgradeTo = null;
    rec.upRemaining = 0;
    if (rec.visual?.group?.parent) rec.visual.group.parent.remove(rec.visual.group);
    rec.visual = null;
    this._completeBuilding(cell, rec, opts);
  }

  // ---------------- manual village upgrade ----------------

  isVillageUpgraded(cell) {
    return this.upgradedVillages.has(cellKey(cell.q, cell.r));
  }

  isVillageUpgrading(cell) {
    return this.upgrading.has(cellKey(cell.q, cell.r));
  }

  canUpgradeVillage(cell) {
    const U = VILLAGE_UPGRADE;
    if (cell.tileType !== 'village') return { ok: false, reason: 'Not a village' };
    if (cell.owner && cell.owner !== 'player') return { ok: false, reason: 'Tile is occupied by enemies' };
    const key = cellKey(cell.q, cell.r);
    if (this.upgradedVillages.has(key)) return { ok: false, reason: 'Already a town' };
    if (this.upgrading.has(key)) return { ok: false, reason: 'Upgrade in progress' };
    if (this.game.progressionSystem.tier < U.minTier) {
      return { ok: false, reason: `Kingdom must be tier ${U.minTier + 1}+` };
    }
    const pop = this.game.citizenSystem.populationOf(cell);
    if (pop < U.minPopulation) {
      return { ok: false, reason: `Needs ${U.minPopulation} population (have ${pop})` };
    }
    if (this.resources.stability < U.minStability) {
      return { ok: false, reason: `Needs ${U.minStability} stability` };
    }
    if (!this.resources.canAfford(U.cost)) {
      return { ok: false, reason: `Not enough resources (${fmtCost(U.cost)})` };
    }
    return { ok: true, reason: '' };
  }

  upgradeVillage(cell) {
    const check = this.canUpgradeVillage(cell);
    if (!check.ok) {
      events.emit('build:denied', { cell, id: 'village_upgrade', reason: check.reason });
      return false;
    }
    if (!this.resources.spend(VILLAGE_UPGRADE.cost, 'Upgrade village')) return false;
    const timeMult = this.research ? this.research.buildTimeMult : 1;
    const time = VILLAGE_UPGRADE.buildTime * timeMult;
    this.upgrading.set(cellKey(cell.q, cell.r), { remaining: time, total: time });
    events.emit('build:started', { cell, id: 'village_upgrade', time });
    events.emit('buildings:changed', {});
    return true;
  }

  _completeVillageUpgrade(cell, { instant = false, silent = false } = {}) {
    const key = cellKey(cell.q, cell.r);
    this.upgrading.delete(key);
    this.upgradedVillages.add(key);
    if (cell.group) {
      const rng = new Rng(cell.seed ^ 0x715fb2c3);
      const p = scatterPoint(rng, cell, 0.15, 0.5) || { x: 0, z: 0 };
      this.construction.build('tower', cell.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
        rotY: rng.range(0, Math.PI * 2),
        instant,
      });
    }
    // existing listeners handle score bonus, toast and tower upkeep count
    if (!silent) {
      events.emit('evolution:town', { cell });
      events.emit('buildings:changed', {});
    }
  }

  // ---------------- production / tick ----------------

  /** per-second output of all completed buildings (with research bonuses) */
  productionRates() {
    const out = {};
    const res = this.research;
    for (const [key, list] of this.byCell) {
      const cell = this.grid.cells.get(key);
      if (!cell || (cell.owner && cell.owner !== 'player')) continue;
      for (const b of list) {
        if (!b.done) continue;
        const def = BUILDINGS[b.id];
        for (const [k, v] of Object.entries(def.production)) {
          const mult = res ? res.resourceMult(k) : 1;
          out[k] = (out[k] || 0) + v * mult;
        }
      }
    }
    return out;
  }

  update(dt) {
    // -------- construction timers --------
    let changed = false;
    for (const [key, list] of this.byCell) {
      const cell = this.grid.cells.get(key);
      for (const b of list) {
        if (b.upgradeTo) {
          b.upRemaining -= dt;
          if (b.upRemaining <= 0 && cell) {
            this._completeUpgrade(cell, b);
            changed = true;
          }
          continue;
        }
        if (b.done) continue;
        b.remaining -= dt;
        if (b.remaining <= 0 && cell) {
          this._completeBuilding(cell, b);
          changed = true;
        }
      }
    }
    for (const [key, up] of this.upgrading) {
      up.remaining -= dt;
      if (up.remaining <= 0) {
        const [q, r] = key.split(',').map(Number);
        const cell = this.grid.get(q, r);
        if (cell) this._completeVillageUpgrade(cell);
        else this.upgrading.delete(key);
        changed = true;
      }
    }
    if (changed) events.emit('buildings:changed', {});

    // -------- production grants (through public ResourceSystem API) --------
    this._prodT += dt;
    if (this._prodT >= PRODUCTION_TICK) {
      const step = this._prodT;
      this._prodT = 0;
      const rates = this.productionRates();
      let any = false;
      const gains = {};
      for (const [k, v] of Object.entries(rates)) {
        if (v > 0) { gains[k] = v * step; any = true; }
      }
      if (any) this.resources.grant(gains);

      // -------- trade: auto-sell surplus piling up near the cap --------
      const power = this.tradePower;
      if (power > 0) {
        const cap = this.resources.storageCap;
        const startAt = cap * TRADE_SELL_START;
        const sellBudget = power * TRADE_SELL_UNITS * step;
        const losses = {};
        let gold = 0;
        for (const [res, price] of Object.entries(TRADE_SELL_PRICES)) {
          const have = this.resources.resources[res] || 0;
          if (have <= startAt) continue;
          const amount = Math.min(have - startAt, sellBudget);
          if (amount <= 0.001) continue;
          losses[res] = amount;
          gold += amount * price;
        }
        if (gold > 0) this.resources.convert(losses, { gold }, 'Trade: surplus sold');
      }
    }
  }

  // ---------------- save / restore ----------------

  /** in-progress player builds for UI (ConstructionPanel) */
  activeJobs() {
    const out = [];
    for (const [key, list] of this.byCell) {
      const [q, r] = key.split(',').map(Number);
      for (const b of list) {
        if (b.upgradeTo) {
          const t = BUILDINGS[b.upgradeTo];
          out.push({
            key, q, r, id: b.upgradeTo,
            icon: t?.icon || 'upgrade',
            name: `${t?.name || b.upgradeTo} (upgrade)`,
            remaining: b.upRemaining,
            total: b.upTotal || 1,
          });
          continue;
        }
        if (b.done) continue;
        const def = BUILDINGS[b.id];
        out.push({
          key, q, r, id: b.id,
          icon: def?.icon || 'build',
          name: def?.name || b.id,
          remaining: b.remaining,
          total: b.total || 1,
        });
      }
    }
    for (const [key, up] of this.upgrading) {
      const [q, r] = key.split(',').map(Number);
      out.push({
        key, q, r, id: 'village_upgrade',
        icon: VILLAGE_UPGRADE.icon,
        name: VILLAGE_UPGRADE.name,
        remaining: up.remaining,
        total: up.total || 1,
      });
    }
    return out;
  }

  serialize() {
    const cells = [];
    for (const [key, list] of this.byCell) {
      cells.push({
        key,
        b: list.map((b) => ({
          id: b.id,
          done: b.done,
          rem: Math.round(b.remaining * 10) / 10,
          total: Math.round((b.total || 0) * 10) / 10,
          ...(b.upgradeTo ? {
            up: b.upgradeTo,
            upRem: Math.round(b.upRemaining * 10) / 10,
            upTotal: Math.round((b.upTotal || 0) * 10) / 10,
          } : {}),
        })),
      });
    }
    const upgrading = [];
    for (const [key, up] of this.upgrading) {
      upgrading.push({ key, rem: Math.round(up.remaining * 10) / 10, total: Math.round(up.total * 10) / 10 });
    }
    return { cells, upgrading, towns: [...this.upgradedVillages] };
  }

  /** rebuild state + visuals from save data (silent, no events/toasts) */
  restore(data) {
    if (!data) return;
    for (const rec of data.cells || []) {
      const [q, r] = rec.key.split(',').map(Number);
      const cell = this.grid.get(q, r);
      if (!cell) continue;
      const list = [];
      this.byCell.set(rec.key, list);
      for (let i = 0; i < rec.b.length; i++) {
        const b = rec.b[i];
        const brec = { id: b.id, remaining: b.rem || 0, total: b.total || 1, done: !!b.done, slot: i };
        if (b.up) {
          brec.upgradeTo = b.up;
          brec.upRemaining = b.upRem || 1;
          brec.upTotal = b.upTotal || 1;
        }
        list.push(brec);
        if (brec.done) {
          this._completeBuilding(cell, brec, { instant: true, silent: true });
          // watchtower defense counter is persisted inside ResourceSystem
        } else {
          this._spawnSiteMarker(cell, brec);
        }
      }
    }
    for (const rec of data.upgrading || []) {
      this.upgrading.set(rec.key, { remaining: rec.rem || 1, total: rec.total || 1 });
    }
    for (const key of data.towns || []) {
      const [q, r] = key.split(',').map(Number);
      const cell = this.grid.get(q, r);
      if (!cell) continue;
      this.upgradedVillages.add(key);
      // rebuild the town tower instantly, without re-firing events
      if (cell.group) {
        const rng = new Rng(cell.seed ^ 0x715fb2c3);
        const p = scatterPoint(rng, cell, 0.15, 0.5) || { x: 0, z: 0 };
        this.construction.build('tower', cell.group, new THREE.Vector3(p.x, TILE_H, p.z), rng, {
          rotY: rng.range(0, Math.PI * 2),
          instant: true,
        });
      }
    }
    events.emit('buildings:changed', {});
  }

  reset() {
    this.byCell.clear();
    this.upgrading.clear();
    this.upgradedVillages.clear();
    this._prodT = 0;
    events.emit('buildings:changed', {});
  }
}
