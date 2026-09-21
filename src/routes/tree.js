const express = require("express");
const { db } = require("../db");
const { STAGES, COSMETICS, stageForPoints, POINT_VALUES } = require("../engine/config");


const router = express.Router();

const MAX_STAGE_INDEX = STAGES.length - 1;

// Migration-safe: ensure total_harvests column exists
function ensureHarvestsColumn() {
  try {
    db.exec("ALTER TABLE subscribers ADD COLUMN total_harvests INTEGER NOT NULL DEFAULT 0");
  } catch (_) { /* already exists */ }
}
ensureHarvestsColumn();

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

  // Forest: completed harvests
  const totalHarvests = sub.total_harvests || 0;
  const harvests = db
    .prepare(`SELECT harvest_number  AS harvestNumber,
                     points_at_harvest AS pointsAtHarvest,
                     cosmetic_earned AS cosmeticEarned,
                     harvested_at    AS harvestedAt
              FROM harvests WHERE subscriber_id = ? ORDER BY harvest_number ASC`)
    .all(sub.id);

  // Cosmetics inventory
  const cosmeticRows = db
    .prepare("SELECT cosmetic_type FROM forest_cosmetics WHERE subscriber_id = ?")
    .all(sub.id);

  // Enrich cosmetics with metadata from COSMETICS catalog
  const cosmeticMap = Object.fromEntries(COSMETICS.map(c => [c.type, c]));
  const cosmeticsEnriched = cosmeticRows.map(r => cosmeticMap[r.cosmetic_type] || { type: r.cosmetic_type, label: r.cosmetic_type, icon: "🎁", rarity: "common" });

  res.json({
    points:           sub.points,
    streak:           sub.streak,
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
    cosmetics:        cosmeticsEnriched,
    pointValues:      POINT_VALUES,
  });
});


module.exports = router;
