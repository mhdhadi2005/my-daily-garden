// Config lives in one place so product decisions (caps, odds, stage thresholds)
// are easy to tune without hunting through logic code.

const STAGES = [
  { name: "Seed",                need: 0 },      // Day 0
  { name: "Sapling",            need: 25 },      // ~1 day
  { name: "Young Tree",         need: 70 },      // ~2 days
  { name: "Budding Branches",   need: 140 },     // ~4 days
  { name: "Blossom",            need: 230 },     // ~1 week
  { name: "Green Almonds",      need: 350 },     // ~11 days
  { name: "Ripening Almonds",   need: 500 },     // ~2 weeks
  { name: "Harvest Tree",       need: 680 },     // ~3 weeks
  { name: "Ancient Almond Tree", need: 880 },    // ~1 month
  { name: "Blessed Tree",       need: 1100 },    // ~5 weeks
  { name: "Flourishing Tree",   need: 1340 },    // ~6 weeks
  { name: "Majestic Tree",      need: 1580 },    // ~7 weeks
  { name: "Golden Orchard",     need: 1820 },    // ~8 weeks
  { name: "Enchanted Grove",    need: 1960 },    // ~2 months
];

const POINTS_PER_CLICK = 10;      // every qualifying click, equal weight
const DAILY_CLICK_CAP = 5;        // clicks beyond this in one day don't earn points (set to Infinity to disable)
const OPEN_BONUS_POINTS = 2;      // opens contribute a small bonus, never drive streak/growth
const QUIZ_CORRECT_BONUS = 15;
const PURCHASE_BONUS_POINTS = 20; // bonus points for purchasing a product

const POINT_VALUES = {
  click: POINTS_PER_CLICK,
  open: OPEN_BONUS_POINTS,
  quiz: QUIZ_CORRECT_BONUS,
  purchase: PURCHASE_BONUS_POINTS,
  dailyClickCap: DAILY_CLICK_CAP,
};


// Reward odds on each qualifying (points-earning) click.
// These are the REAL odds from the spec — the boosted demo odds were only
// in the front-end prototypes, not here.
const REWARD_TABLE = [
  { type: "legendary",  chance: 0.001 },
  { type: "rainbow",    chance: 0.002 },
  { type: "golden_can", chance: 0.005 },
  { type: "rare_seed",  chance: 0.01 },
  { type: "bird",       chance: 0.03 },
  { type: "butterfly",  chance: 0.05 },
];

// Cosmetics earned on each tree harvest (prestige system).
// minHarvest = minimum number of completed trees before this can drop.
const COSMETICS = [
  // Animals
  { type: "bunny",         label: "Bunny",         icon: "🐰", rarity: "common",    minHarvest: 1 },
  { type: "fox",           label: "Fox",            icon: "🦊", rarity: "common",    minHarvest: 1 },
  { type: "hedgehog",      label: "Hedgehog",       icon: "🦔", rarity: "uncommon",  minHarvest: 2 },
  { type: "owl",           label: "Owl",            icon: "🦉", rarity: "uncommon",  minHarvest: 2 },
  { type: "deer",          label: "Deer",           icon: "🦌", rarity: "rare",      minHarvest: 3 },
  { type: "peacock",       label: "Peacock",        icon: "🦚", rarity: "epic",      minHarvest: 5 },
  // Structures
  { type: "gnome_house",   label: "Gnome House",    icon: "🏠", rarity: "common",    minHarvest: 1 },
  { type: "bird_bath",     label: "Bird Bath",      icon: "⛲", rarity: "common",    minHarvest: 1 },
  { type: "tiny_fence",    label: "Tiny Fence",     icon: "🪵", rarity: "uncommon",  minHarvest: 2 },
  { type: "stone_well",    label: "Stone Well",     icon: "🪣", rarity: "uncommon",  minHarvest: 3 },
  { type: "fairy_lantern", label: "Fairy Lantern",  icon: "🏮", rarity: "rare",      minHarvest: 4 },
  { type: "golden_gate",   label: "Golden Gate",    icon: "✨", rarity: "legendary", minHarvest: 6 },
  // Nature
  { type: "wildflowers",   label: "Wildflowers",    icon: "🌸", rarity: "common",    minHarvest: 1 },
  { type: "mushroom_ring", label: "Mushroom Ring",  icon: "🍄", rarity: "uncommon",  minHarvest: 2 },
  { type: "lily_pond",     label: "Lily Pond",      icon: "🪷", rarity: "rare",      minHarvest: 4 },
  { type: "rainbow_arch",  label: "Rainbow Arch",   icon: "🌈", rarity: "legendary", minHarvest: 7 },
];

// Rarity weights — common drops most often
const RARITY_WEIGHTS = { common: 0.50, uncommon: 0.28, rare: 0.14, epic: 0.06, legendary: 0.02 };

function rollHarvestCosmetic(harvestNumber) {
  const eligible = COSMETICS.filter(c => c.minHarvest <= harvestNumber);
  if (eligible.length === 0) return COSMETICS[0]; // fallback: bunny

  // Weighted roll by rarity
  const totalWeight = eligible.reduce((sum, c) => sum + (RARITY_WEIGHTS[c.rarity] || 0.1), 0);
  let roll = Math.random() * totalWeight;
  for (const c of eligible) {
    roll -= RARITY_WEIGHTS[c.rarity] || 0.1;
    if (roll <= 0) return c;
  }
  return eligible[eligible.length - 1];
}

function stageForPoints(points) {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (points >= STAGES[i].need) idx = i;
  }
  return idx;
}

function rollReward() {
  const r = Math.random();
  let cumulative = 0;
  // Ordered rarest-first above so rare rewards get first claim on the roll.
  for (const entry of REWARD_TABLE) {
    cumulative += entry.chance;
    if (r < cumulative) return entry.type;
  }
  return null;
}

function todayStr(date = new Date()) {
  return date.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + "T00:00:00Z");
  const b = new Date(dateStrB + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

module.exports = {
  STAGES,
  POINTS_PER_CLICK,
  DAILY_CLICK_CAP,
  OPEN_BONUS_POINTS,
  QUIZ_CORRECT_BONUS,
  PURCHASE_BONUS_POINTS,
  POINT_VALUES,
  REWARD_TABLE,
  COSMETICS,
  rollHarvestCosmetic,
  stageForPoints,
  rollReward,
  todayStr,
  daysBetween,
};

