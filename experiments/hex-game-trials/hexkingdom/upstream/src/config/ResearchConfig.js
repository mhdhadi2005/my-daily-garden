// ============================================================
// ResearchConfig — lightweight research tree data.
// Each node: cost, duration, prerequisites, and what it unlocks
// (buildings via BuildingConfig.research, or passive bonuses
// applied by ResearchSystem).
// ============================================================

export const RESEARCH = {
  agriculture: {
    id: 'agriculture',
    name: 'Agriculture',
    icon: 'agriculture',
    cost: { food: 30, gold: 10 },
    duration: 30,             // seconds
    requires: [],
    unlocks: 'Farm building · +10% food production',
    bonus: { foodMult: 1.10 },
  },
  mining: {
    id: 'mining',
    name: 'Mining',
    icon: 'mining',
    cost: { wood: 25, gold: 15 },
    duration: 40,
    requires: [],
    unlocks: 'Mine building · +10% stone production',
    bonus: { stoneMult: 1.10 },
  },
  engineering: {
    id: 'engineering',
    name: 'Engineering',
    icon: 'engineering',
    cost: { wood: 40, stone: 30, gold: 20 },
    duration: 60,
    requires: ['mining'],
    unlocks: 'Storage building · -15% construction time',
    bonus: { buildTimeMult: 0.85 },
  },
  trade: {
    id: 'trade',
    name: 'Trade',
    icon: 'trade',
    cost: { gold: 35, food: 20 },
    duration: 50,
    requires: ['agriculture'],
    unlocks: 'Market building · +15% gold production',
    bonus: { goldMult: 1.15 },
  },
  military: {
    id: 'military',
    name: 'Military',
    icon: 'military',
    cost: { wood: 30, stone: 25, gold: 25 },
    duration: 55,
    requires: ['engineering'],
    unlocks: 'Watchtower building · +10 kingdom defense',
    bonus: { defenseBonus: 10 },
  },
  warfare: {
    id: 'warfare',
    name: 'Warfare',
    icon: 'warfare',
    cost: { wood: 40, stone: 40, gold: 30 },
    duration: 70,
    requires: ['military'],
    unlocks: 'Ballista Tower · Gate · Bastion · Siege Camp · +10 kingdom defense',
    bonus: { defenseBonus: 10 },
  },
  crop_rotation: {
    id: 'crop_rotation',
    name: 'Crop Rotation',
    icon: 'crop_rotation',
    cost: { food: 50, gold: 25 },
    duration: 60,
    requires: ['agriculture'],
    unlocks: 'Better farming tools · +20% food production',
    bonus: { foodMult: 1.20 },
  },
  iron_tools: {
    id: 'iron_tools',
    name: 'Iron Tools',
    icon: 'iron_tools',
    cost: { wood: 40, stone: 35, gold: 25 },
    duration: 65,
    requires: ['mining'],
    unlocks: 'Iron axes & picks · +15% wood and stone production',
    bonus: { woodMult: 1.15, stoneMult: 1.15 },
  },
  crossbows: {
    id: 'crossbows',
    name: 'Crossbows',
    icon: 'crossbows',
    cost: { wood: 50, gold: 40 },
    duration: 75,
    requires: ['warfare'],
    unlocks: 'Better weapons · +25% army strength · +5 kingdom defense',
    bonus: { armyMult: 1.25, defenseBonus: 5 },
  },
};

export const RESEARCH_ORDER = [
  'agriculture', 'crop_rotation', 'mining', 'iron_tools',
  'trade', 'engineering', 'military', 'warfare', 'crossbows',
];
