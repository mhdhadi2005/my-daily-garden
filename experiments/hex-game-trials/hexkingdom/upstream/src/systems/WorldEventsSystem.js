// ============================================================
// WorldEventsSystem — random kingdom events from EconomyConfig.
// Fires trade caravans, raids, famine, prosperity bursts and
// migration waves. Pure logic — toasts via Game UI.
// ============================================================
import { WORLD_EVENTS, WORLD_EVENT_INTERVAL } from '../config/EconomyConfig.js';
import { Rng } from '../core/Rng.js';
import { events } from '../core/Events.js';
import { iconLabel } from '../ui/GameIcons.js';

export class WorldEventsSystem {
  constructor(game) {
    this.game = game;
    this._rng = new Rng((game.worldSeed ^ 0x6c8e9cf5) >>> 0);
    this._timer = 0;
    this._nextIn = this._rollInterval();
    this._prosperityT = 0;
  }

  _rollInterval() {
    const [min, max] = WORLD_EVENT_INTERVAL;
    return min + this._rng.next() * (max - min);
  }

  _pickEvent() {
    const entries = Object.entries(WORLD_EVENTS);
    let total = 0;
    for (const [, def] of entries) total += def.baseWeight;
    let roll = this._rng.next() * total;
    for (const entry of entries) {
      roll -= entry[1].baseWeight;
      if (roll <= 0) return entry;
    }
    return entries[0];
  }

  update(dt) {
    if (this._prosperityT > 0) {
      this._prosperityT -= dt;
      if (this._prosperityT <= 0) {
        this.game.resourceSystem.productionMult = 1.0;
        this.game.resourceSystem._ratesDirty = true;
      }
    }

    this._timer += dt;
    if (this._timer < this._nextIn) return;
    this._timer = 0;
    this._nextIn = this._rollInterval();
    this._fire();
  }

  _fire() {
    const [id, def] = this._pickEvent();
    const rs = this.game.resourceSystem;
    const ui = this.game.ui;

    switch (id) {
      case 'trade_caravan':
        rs.grant(def.gain, def.label);
        if (def.stability) rs.adjustStability(def.stability);
        ui.toast(`${iconLabel(def.icon)} ${def.label}! Bonus resources arrive`);
        break;
      case 'raid': {
        const stolen = {
          gold: rs.resources.gold * def.stealFraction,
          food: rs.resources.food * def.stealFraction,
        };
        rs.plunder(stolen, def.label);
        if (def.stability) rs.adjustStability(def.stability);
        ui.toast(`${iconLabel(def.icon)} ${def.label}! Raiders stole supplies`);
        break;
      }
      case 'famine': {
        rs.plunder({ food: rs.resources.food * def.foodLossFraction }, def.label);
        if (def.stability) rs.adjustStability(def.stability);
        const lost = this.game.citizenSystem.reducePopulation(2);
        ui.toast(lost
          ? `${iconLabel(def.icon)} ${def.label}! Food depleted · ${lost} citizens lost`
          : `${iconLabel(def.icon)} ${def.label}! Food stores depleted`);
        break;
      }
      case 'prosperity':
        rs.productionMult = def.productionMult;
        rs._ratesDirty = true;
        this._prosperityT = def.duration;
        if (def.stability) rs.adjustStability(def.stability);
        ui.toast(`${iconLabel(def.icon)} ${def.label}! ×${def.productionMult} production for ${def.duration}s`);
        break;
      case 'migration': {
        const added = this.game.citizenSystem.grantPopulation(def.populationGain);
        if (def.stability) rs.adjustStability(def.stability);
        ui.toast(added > 0
          ? `${iconLabel(def.icon)} ${def.label}! +${added} citizens arrive`
          : `${iconLabel(def.icon)} ${def.label}! No villages to settle in`);
        break;
      }
      default:
        break;
    }
    events.emit('world:event', { id, label: def.label, icon: def.icon });
  }

  reset() {
    this._rng = new Rng((this.game.worldSeed ^ 0x6c8e9cf5) >>> 0);
    this._timer = 0;
    this._nextIn = this._rollInterval();
    this._prosperityT = 0;
    this.game.resourceSystem.productionMult = 1.0;
  }
}
