// ============================================================
// Rng — deterministic seedable pseudo-random generator (mulberry32)
// Used for reproducible tile decoration layouts per hex cell.
// ============================================================
export class Rng {
    constructor(seed = 1337) {
      this.s = seed >>> 0;
    }
  
    /** float in [0, 1) */
    next() {
      this.s = (this.s + 0x6d2b79f5) >>> 0;
      let t = this.s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  
    /** float in [min, max) */
    range(min, max) {
      return min + this.next() * (max - min);
    }
  
    /** integer in [min, max] inclusive */
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    }
  
    /** pick random element from array */
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }
  
    /** boolean with probability p */
    chance(p) {
      return this.next() < p;
    }
  }
  
  /** Stable hash for a hex cell -> RNG seed */
  export function hashCell(q, r) {
    let h = 2166136261;
    h = Math.imul(h ^ (q + 0x8000), 16777619);
    h = Math.imul(h ^ (r + 0x8000), 16777619);
    return h >>> 0;
  }
  