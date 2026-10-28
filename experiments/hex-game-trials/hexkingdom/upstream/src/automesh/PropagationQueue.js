// ============================================================
// PropagationQueue — deduplicated, batched local-update queue.
//
// GUARANTEES (production hardening)
//   * a tile change enqueues ONLY itself + affected neighbors
//   * each (q, r) is processed at most once per flush pass
//   * DETERMINISTIC ORDER: pending tiles are processed in sorted
//     cell-key order per pass — identical input always produces
//     the identical update sequence (replays / saves / tests)
//   * NO INFINITE LOOPS: a per-flush revisit counter caps how
//     many times a single tile may re-enter the same flush
//     (oscillating rule sets are cut off per-tile, loudly),
//     plus a global maxPerFlush cascade cap as a last resort
//   * updates discovered DURING a flush are folded into the
//     same flush (bounded cascade), never a full-world rebuild
//   * re-entrant enqueue while flushing is safe; re-entrant
//     flush() calls are no-ops (the outer flush drains all)
//
// The queue is engine-agnostic: it just calls the supplied
// `processTile(q, r)` callback. AutoMeshSystem owns one.
// ============================================================
import { cellKey } from '../grid/Hex.js';

export class PropagationQueue {
  /**
   * @param {(q:number, r:number) => void} processTile
   * @param {{maxPerFlush?: number, maxRevisits?: number}} opts
   *        maxPerFlush  global cascade cap (safety net)
   *        maxRevisits  times one tile may re-enter a single flush
   */
  constructor(processTile, opts = {}) {
    this._process = processTile;
    this._pending = new Map(); // key -> {q, r}
    this._flushing = false;
    this._maxPerFlush = opts.maxPerFlush ?? 4096;
    this._maxRevisits = opts.maxRevisits ?? 8;
    this.stats = {
      enqueued: 0, deduped: 0, processed: 0, flushes: 0,
      loopCut: 0, // tiles cut off by the revisit guard
    };
  }

  get pendingCount() {
    return this._pending.size;
  }

  /** enqueue a tile; duplicates are merged */
  enqueue(q, r) {
    const key = cellKey(q, r);
    if (this._pending.has(key)) {
      this.stats.deduped++;
      return false;
    }
    this._pending.set(key, { q, r });
    this.stats.enqueued++;
    return true;
  }

  /**
   * Process everything pending (including work enqueued while
   * flushing). Each pass drains a SORTED snapshot of the pending
   * set (deterministic order); tiles re-enqueued during a pass
   * are handled in the next pass, guarded per-tile against
   * infinite oscillation. Re-entrant calls are no-ops.
   * @returns {number} tiles processed
   */
  flush() {
    if (this._flushing) return 0;
    this._flushing = true;
    this.stats.flushes++;
    let processed = 0;
    const visits = new Map(); // key -> times processed this flush
    try {
      while (this._pending.size > 0 && processed < this._maxPerFlush) {
        // deterministic pass: snapshot keys, sorted; new enqueues
        // discovered during the pass land in _pending for the next pass
        const keys = [...this._pending.keys()].sort();
        for (const key of keys) {
          const item = this._pending.get(key);
          if (!item) continue; // consumed by a nested interaction
          this._pending.delete(key);

          const n = (visits.get(key) || 0) + 1;
          visits.set(key, n);
          if (n > this._maxRevisits) {
            // oscillation guard: this tile keeps re-entering the
            // same flush — cut it off instead of looping forever
            this.stats.loopCut++;
            console.warn(`PropagationQueue: tile ${key} exceeded ` +
              `${this._maxRevisits} revisits in one flush — loop cut`);
            continue;
          }

          this._process(item.q, item.r);
          processed++;
          if (processed >= this._maxPerFlush) break;
        }
      }
      if (this._pending.size > 0) {
        // global cascade cap hit — drop the rest but warn loudly
        console.warn(`PropagationQueue: flush cap (${this._maxPerFlush}) hit, ` +
          `${this._pending.size} updates dropped`);
        this._pending.clear();
      }
    } finally {
      this._flushing = false;
    }
    this.stats.processed += processed;
    return processed;
  }

  clear() {
    this._pending.clear();
  }
}
