// ============================================================
// ArmySystem — recruited units and military conquest.
// Units are recruited at barracks/garrisons into a kingdom army
// pool. The army adds to kingdom defense and lets the player
// ATTACK adjacent enemy tiles: win → the tile joins the realm,
// lose → casualties and unrest. Battles show brief unit visuals
// on the target tile. Pure logic + light presentation hooks.
// ============================================================
import * as THREE from 'three';
import { cellKey, neighbors } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';
import { BUILDING_MAKERS } from '../buildings/BuildingFactory.js';
import { tweens, Easing } from '../core/Tween.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';
import {
  UNIT_TYPES, ARMY_BASE_CAP, ARMY_CAP_PER_BARRACKS, ARMY_CAP_PER_GARRISON,
  ATTACK_SUPPLY_COST, ATTACK_TILE_DEFENSE_BASE, ATTACK_FACTION_DEFENSE_SCALE,
  ATTACK_WIN_STABILITY, ATTACK_LOSS_STABILITY,
} from '../config/EconomyConfig.js';
import { fmtCost } from '../config/BuildingConfig.js';

export class ArmySystem {
  constructor(game) {
    this.game = game;
    this.units = { swordsman: 0, archer: 0, knight: 0 };
    this._fxRng = new Rng(0xa11ce ^ (game.worldSeed || 1));
  }

  get resources() { return this.game.resourceSystem; }

  // ---------------- queries ----------------

  /** raw strength of all units (before research bonuses) */
  get baseStrength() {
    let s = 0;
    for (const [id, n] of Object.entries(this.units)) {
      s += (UNIT_TYPES[id]?.strength || 0) * n;
    }
    return s;
  }

  /** effective strength including research (crossbows…) */
  get strength() {
    const mult = this.game.researchSystem?.armyMult || 1;
    return this.baseStrength * mult;
  }

  get unitCount() {
    return Object.values(this.units).reduce((a, b) => a + b, 0);
  }

  /** army cap from kingdom tier + barracks/garrisons */
  get cap() {
    const tierCap = this.game.progressionSystem?.current.armyCap || 0;
    const bs = this.game.buildingSystem;
    let barracks = 0, garrisons = 0;
    if (bs) {
      barracks = bs.countOf('barracks');
      garrisons = bs.countOf('garrison');
    }
    return ARMY_BASE_CAP + tierCap +
      barracks * ARMY_CAP_PER_BARRACKS + garrisons * ARMY_CAP_PER_GARRISON;
  }

  /** does this cell host a completed barracks or garrison? */
  isMusterSite(cell) {
    const bs = this.game.buildingSystem;
    if (!bs) return false;
    return bs.buildingsOn(cell).some(
      (b) => b.done && (b.id === 'barracks' || b.id === 'garrison'),
    );
  }

  // ---------------- recruiting ----------------

  canRecruit(type) {
    const def = UNIT_TYPES[type];
    if (!def) return { ok: false, reason: 'Unknown unit' };
    if (this.baseStrength + def.strength > this.cap) {
      return { ok: false, reason: `Army cap reached (${Math.round(this.cap)}) — build barracks` };
    }
    if (!this.resources.canAfford(def.cost)) {
      return { ok: false, reason: `Not enough resources (${fmtCost(def.cost)})` };
    }
    return { ok: true, reason: '' };
  }

  recruit(type, cell = null) {
    const check = this.canRecruit(type);
    if (!check.ok) {
      events.emit('build:denied', { cell, id: type, reason: check.reason });
      return false;
    }
    const def = UNIT_TYPES[type];
    if (!this.resources.spend(def.cost, `Recruit ${def.name}`)) return false;
    this.units[type] = (this.units[type] || 0) + 1;
    if (cell) this._spawnUnitFx(cell, [def.maker], 2.2);
    events.emit('army:changed', { units: { ...this.units }, strength: this.strength });
    return true;
  }

  // ---------------- attacking ----------------

  /** enemy tile defense the army must beat */
  defenseOf(cell) {
    const f = this._factionOf(cell);
    const fStr = f ? f.strength : 10;
    return ATTACK_TILE_DEFENSE_BASE + fStr * ATTACK_FACTION_DEFENSE_SCALE;
  }

  _factionOf(cell) {
    return this.game.factionSystem.factions.find((f) => f.id === cell.owner) || null;
  }

