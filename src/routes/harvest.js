// POST /api/tree/:beehiivSubscriberId/harvest
// Called when a subscriber at max stage (Enchanted Grove) taps "Harvest".
// - Validates they are actually at max stage
// - Records the harvest, rolls a cosmetic reward
// - Resets points to 0 (streak stays — they're still engaged)
// - Increments total_harvests
// - Returns celebration data + cosmetic earned

const express = require("express");
const { db } = require("../db");
const { STAGES, stageForPoints, rollHarvestCosmetic } = require("../engine/config");
const { syncSubscriberStats } = require("../integrations/beehiiv");

const router = express.Router();

const MAX_STAGE_INDEX = STAGES.length - 1;

// Migration-safe: add total_harvests column if it doesn't exist yet
function ensureHarvestsColumn() {
  try {
    db.exec("ALTER TABLE subscribers ADD COLUMN total_harvests INTEGER NOT NULL DEFAULT 0");
  } catch (_) {
    // Column already exists — that's fine
  }
}
ensureHarvestsColumn();

router.post("/api/tree/:beehiivSubscriberId/harvest", (req, res) => {
  const sub = db
    .prepare("SELECT * FROM subscribers WHERE beehiiv_subscriber_id = ?")
    .get(req.params.beehiivSubscriberId);

  if (!sub) return res.status(404).json({ error: "subscriber not found" });

  const stageIdx = stageForPoints(sub.points);
  if (stageIdx < MAX_STAGE_INDEX) {
    return res.status(400).json({
      error: "not_ready",
      message: `Tree is at stage ${stageIdx} (${STAGES[stageIdx].name}) — must reach stage ${MAX_STAGE_INDEX} (${STAGES[MAX_STAGE_INDEX].name}) to harvest`,
      currentStage: stageIdx,
      maxStage: MAX_STAGE_INDEX,
    });
  }

  const harvestNumber = (sub.total_harvests || 0) + 1;
  const cosmetic = rollHarvestCosmetic(harvestNumber);

  // Record harvest
  db.prepare(
    "INSERT INTO harvests (subscriber_id, harvest_number, points_at_harvest, cosmetic_earned) VALUES (?, ?, ?, ?)"
  ).run(sub.id, harvestNumber, sub.points, cosmetic.type);

  // Record cosmetic in forest
  db.prepare(
    "INSERT INTO forest_cosmetics (subscriber_id, cosmetic_type, earned_from_harvest) VALUES (?, ?, ?)"
  ).run(sub.id, cosmetic.type, harvestNumber);

  // Reset points, keep streak + longest_streak intact
  db.prepare(
    "UPDATE subscribers SET points = 0, total_harvests = ? WHERE id = ?"
  ).run(harvestNumber, sub.id);

  // Sync back to Beehiiv: tree resets to Seed, keep streak
  syncSubscriberStats(sub.beehiiv_subscriber_id, {
    points: 0,
    streak: sub.streak,
    tree_stage: STAGES[0].name, // "Seed"
  }).catch((err) => console.error("[harvest] beehiiv sync failed:", err));

  // Pull the full forest history to return
  const harvests = db
    .prepare("SELECT * FROM harvests WHERE subscriber_id = ? ORDER BY harvest_number ASC")
    .all(sub.id);

  const cosmetics = db
    .prepare("SELECT cosmetic_type FROM forest_cosmetics WHERE subscriber_id = ?")
    .all(sub.id);

  res.json({
    success: true,
    harvestNumber,
    cosmeticEarned: cosmetic,
    newPoints: 0,
    newStage: { index: 0, name: STAGES[0].name },
    totalHarvests: harvestNumber,
    forest: harvests.map((h) => ({
      harvestNumber: h.harvest_number,
      pointsAtHarvest: h.points_at_harvest,
      cosmeticEarned: h.cosmetic_earned,
      harvestedAt: h.harvested_at,
    })),
    cosmetics: cosmetics.map((c) => c.cosmetic_type),
  });
});

module.exports = router;
