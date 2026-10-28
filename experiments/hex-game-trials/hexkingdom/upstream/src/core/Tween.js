// ============================================================
// Tween — lightweight animation/interpolation manager.
// Drives tile placement pops, construction phases, camera moves.
// ============================================================

export const Easing = {
    linear: (t) => t,
    quadOut: (t) => 1 - (1 - t) * (1 - t),
    cubicOut: (t) => 1 - Math.pow(1 - t, 3),
    cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    backOut: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    bounceOut: (t) => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    elasticOut: (t) => {
      const c4 = (2 * Math.PI) / 3;
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
  };
  
  class TweenHandle {
    constructor(duration, onUpdate, opts = {}) {
      this.duration = Math.max(duration, 0.0001);
      this.onUpdate = onUpdate;
      this.onComplete = opts.onComplete || null;
      this.easing = opts.easing || Easing.cubicOut;
      this.delay = opts.delay || 0;
      this.elapsed = 0;
      this.done = false;
    }
  
    step(dt) {
      if (this.done) return true;
      if (this.delay > 0) {
        this.delay -= dt;
        if (this.delay > 0) return false;
        dt = -this.delay; // consume overshoot
      }
      this.elapsed += dt;
      const t = Math.min(this.elapsed / this.duration, 1);
      this.onUpdate(this.easing(t), t);
      if (t >= 1) {
        this.done = true;
        if (this.onComplete) this.onComplete();
        return true;
      }
      return false;
    }
  
    cancel() { this.done = true; }
  }
  
  export class TweenManager {
    constructor() {
      this.tweens = [];
    }
  
    /**
     * add(duration, onUpdate(eased, raw), {easing, delay, onComplete})
     */
    add(duration, onUpdate, opts = {}) {
      const tw = new TweenHandle(duration, onUpdate, opts);
      this.tweens.push(tw);
      return tw;
    }
  
    update(dt) {
      // iterate backwards so completed tweens can be removed in place
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        if (this.tweens[i].step(dt)) this.tweens.splice(i, 1);
      }
    }
  
    clear() {
      this.tweens.length = 0;
    }
  }
  
  // shared global instance
  export const tweens = new TweenManager();
  