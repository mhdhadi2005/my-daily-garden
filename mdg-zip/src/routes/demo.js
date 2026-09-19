const express = require("express");
const { STAGES, COSMETICS } = require("../engine/config");

const router = express.Router();

const DEMO_COSMETICS = [
  { type: "bunny",       label: "Bunny",       icon: "🐰", rarity: "common"   },
  { type: "fox",         label: "Fox",          icon: "🦊", rarity: "common"   },
  { type: "gnome_house", label: "Gnome House",  icon: "🏠", rarity: "common"   },
  { type: "hedgehog",    label: "Hedgehog",     icon: "🦔", rarity: "uncommon" },
  { type: "wildflowers", label: "Wildflowers",  icon: "🌸", rarity: "common"   },
  { type: "owl",         label: "Owl",          icon: "🦉", rarity: "uncommon" },
  { type: "deer",        label: "Deer",         icon: "🦌", rarity: "rare"     },
  { type: "fairy_lantern", label: "Fairy Lantern", icon: "🏮", rarity: "rare"  },
];

router.get("/api/demo/tree", (req, res) => {
  let stageIndex = parseInt(req.query.stage || 0, 10);
  if (isNaN(stageIndex) || stageIndex < 0) stageIndex = 0;
  if (stageIndex >= STAGES.length) stageIndex = STAGES.length - 1;

  // ?harvests=N — simulate N completed tree cycles
  let totalHarvests = parseInt(req.query.harvests || 0, 10);
  if (isNaN(totalHarvests) || totalHarvests < 0) totalHarvests = 0;

  const currentStage  = STAGES[stageIndex];
  const nextStageInfo = stageIndex + 1 < STAGES.length ? STAGES[stageIndex + 1] : null;

  let calculatedPoints = currentStage.need;
  if (nextStageInfo) {
    calculatedPoints += Math.floor((nextStageInfo.need - currentStage.need) / 2);
  }

  const points = req.query.points !== undefined ? parseInt(req.query.points, 10) : calculatedPoints;
  const streak = req.query.streak !== undefined ? parseInt(req.query.streak, 10) : stageIndex + 1;

  const rewards = [];
  if (stageIndex >= 1) rewards.push({ reward_type: "butterfly", count: stageIndex * 2 });
  if (stageIndex >= 3) rewards.push({ reward_type: "bird",      count: stageIndex - 1 });
  if (stageIndex >= 6) rewards.push({ reward_type: "rare_seed", count: 1 });
  if (stageIndex >= 8) rewards.push({ reward_type: "golden_can", count: 1 });

  const totalClicks   = (stageIndex + 1) * 12 + Math.floor(points / 10) + totalHarvests * 196;
  const totalOpens    = totalClicks + Math.floor(totalClicks * 1.8);
  const stageProgress = nextStageInfo
    ? Math.min(1, (points - currentStage.need) / (nextStageInfo.need - currentStage.need))
    : 1;

  // Generate synthetic forest for demo (one entry per harvest)
  const forest = Array.from({ length: totalHarvests }, (_, i) => ({
    harvestNumber:    i + 1,
    pointsAtHarvest:  1960,
    cosmeticEarned:   DEMO_COSMETICS[i % DEMO_COSMETICS.length].type,
    harvestedAt:      new Date(Date.now() - (totalHarvests - i) * 60 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  // Give them one cosmetic per harvest (cycling through demo set)
  const cosmetics = Array.from({ length: totalHarvests }, (_, i) =>
    DEMO_COSMETICS[i % DEMO_COSMETICS.length]
  );

  res.json({
    points,
    streak,
    longestStreak:    streak + 5,
    totalEngagedDays: streak + 18,
    stage:            { index: stageIndex, name: currentStage.name },
    nextStage:        nextStageInfo ? { name: nextStageInfo.name, pointsNeeded: Math.max(0, nextStageInfo.need - points) } : null,
    rewards,
    totalClicks,
    totalOpens,
    stageProgress,
    // Forest / prestige
    totalHarvests,
    canHarvest:       stageIndex >= STAGES.length - 1,
    forest,
    cosmetics,
  });
});

module.exports = router;
