// ============================================================
// ResearchSystem — lightweight research tree logic.
// One research at a time: pay cost up front, wait duration.
// Completed research unlocks buildings (checked by
// BuildingSystem through BuildingConfig.research) and applies
// passive bonuses (production multipliers, faster construction,
// kingdom defense). Pure game logic — no rendering.
// ============================================================
import { RESEARCH } from '../config/ResearchConfig.js';
import { events } from '../core/Events.js';

export class ResearchSystem {
  /**
   * @param resources ResourceSystem (canAfford / spend reuse)
   */
  constructor(resources) {
    this.resources = resources;
    this.completed = new Set();
    this.active = null;   // {id, remaining, total}
  }

  nameOf(id) {
    return RESEARCH[id] ? RESEARCH[id].name : id;
  }

  isCompleted(id) {
    return this.completed.has(id);
  }

  /** aggregate resource production multiplier from finished research */
  resourceMult(resKey) {
    let m = 1;
    const key = resKey + 'Mult'; // foodMult, woodMult, stoneMult, goldMult, influenceMult
    for (const id of this.completed) {
      const bonus = RESEARCH[id].bonus || {};
      if (bonus[key]) m *= bonus[key];
    }
    return m;
  }

  /** army strength multiplier (crossbows etc.) */
  get armyMult() {
    let m = 1;
    for (const id of this.completed) {
      const bonus = RESEARCH[id].bonus || {};
      if (bonus.armyMult) m *= bonus.armyMult;
    }
    return m;
  }

  /** construction time multiplier (engineering) */
  get buildTimeMult() {
    let m = 1;
    for (const id of this.completed) {
      const bonus = RESEARCH[id].bonus || {};
      if (bonus.buildTimeMult) m *= bonus.buildTimeMult;
    }
    return m;
  }

  /** flat kingdom defense bonus (military) */
  get defenseBonus() {
    let d = 0;
    for (const id of this.completed) {
      const bonus = RESEARCH[id].bonus || {};
      if (bonus.defenseBonus) d += bonus.defenseBonus;
    }
    return d;
  }

  /** { ok, reason } — mirrors ProgressionSystem.canStartUpgrade style */
  canStart(id) {
    const def = RESEARCH[id];
    if (!def) return { ok: false, reason: 'Unknown research' };
    if (this.completed.has(id)) return { ok: false, reason: 'Already researched' };
    if (this.active) {
      return { ok: false, reason: this.active.id === id ? 'In progress' : 'Another research is in progress' };
    }
    for (const req of def.requires) {
      if (!this.completed.has(req)) {
        return { ok: false, reason: `Requires ${this.nameOf(req)}` };
      }
    }
    if (!this.resources.canAfford(def.cost)) {
      return { ok: false, reason: 'Not enough resources' };
    }
    return { ok: true, reason: '' };
  }

  start(id) {
    const check = this.canStart(id);
    if (!check.ok) {
      events.emit('research:denied', { id, reason: check.reason });
      return false;
    }
    const def = RESEARCH[id];
    if (!this.resources.spend(def.cost, `Research ${def.name}`)) return false;
    this.active = { id, remaining: def.duration, total: def.duration };
    events.emit('research:started', { id, name: def.name, icon: def.icon, time: def.duration });
    return true;
  }

  update(dt) {
    if (!this.active) return;
    this.active.remaining -= dt;
    if (this.active.remaining <= 0) {
      const def = RESEARCH[this.active.id];
      this.completed.add(this.active.id);
      this.active = null;
      events.emit('research:completed', {
        id: def.id, name: def.name, icon: def.icon, unlocks: def.unlocks,
      });
    }
  }

  serialize() {
    return {
      completed: [...this.completed],
      active: this.active
        ? { id: this.active.id, rem: Math.round(this.active.remaining * 10) / 10 }
        : null,
    };
  }

  restore(data) {
    if (!data) return;
    for (const id of data.completed || []) {
      if (RESEARCH[id]) this.completed.add(id);
    }
    if (data.active && RESEARCH[data.active.id]) {
      const def = RESEARCH[data.active.id];
      this.active = { id: data.active.id, remaining: data.active.rem || 1, total: def.duration };
    }
  }

  reset() {
    this.completed.clear();
    this.active = null;
  }
}