  /** target must be enemy-owned and touch player land */
  canAttack(cell) {
    if (!cell.owner || cell.owner === 'player') return { ok: false, reason: 'Not an enemy tile' };
    const touches = neighbors(cell.q, cell.r).some((n) => {
      const nc = this.game.grid.get(n.q, n.r);
      return nc && (!nc.owner || nc.owner === 'player');
    });
    if (!touches) return { ok: false, reason: 'Must border your territory' };
    if (this.unitCount === 0) return { ok: false, reason: 'No army — recruit units at a barracks or garrison' };
    if (!this.resources.canAfford(ATTACK_SUPPLY_COST)) {
      return { ok: false, reason: `Needs supplies (${fmtCost(ATTACK_SUPPLY_COST)})` };
    }
    return { ok: true, reason: '' };
  }

  /** resolve a battle for the tile; returns true when it was fought */
  attack(cell) {
    const check = this.canAttack(cell);
    if (!check.ok) {
      events.emit('build:denied', { cell, id: 'attack', reason: check.reason });
      return false;
    }
    if (!this.resources.spend(ATTACK_SUPPLY_COST, 'March to battle')) return false;

    const defense = this.defenseOf(cell);
    const roll = this._fxRng.range(0.85, 1.2);
    const power = this.strength * roll;
    const won = power > defense;
    const f = this._factionOf(cell);

    // casualties: heavier when losing
    const lostStrength = won ? defense * 0.35 : Math.min(this.baseStrength, defense * 0.7);
    this._applyCasualties(lostStrength);

    this._spawnUnitFx(cell, this._marchMakers(), 2.8);

    if (won) {
      cell.owner = 'player';
      const key = cellKey(cell.q, cell.r);
      if (f) f.territory.delete(key);
      this.game.territorySystem.captured.delete(key);
      if (f) f.strength = Math.max(3, f.strength * 0.9 - 2);
      this.resources.adjustStability(ATTACK_WIN_STABILITY);
      events.emit('territory:reclaimed', { cell });         // walls/HUD refresh
      events.emit('territory:changed', {});
      events.emit('army:battle', { cell, won: true, faction: f?.label });
    } else {
      if (f) f.strength += 1;
      this.resources.adjustStability(ATTACK_LOSS_STABILITY);
      events.emit('army:battle', { cell, won: false, faction: f?.label });
    }
    events.emit('army:changed', { units: { ...this.units }, strength: this.strength });
    return true;
  }

  /** remove units worth ~lost strength, weakest first */
  _applyCasualties(lost) {
    const order = Object.entries(UNIT_TYPES)
      .sort((a, b) => a[1].strength - b[1].strength)
      .map(([id]) => id);
    let remaining = lost;
    for (const id of order) {
      const per = UNIT_TYPES[id].strength;
      while (remaining >= per * 0.5 && this.units[id] > 0) {
        this.units[id]--;
        remaining -= per;
      }
    }
  }

  /** unit makers representing the current army composition (up to 3) */
  _marchMakers() {
    const makers = [];
    for (const [id, n] of Object.entries(this.units)) {
      if (n > 0) makers.push(UNIT_TYPES[id].maker);
    }
    if (!makers.length) makers.push(UNIT_TYPES.swordsman.maker);
    const base = [...makers];
    while (makers.length < 3) makers.push(base[makers.length % base.length]);
    return makers.slice(0, 3);
  }

  // ---------------- battle / recruit visuals ----------------

  /** brief unit figures popping up on a tile, then fading out */
  _spawnUnitFx(cell, makerKeys, lifetime = 2.5) {
    if (!cell.group) return;
    const fx = new THREE.Group();
    const rng = new Rng((cell.seed ^ 0xba771e) >>> 0);
    makerKeys.forEach((key, i) => {
      const maker = BUILDING_MAKERS[key];
      if (!maker) return;
      const { group, phases } = maker(rng);
      for (const p of phases) p.visible = true;
      const a = (i / makerKeys.length) * Math.PI * 2 + 0.7;
      group.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
      group.rotation.y = rng.range(0, Math.PI * 2);
      fx.add(group);
    });
    fx.position.y = TILE_H;
    fx.scale.setScalar(0.001);
    cell.group.add(fx);
    tweens.add(0.35, (e) => fx.scale.setScalar(Math.max(e, 0.001)), { easing: Easing.backOut });
    tweens.add(0.4, (e) => fx.scale.setScalar(Math.max(1 - e, 0.001)), {
      delay: lifetime,
      onComplete: () => { if (fx.parent) fx.parent.remove(fx); },
    });
  }

  // ---------------- save / restore ----------------

  serialize() {
    return { units: { ...this.units } };
  }

  restore(data) {
    if (!data) return;
    for (const id of Object.keys(this.units)) {
      this.units[id] = Math.max(0, Math.round(data.units?.[id] || 0));
    }
    events.emit('army:changed', { units: { ...this.units }, strength: this.strength });
  }

  reset() {
    for (const id of Object.keys(this.units)) this.units[id] = 0;
    events.emit('army:changed', { units: { ...this.units }, strength: 0 });
  }
}
