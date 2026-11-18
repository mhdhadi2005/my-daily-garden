// A reader's forest: their harvested trees, each on its own hex, plus any
// water tiles they've added. The layout rules live in
// public/forest3d/hex-layout.js so the page and the server agree on exactly
// which moves are allowed.

const { db } = require("../db");
const HexLayout = require("../../public/forest3d/hex-layout.js");

function readHarvests(subscriberId) {
  return db
    .prepare(`SELECT harvest_number    AS harvestNumber,
                     points_at_harvest AS pointsAtHarvest,
                     cosmetic_earned   AS cosmeticEarned,
                     harvested_at      AS harvestedAt,
                     hex_q AS q, hex_r AS r
              FROM harvests WHERE subscriber_id = ? ORDER BY harvest_number ASC`)
    .all(subscriberId)
    .map((row) => ({ ...row }));
}

// Water tiles: a JSON list of [q, r] on the subscriber row.
function readWater(subscriberId) {
  const row = db.prepare("SELECT forest_water FROM subscribers WHERE id = ?").get(subscriberId);
  try {
    const cells = JSON.parse((row && row.forest_water) || "[]");
    return Array.isArray(cells) ? cells.filter((c) => Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1])) : [];
  } catch {
    return [];
  }
}

function saveWater(subscriberId, water) {
  db.prepare("UPDATE subscribers SET forest_water = ? WHERE id = ?").run(JSON.stringify(water), subscriberId);
}

function saveCells(subscriberId, trees) {
  const update = db.prepare("UPDATE harvests SET hex_q = ?, hex_r = ? WHERE subscriber_id = ? AND harvest_number = ?");
  for (const t of trees) update.run(t.q, t.r, subscriberId, t.harvestNumber);
}

function toResponse(trees) {
  return trees.map(({ q, r, ...rest }) => ({
    ...rest,
    hex: Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null,
  }));
}

// The forest as the page needs it. Trees harvested before layouts existed
// (or just now) get their default spot here, and it's saved, so a tree never
// wanders between visits.
function loadForest(subscriberId) {
  const { trees, changed } = HexLayout.assignDefaults(readHarvests(subscriberId), readWater(subscriberId));
  if (changed.length) saveCells(subscriberId, changed);
  return toResponse(trees);
}

// Move one tree; a tree already on the target cell swaps places with it.
function moveTree(subscriberId, harvestNumber, q, r) {
  const water = readWater(subscriberId);
  const { trees } = HexLayout.assignDefaults(readHarvests(subscriberId), water);
  const result = HexLayout.applyMove(trees, harvestNumber, q, r, water);
  if (!result.ok) return { ok: false, reason: result.reason };
  const moved = result.trees.filter((t) => t.harvestNumber === harvestNumber || t.harvestNumber === result.swapWith);
  db.exec("BEGIN");
  try {
    saveCells(subscriberId, moved);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { ok: true, forest: toResponse(result.trees) };
}

// Turn an empty spot into water (add) or a water tile back into an empty
// spot (remove). The river pieces are worked out from the cells on the page.
function setWater(subscriberId, q, r, add) {
  const water = readWater(subscriberId);
  const { trees } = HexLayout.assignDefaults(readHarvests(subscriberId), water);
  const check = add ? HexLayout.checkAddWater(trees, water, q, r) : HexLayout.checkRemoveWater(trees, water, q, r);
  if (!check.ok) return { ok: false, reason: check.reason };
  const next = add ? [...water, [q, r]] : water.filter(([wq, wr]) => !(wq === q && wr === r));
  saveWater(subscriberId, next);
  return { ok: true, water: next };
}

// Demo forests aren't stored; they get the same default layout.
function demoForest(harvests) {
  return toResponse(HexLayout.assignDefaults(harvests).trees);
}

module.exports = { loadForest, moveTree, setWater, readWater, demoForest };
