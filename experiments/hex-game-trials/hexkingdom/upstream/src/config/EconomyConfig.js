// ============================================================
// EconomyConfig — SINGLE SOURCE OF TRUTH for all game-rule
// balance constants: resource model, tile costs, upkeep,
// storage caps, kingdom tiers, faction archetypes and world
// event tables. Pure data — no rendering, no geometry.
// ============================================================

// ---------------- resources ----------------

export const RESOURCE_KEYS = ['wood', 'stone', 'food', 'gold', 'influence'];

export const STARTING_RESOURCES = {
  wood: 60, stone: 30, food: 50, gold: 25, influence: 5,
};

export const STARTING_STABILITY = 70;   // 0..100 gauge
export const STABILITY_BASELINE = 70;   // slow drift target
export const STABILITY_DRIFT = 0.004;   // per second per point of gap toward baseline
export const STABILITY_FOOD_SHORTAGE = -0.35; // per second while starving
export const STABILITY_OVERFLOW = -0.08;      // per second per overflowing resource
export const STABILITY_POP_REGEN = 0.004;     // per second per fed citizen…
export const STABILITY_POP_REGEN_MAX = 0.05;  // …capped here

// ---------------- trade (auto-sell surplus) ----------------
// Trade buildings sell resources piling up near the storage cap,
// turning overflow into gold instead of rot + unrest.

export const TRADE_SELL_START = 0.75;  // selling starts above this fraction of cap
export const TRADE_SELL_UNITS = 1.2;   // units/s sold per point of trade power
export const TRADE_SELL_PRICES = { wood: 0.25, stone: 0.3, food: 0.2 }; // gold per unit

/** production multiplier from stability: 0.6 at 0 → 1.0 at 100 */
export function stabilityProductionMult(stability) {
  return 0.6 + 0.4 * (stability / 100);
}

// ---------------- tile placement costs ----------------
// Every placement costs resources. Costs scale with kingdom size
// (expansion pressure) so infinite sprawl is impossible.

export const TILE_COSTS = {
  forest:   { wood: 2, food: 1 },
  field:    { wood: 3, gold: 1 },
  river:    { wood: 2, stone: 1 },
  mountain: { wood: 2, food: 2 },
  village:  { wood: 6, stone: 2, food: 3, gold: 2 },
  lake:     { wood: 2, stone: 1 },
  meadow:   { wood: 2 },
  swamp:    { wood: 2, food: 1 },
  hills:    { wood: 2, stone: 1 },
  quarry:   { wood: 4, stone: 1, gold: 2 },
  ruins:    { wood: 2, gold: 1 },
};

/** expansion pressure: +1.5% cost per tile already placed (compounding scarcity) */
export const TILE_COST_GROWTH = 0.015;

export function scaledTileCost(type, tilesPlaced) {
  const base = TILE_COSTS[type] || { wood: 2 };
  const mult = 1 + tilesPlaced * TILE_COST_GROWTH;
  const out = {};
  for (const [res, v] of Object.entries(base)) {
    out[res] = Math.round(v * mult * 10) / 10;
  }
  return out;
}

// ---------------- production per tile ----------------

export const BASE_PRODUCTION = {
  forest:   { wood: 0.5 },
  field:    { food: 0.5 },
  mountain: { stone: 0.35 },
  village:  { gold: 0.3, influence: 0.05 },
  river:    { food: 0.1 },
  lake:     { food: 0.15 },
  meadow:   { food: 0.3 },
  swamp:    { wood: 0.15 },
  hills:    { stone: 0.15, food: 0.1 },
  quarry:   { stone: 0.5 },
  ruins:    { influence: 0.03, gold: 0.05 },
};

// ---------------- building upkeep (per second) ----------------
// Buildings are counted through evolution events; upkeep grows
// with the kingdom, keeping net income sub-exponential.

export const BUILDING_UPKEEP = {
  house:  { gold: 0.01, food: 0.02 },
  tower:  { gold: 0.025 },
  castle: { gold: 0.06, food: 0.04 },
  bridge: { wood: 0.01 },
};

/** food eaten per citizen per second */
export const FOOD_PER_POP = 0.06;

