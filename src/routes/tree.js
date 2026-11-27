const express = require("express");
const { resolvePassParam, createPass } = require("../engine/pass");
const { db } = require("../db");
const { STAGES, COSMETICS, stageForPoints, POINT_VALUES, streakStatus } = require("../engine/config");
const { loadForest, moveTree, setWater, readWater } = require("../engine/forest");


const router = express.Router();
router.param("beehiivSubscriberId", resolvePassParam); // a valid pass (header) is required; raw IDs are refused

// POST /api/garden/session  { token }
// A reader's personal newsletter link (/?t=<token>) swapped for a pass.
router.post("/api/garden/session", (req, res) => {
  const token = String((req.body && req.body.token) || "");
  const sub = token.length >= 24 ? db.prepare("SELECT beehiiv_subscriber_id FROM subscribers WHERE garden_token = ?").get(token) : null;
  if (!sub) return res.status(404).json({ error: "unknown_link", message: "This garden link doesn't work. Open your garden from your latest newsletter." });
  res.json(createPass(sub.beehiiv_subscriber_id));
});

const MAX_STAGE_INDEX = STAGES.length - 1;

// GET /api/tree/:beehiivSubscriberId
router.get("/api/tree/:beehiivSubscriberId", (req, res) => {
  const sub = db
    .prepare("SELECT * FROM subscribers WHERE beehiiv_subscriber_id = ?")
    .get(req.params.beehiivSubscriberId);
  if (!sub) return res.status(404).json({ error: "subscriber not found" });

  const stageIdx  = stageForPoints(sub.points);
  const stage     = STAGES[stageIdx];
  const nextStage = STAGES[stageIdx + 1] || null;

  const rewards = db
    .prepare("SELECT reward_type, COUNT(*) AS count FROM reward_log WHERE subscriber_id = ? GROUP BY reward_type")
    .all(sub.id);

  const clickCount = db.prepare("SELECT COUNT(*) AS n FROM click_log WHERE subscriber_id = ?").get(sub.id);
  const openCount  = db.prepare("SELECT COUNT(*) AS n FROM open_log  WHERE subscriber_id = ?").get(sub.id);

  const currentNeed  = stage.need;
  const nextNeed     = nextStage ? nextStage.need : currentNeed;
  const stageProgress = nextStage
    ? Math.min(1, (sub.points - currentNeed) / (nextNeed - currentNeed))
    : 1;

  // Forest: completed harvests, each on its hex
  const totalHarvests = sub.total_harvests || 0;
  const harvests = loadForest(sub.id);

  // Cosmetics inventory
  const cosmeticRows = db
    .prepare("SELECT cosmetic_type FROM forest_cosmetics WHERE subscriber_id = ?")
    .all(sub.id);

  // Enrich cosmetics with metadata from COSMETICS catalog
  const cosmeticMap = Object.fromEntries(COSMETICS.map(c => [c.type, c]));
  const cosmeticsEnriched = cosmeticRows.map(r => cosmeticMap[r.cosmetic_type] || { type: r.cosmetic_type, label: r.cosmetic_type, icon: "🎁", rarity: "common" });

  const streak = streakStatus(sub);

  res.json({
    points:           sub.points,
    streak:           streak.streak,
    streakState:      streak.state,
    longestStreak:    sub.longest_streak,
    totalEngagedDays: sub.total_engaged_days,
    stage:            { index: stageIdx, name: stage.name },
    nextStage:        nextStage ? { name: nextStage.name, pointsNeeded: nextStage.need - sub.points } : null,
    rewards,
    totalClicks:      clickCount.n,
    totalOpens:       openCount.n,
    stageProgress,
    // Forest / prestige data
    totalHarvests,
    canHarvest:       stageIdx >= MAX_STAGE_INDEX,
    forest:           harvests,
    forestWater:      readWater(sub.id),
    cosmetics:        cosmeticsEnriched,
    pointValues:      POINT_VALUES,
    // What they saw last visit, for the "grown since you were last here"
    // replay. null on a first visit.
    lastView: sub.last_viewed_at
      ? { points: sub.last_viewed_points, totalHarvests: sub.last_viewed_harvests,
          streak: sub.last_viewed_streak, at: sub.last_viewed_at }
      : null,
  });
});

// POST /api/tree/:beehiivSubscriberId/viewed
// Called by the page once the reader has seen their current tree (after any
// growth replay has played). Snapshots current state as the new baseline.
// Kept separate from the GET so reloads/refetches can't silently consume a
// replay the reader never actually watched.
router.post("/api/tree/:beehiivSubscriberId/viewed", (req, res) => {
  const sub = db
    .prepare("SELECT * FROM subscribers WHERE beehiiv_subscriber_id = ?")
    .get(req.params.beehiivSubscriberId);
  if (!sub) return res.status(404).json({ error: "subscriber not found" });
  db.prepare(`UPDATE subscribers
                 SET last_viewed_points = points,
                     last_viewed_harvests = total_harvests,
                     last_viewed_streak = ?,
                     last_viewed_at = datetime('now')
               WHERE id = ?`)
    .run(streakStatus(sub).streak, sub.id);
  res.status(204).end();
});

// POST /api/tree/:beehiivSubscriberId/forest/move  { harvestNumber, q, r }
// Moves one harvested tree to another hex in the reader's forest (a tree
// already there swaps places). Rules: public/forest3d/hex-layout.js.
router.post("/api/tree/:beehiivSubscriberId/forest/move", (req, res) => {
  const sub = db
    .prepare("SELECT id FROM subscribers WHERE beehiiv_subscriber_id = ?")
    .get(req.params.beehiivSubscriberId);
  if (!sub) return res.status(404).json({ error: "subscriber not found" });
  const { harvestNumber, q, r } = req.body || {};
  const result = moveTree(sub.id, Number(harvestNumber), Number(q), Number(r));
  if (!result.ok) return res.status(400).json({ error: "invalid_move", message: result.reason });
  res.json({ forest: result.forest });
});

// POST /api/tree/:beehiivSubscriberId/forest/water  { q, r, add: true|false }
// Turns an empty spot into water, or a water tile back into an empty spot.
// The page joins water tiles into a river itself. Rules: hex-layout.js.
router.post("/api/tree/:beehiivSubscriberId/forest/water", (req, res) => {
  const sub = db
    .prepare("SELECT id FROM subscribers WHERE beehiiv_subscriber_id = ?")
    .get(req.params.beehiivSubscriberId);
  if (!sub) return res.status(404).json({ error: "subscriber not found" });
  const { q, r, add } = req.body || {};
  const result = setWater(sub.id, Number(q), Number(r), add !== false);
  if (!result.ok) return res.status(400).json({ error: "invalid_water", message: result.reason });
  res.json({ water: result.water, dried: result.dried, forest: result.forest });
});


module.exports = router;
