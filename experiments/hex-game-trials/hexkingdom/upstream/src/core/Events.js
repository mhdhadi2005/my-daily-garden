// ============================================================
// Events — minimal pub/sub event bus decoupling game systems.
// ============================================================
export class EventBus {
    constructor() {
      this.listeners = new Map();
    }
  
    on(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
      return () => this.off(type, fn);
    }
  
    off(type, fn) {
      const set = this.listeners.get(type);
      if (set) set.delete(fn);
    }
  
    emit(type, payload) {
      const set = this.listeners.get(type);
      if (!set) return;
      for (const fn of set) fn(payload);
    }
  
    clear() {
      this.listeners.clear();
    }
  }
  
  export const events = new EventBus();
  
  // Event names (documentation — see grep for full catalog)
  // 'tile:placed'      {cell, score}
  // 'score:changed'    {total, delta, multiplier}
  // 'building:phase'   {building, phase}
  // 'build:started'    {cell, id, time}
  // 'world:event'      {id, label, icon}
  // 'game:restart'     {} — emitted before kingdom reset; do NOT events.clear()
  //   during restart (UI/system listeners are registered once at boot).
  