// ---------------- overflow / decay ----------------
// Resources above the storage cap rot away and hurt stability.

export const OVERFLOW_DECAY = 0.05; // fraction of excess lost per economy tick

// ---------------- kingdom tiers (manual progression) ----------------

export const TIERS = [
  { // Tier 1 (index 0)
    name: 'Settlement',
    icon: 'settlement',
    maxTiles: 14,
    storageCap: 140,
    prodMult: 1.0, armyCap: 0,
    unlocks: ['forest', 'field', 'river', 'village'],
    upgradeCost: null, upgradeTime: 0, minStability: 0, minTiles: 0,
  },
  { // Tier 2
    name: 'Village',
    icon: 'village_tier',
    maxTiles: 26,
    storageCap: 280,
    prodMult: 1.06, armyCap: 4,
    unlocks: ['forest', 'field', 'river', 'village', 'mountain', 'meadow'],
    upgradeCost: { wood: 55, food: 40, gold: 18, influence: 8 },
    upgradeTime: 45, minStability: 35, minTiles: 8,
  },
  { // Tier 3
    name: 'Town',
    icon: 'town',
    maxTiles: 44,
    storageCap: 520,
    prodMult: 1.14, armyCap: 8,
    unlocks: ['forest', 'field', 'river', 'village', 'mountain', 'meadow', 'hills', 'lake'],
    upgradeCost: { wood: 130, stone: 70, food: 85, gold: 55, influence: 26 },
    upgradeTime: 90, minStability: 45, minTiles: 18,
  },
  { // Tier 4
    name: 'City',
    icon: 'city',
    maxTiles: 72,
    storageCap: 950,
    prodMult: 1.24, armyCap: 14,
    unlocks: ['forest', 'field', 'river', 'village', 'mountain', 'meadow', 'hills', 'lake', 'quarry', 'swamp'],
    upgradeCost: { wood: 250, stone: 190, food: 170, gold: 130, influence: 70 },
    upgradeTime: 150, minStability: 50, minTiles: 34,
  },
  { // Tier 5
    name: 'Kingdom',
    icon: 'kingdom',
    maxTiles: 999,
    storageCap: 1700,
    prodMult: 1.35, armyCap: 22,
    unlocks: ['forest', 'field', 'river', 'village', 'mountain', 'meadow', 'hills', 'lake', 'quarry', 'swamp', 'ruins'],
    upgradeCost: { wood: 440, stone: 360, food: 300, gold: 280, influence: 150 },
    upgradeTime: 240, minStability: 55, minTiles: 58,
  },
];

/** tier name that first unlocks this tile type */
export function tileUnlockTierName(type) {
  for (const tier of TIERS) {
    if (tier.unlocks.includes(type)) return tier.name;
  }
  return TIERS[TIERS.length - 1].name;
}

export const FACTION_ARCHETYPES = {
  friendly_kingdom: {
    label: 'Friendly Kingdom', icon: 'friendly', hostile: false,
    count: 1, spawnDist: [11, 15],
    strength: 40, strengthGrowth: 0.015, maxStrength: 120,
    aggression: 0.0, expansion: 0.30, maxTerritory: 40,
    startTile: 'village',
    tilePool: ['forest', 'field', 'meadow', 'village'],
  },
  neutral_village: {
    label: 'Neutral Village', icon: 'neutral', hostile: false,
    count: 2, spawnDist: [7, 11],
    strength: 8, strengthGrowth: 0.004, maxStrength: 25,
    aggression: 0.0, expansion: 0.06, maxTerritory: 6,
    startTile: 'village',
    tilePool: ['field', 'forest', 'meadow'],
  },
  hostile_kingdom: {
    label: 'Hostile Kingdom', icon: 'hostile', hostile: true,
    count: 1, spawnDist: [15, 20],
    strength: 22, strengthGrowth: 0.02, maxStrength: 130,
    aggression: 0.22, expansion: 0.22, maxTerritory: 50,
    startTile: 'village',
    tilePool: ['forest', 'field', 'mountain', 'village'],
  },
  barbarian_clan: {
    label: 'Barbarian Clan', icon: 'barbarian', hostile: true,
    count: 1, spawnDist: [12, 16],
    strength: 12, strengthGrowth: 0.025, maxStrength: 75,
    aggression: 0.28, expansion: 0.28, maxTerritory: 35,
    startTile: 'field',
    tilePool: ['forest', 'field', 'hills'],
  },
  bandit_camp: {
    label: 'Bandit Camp', icon: 'bandit', hostile: true,
    count: 2, spawnDist: [10, 14],
    strength: 5, strengthGrowth: 0.006, maxStrength: 18,
    aggression: 0.22, expansion: 0.05, maxTerritory: 4,
    startTile: 'field',
    tilePool: ['forest', 'field'],
  },
};

