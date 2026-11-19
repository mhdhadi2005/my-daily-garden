/* ===================================================================
   My Daily Garden — hex forest layout rules
   Shared by the server (src/engine/forest.js, via require) and the page
   (window.HexLayout), so a move the page offers is exactly a move the
   server accepts.

   Every harvested tree owns one hex, addressed in axial (q, r). The
   growing tree's hex (0,0) and the pond in front of it (0,-1) are fixed;
   readers can move every harvested tree anywhere else within MAX_RING, as
   long as it still touches the forest — so it always stays one block.

   Readers can also turn empty spots into water. Water tiles join up by
   themselves: each one looks at which of its six neighbours are water too
   (the pond always counts) and draws the matching river piece — see
   waterShape(). `water` is a list of [q, r]; it defaults to none.
   =================================================================== */
(function (root) {
  "use strict";

  const CENTRE = [0, 0];
  const POND = [0, -1];
  const MAX_RING = 5; // keeps the whole forest framable on a phone
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  const key = (q, r) => `${q},${r}`;
  const ring = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  const isReserved = (q, r) => (q === CENTRE[0] && r === CENTRE[1]) || (q === POND[0] && r === POND[1]);
  const neighbours = (q, r) => DIRS.map(([dq, dr]) => [q + dq, r + dr]);
  const hasCell = (t) => Number.isInteger(t.q) && Number.isInteger(t.r);

  // Where new trees go: the two front flanks, the two back flanks, then
  // outward ring by ring, front before back. The centre column comes after
  // everything else: a tree there stands right behind the growing tree.
  // (Readers can still move a tree there themselves.)
  const DEFAULT_ORDER = (() => {
    const cells = [];
    for (let q = -MAX_RING; q <= MAX_RING; q++) {
      for (let r = -MAX_RING; r <= MAX_RING; r++) {
        if (ring(q, r) === 0 || ring(q, r) > MAX_RING || isReserved(q, r)) continue;
        cells.push([q, r]);
      }
    }
    const depth = ([q, r]) => r + q / 2; // smaller = nearer the front
    return cells.sort((a, b) =>
      (a[0] === 0) - (b[0] === 0) ||
      ring(...a) - ring(...b) ||
      depth(a) - depth(b) ||
      a[0] - b[0]);
  })();

  const MAX_WATER = 12; // a river, not a lake district

  // cells occupied by tiles: the fixed two, every placed tree, every water tile
  function occupiedMap(trees, except, water = []) {
    const map = new Map([[key(...CENTRE), "centre"], [key(...POND), "pond"]]);
    for (const [q, r] of water) map.set(key(q, r), "water");
    for (const t of trees) if (t.harvestNumber !== except && hasCell(t)) map.set(key(t.q, t.r), t.harvestNumber);
    return map;
  }

  // Every tile joined (edge to edge) to the growing tree's hex.
  function linkedCells(occupied) {
    const seen = new Set([key(...CENTRE)]);
    const queue = [CENTRE];
    while (queue.length) {
      const [q, r] = queue.pop();
      for (const [nq, nr] of neighbours(q, r)) {
        const k = key(nq, nr);
        if (occupied.has(k) && !seen.has(k)) { seen.add(k); queue.push([nq, nr]); }
      }
    }
    return seen;
  }

  // How many tiles aren't joined to the growing tree's hex. A change may not
  // raise this, so no tree is ever left cut off on an island.
  const strandedCount = (occupied) => occupied.size - linkedCells(occupied).size;

  function touchesForest(occupied, q, r) {
    return neighbours(q, r).some(([nq, nr]) => occupied.has(key(nq, nr)));
  }

  // Give every tree without a cell the first free default cell next to the
  // forest, oldest harvest first. Returns a new array plus the trees changed.
  function assignDefaults(trees, water = []) {
    const out = trees.map((t) => ({ ...t }));
    const changed = [];
    // A tree cut off from the forest (possible in layouts saved before the
    // island rule) goes back to the first free spot next to the forest.
    const linked = linkedCells(occupiedMap(out, null, water));
    for (const t of out) if (hasCell(t) && !linked.has(key(t.q, t.r))) { t.q = null; t.r = null; }
    const ordered = [...out].sort((a, b) => a.harvestNumber - b.harvestNumber);
    for (const t of ordered) {
      if (hasCell(t)) continue;
      const occupied = occupiedMap(out, t.harvestNumber, water);
      const cell = DEFAULT_ORDER.find(([q, r]) => !occupied.has(key(q, r)) && touchesForest(occupied, q, r));
      if (!cell) continue; // forest full — leave it unplaced rather than overlap
      [t.q, t.r] = cell;
      changed.push(t);
    }
    return { trees: out, changed };
  }

  // Can tree `harvestNumber` go to (q, r)? A cell holding another tree swaps
  // the two; an empty cell must touch the forest (not counting the moving
  // tree itself, so a tree can't hold itself in place).
  function checkMove(trees, harvestNumber, q, r, water = []) {
    const tree = trees.find((t) => t.harvestNumber === harvestNumber);
    if (!tree || !Number.isInteger(q) || !Number.isInteger(r)) return { ok: false, reason: "unknown tree or cell" };
    if (isReserved(q, r)) return { ok: false, reason: "that spot is taken by your growing tree or the pond" };
    if (ring(q, r) > MAX_RING) return { ok: false, reason: "too far from the centre" };
    if (tree.q === q && tree.r === r) return { ok: false, reason: "already there" };
    const occupied = occupiedMap(trees, harvestNumber, water);
    const other = occupied.get(key(q, r));
    if (other === "water") return { ok: false, reason: "that spot is water" };
    if (typeof other === "number") return { ok: true, swapWith: other };
    if (!touchesForest(occupied, q, r)) return { ok: false, reason: "it has to touch the rest of your forest" };
    const after = new Map(occupied).set(key(q, r), harvestNumber);
    const before = occupiedMap(trees, null, water);
    if (strandedCount(after) > strandedCount(before)) return { ok: false, reason: "that would cut part of your forest off" };
    return { ok: true, swapWith: null };
  }

  function applyMove(trees, harvestNumber, q, r, water = []) {
    const check = checkMove(trees, harvestNumber, q, r, water);
    if (!check.ok) return { ...check, trees };
    const tree = trees.find((t) => t.harvestNumber === harvestNumber);
    const from = { q: tree.q, r: tree.r };
    const out = trees.map((t) => {
      if (t.harvestNumber === harvestNumber) return { ...t, q, r };
      if (t.harvestNumber === check.swapWith) return { ...t, q: from.q, r: from.r };
      return t;
    });
    return { ok: true, swapWith: check.swapWith, trees: out };
  }

  // Empty cells a picked-up tree may move to (trees it can swap with are
  // targets too, but they're already drawn as trees).
  function emptyTargets(trees, harvestNumber, water = []) {
    return DEFAULT_ORDER.filter(([q, r]) => {
      const c = checkMove(trees, harvestNumber, q, r, water);
      return c.ok && c.swapWith === null;
    });
  }

  // ── Water ──

  const hasWater = (water, q, r) => water.some(([wq, wr]) => wq === q && wr === r);

  // Turn an empty spot into water: it must touch the forest, like a tree would.
  function checkAddWater(trees, water, q, r) {
    if (!Number.isInteger(q) || !Number.isInteger(r)) return { ok: false, reason: "unknown cell" };
    if (isReserved(q, r)) return { ok: false, reason: "that spot is taken by your growing tree or the pond" };
    if (ring(q, r) > MAX_RING) return { ok: false, reason: "too far from the centre" };
    if (water.length >= MAX_WATER) return { ok: false, reason: "you can have up to " + MAX_WATER + " water tiles" };
    const occupied = occupiedMap(trees, null, water);
    if (occupied.has(key(q, r))) return { ok: false, reason: "that spot isn't empty" };
    if (!touchesForest(occupied, q, r)) return { ok: false, reason: "it has to touch the rest of your forest" };
    return { ok: true };
  }

  // Turn water back into an empty spot. Always allowed, so a reader can take
  // away every bit of water: water this cuts off from the forest dries up
  // too, and a tree it cuts off moves back next to the forest (assignDefaults
  // does that wherever the forest is drawn or saved). Returns the water left
  // and how many extra tiles dried up.
  function removeWater(trees, water, q, r) {
    if (!hasWater(water, q, r)) return { ok: false, reason: "that isn't a water tile" };
    const rest = water.filter(([wq, wr]) => !(wq === q && wr === r));
    const linked = linkedCells(occupiedMap(trees, null, rest));
    const kept = rest.filter(([wq, wr]) => linked.has(key(wq, wr)));
    return { ok: true, water: kept, dried: rest.length - kept.length };
  }

  function checkRemoveWater(trees, water, q, r) {
    const result = removeWater(trees, water, q, r);
    return result.ok ? { ok: true } : result;
  }

  function waterTargets(trees, water) {
    return DEFAULT_ORDER.filter(([q, r]) => checkAddWater(trees, water, q, r).ok);
  }

  // Which of the six edges carry water out of (q, r).
  // The river flows on from tile to tile in the order the reader added them:
  // each water tile joins the most recently added water tile next to it (or
  // the pond, if it only touches the pond). So a river can fork but never
  // loops back on itself, and adding a tile at the tip just extends it.
  // bit i of mask set = joined to the neighbour in direction DIRS[i].
  // The piece follows from the edges: 0 = a little pool, 1 = an end (spring),
  // 2 = straight / gentle bend / sharp bend (by how far apart the two edges
  // are), 3+ = a fork round a small pool.
  const isPond = (q, r) => q === POND[0] && r === POND[1];
  const dirTo = (q, r, nq, nr) => DIRS.findIndex(([dq, dr]) => q + dq === nq && r + dr === nr);

  // index into water of the tile that water[idx] flows from; -1 = the pond; null = none
  function waterParent(water, idx) {
    const [q, r] = water[idx];
    for (let j = idx - 1; j >= 0; j--) if (dirTo(q, r, water[j][0], water[j][1]) >= 0) return j;
    return dirTo(q, r, ...POND) >= 0 ? -1 : null;
  }

  function waterShape(water, q, r) {
    const idx = isPond(q, r) ? -1 : water.findIndex(([wq, wr]) => wq === q && wr === r);
    const edges = [];
    let out = -1; // the edge the water leaves by, on its way to the pond; -1 = it ends here
    if (idx >= 0) {
      const p = waterParent(water, idx);
      if (p !== null) edges.push(out = p === -1 ? dirTo(q, r, ...POND) : dirTo(q, r, ...water[p]));
    }
    if (idx === -1 && !isPond(q, r)) return { mask: 0, edges: [], out, kind: "pool" }; // not a water tile
    water.forEach(([cq, cr], j) => { if (j !== idx && waterParent(water, j) === idx) edges.push(dirTo(q, r, cq, cr)); });
    edges.sort((a, b) => a - b);
    const mask = edges.reduce((m, i) => m | (1 << i), 0);
    let kind = ["pool", "end"][edges.length] || "fork";
    if (edges.length === 2) kind = ["", "sharp", "gentle", "straight"][Math.min(edges[1] - edges[0], 6 - (edges[1] - edges[0]))];
    return { mask, edges, out, kind };
  }

  const api = {
    CENTRE, POND, MAX_RING, MAX_WATER, DIRS, DEFAULT_ORDER, ring, isReserved, assignDefaults, checkMove, applyMove, emptyTargets,
    checkAddWater, checkRemoveWater, removeWater, waterTargets, waterShape,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HexLayout = api;
})(typeof self !== "undefined" ? self : this);