export const FACTION_TICK = 15;         // seconds between faction AI ticks
export const CAPTURE_BASE_CHANCE = 0.10; // scaled by strength ratio + aggression
/** hostile factions cannot capture player tiles until the kingdom is this large */
export const EARLY_CAPTURE_MIN_TILES = 10;

// ---------------- army (recruited units) ----------------

export const UNIT_TYPES = {
  swordsman: {
    id: 'swordsman', name: 'Swordsman', icon: 'garrison', maker: 'unitSwordsman',
    cost: { food: 8, gold: 6 }, strength: 3,
    desc: 'Steady line infantry.',
  },
  archer: {
    id: 'archer', name: 'Archer', icon: 'unit_bow', maker: 'unitArcher',
    cost: { wood: 6, gold: 8 }, strength: 4,
    desc: 'Ranged support with a longbow.',
  },
  knight: {
    id: 'knight', name: 'Knight', icon: 'unit_knight', maker: 'unitKnight',
    cost: { gold: 16, food: 10 }, strength: 7,
    desc: 'Heavy elite cavalry.',
  },
};

export const ARMY_BASE_CAP = 6;            // strength cap with no army buildings
export const ARMY_CAP_PER_BARRACKS = 8;    // + per completed barracks
export const ARMY_CAP_PER_GARRISON = 3;    // + per completed garrison
export const ATTACK_SUPPLY_COST = { food: 6 };        // paid per attack
export const ATTACK_TILE_DEFENSE_BASE = 6;            // innate defense of any enemy tile
export const ATTACK_FACTION_DEFENSE_SCALE = 0.3;      // + faction strength × this
export const ATTACK_WIN_STABILITY = 3;                // stability on victory
export const ATTACK_LOSS_STABILITY = -3;              // stability on defeat

/** player defense score from kingdom state */
export function playerDefense({ towers = 0, castles = 0, stability = 70, population = 0, army = 0 }) {
  return 10 + towers * 6 + castles * 15 + stability * 0.3 + population * 0.5 + army * 0.5;
}

// ---------------- territory ----------------

export const RECLAIM_BASE_COST = 14;      // influence to reclaim a captured tile
export const RECLAIM_COST_PER_CAPTURE = 4; // grows with number of captures suffered
export const CAPTURE_STABILITY_HIT = -8;
export const RECLAIM_STABILITY_GAIN = 4;
export const INFLUENCE_SPREAD_INTERVAL = 8; // seconds between passive influence pulses

// ---------------- world events ----------------

export const WORLD_EVENT_INTERVAL = [35, 70]; // seconds, uniform roll

export const WORLD_EVENTS = {
  trade_caravan: {
    label: 'Trade Caravan', icon: 'caravan',
    baseWeight: 3,
    gain: { gold: 12, food: 4 }, stability: +3,
  },
  raid: {
    label: 'Raid', icon: 'raid',
    baseWeight: 2,
    stealFraction: 0.12, // of current gold+food
    stability: -6,
  },
  famine: {
    label: 'Famine', icon: 'famine',
    baseWeight: 1.5,
    foodLossFraction: 0.25, stability: -5,
  },
  prosperity: {
    label: 'Prosperity', icon: 'prosperity',
    baseWeight: 2,
    productionMult: 1.5, duration: 30, stability: +5,
  },
  migration: {
    label: 'Migration', icon: 'migration',
    baseWeight: 1.5,
    populationGain: 2, stability: +2,
  },
};
