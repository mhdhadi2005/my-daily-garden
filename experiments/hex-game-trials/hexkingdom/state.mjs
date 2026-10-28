// Almond adapter over Hexkingdom's placement, matching and scoring systems.
import { GridManager } from './upstream/src/grid/GridManager.js';
import { DIRS, axialToWorld, worldToAxial } from './upstream/src/grid/Hex.js';
import { TILE_TYPES, rotateEdges } from './upstream/src/tiles/TileDefs.js';
import { ScoringSystem } from './upstream/src/systems/ScoringSystem.js?v=5';
import { hashCell } from './upstream/src/core/Rng.js';

export const RADIUS = 1.5;
const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
export const CATALOG = {
  seedling: { name: 'Seedling', type: 'field', variant: 0, roots: ['Hex_00_seedling'] },
  young: { name: 'Young tree', type: 'meadow', variant: 1, roots: ['Hex_02_young'] },
  leafy: { name: 'Leafy almond', type: 'forest', variant: 1, roots: ['Hex_04_fruiting', 'Hex_06_fruiting'] },
  blossom: { name: 'Blossom', type: 'forest', variant: 2, roots: ['Hex_01_blossoming', 'Hex_05_blossoming'] },
  pond: { name: 'Pond & bridge', type: 'lake', variant: 1, roots: ['Hex_03_pond'] },
};

// Rotate the original pointy-top grid by 30 degrees to fit the authored flat-top tiles.
export function cellPosition(q, r) {
  const p = axialToWorld(q, r, RADIUS);
  return { x: p.x * COS + p.z * SIN, z: -p.x * SIN + p.z * COS };
}
export function cellAtPosition(x, z) {
  return worldToAxial(x * COS - z * SIN, x * SIN + z * COS, RADIUS);
}
export function makeCell(q, r, asset, rotation = 0) {
  const def = CATALOG[asset];
  if (!def || !Number.isSafeInteger(q) || !Number.isSafeInteger(r) || !Number.isInteger(rotation)) {
    throw new Error('Invalid trial placement');
  }
  const rot = ((rotation % 6) + 6) % 6;
  return {
    q, r, asset, tileType: def.type, variant: def.variant, rotation: rot,
    seed: hashCell(q, r), edges: rotateEdges(TILE_TYPES[def.type].variants[def.variant].edges, rot),
    group: null,
  };
}
export function modelName(cell) {
  const roots = CATALOG[cell.asset].roots;
  return roots[cell.seed % roots.length];
}

export class AlmondTrial {
  constructor() {
    this.grid = new GridManager();
    this.scoring = new ScoringSystem(this.grid);
    this.restart();
  }
  restart() {
    this.grid.clear();
    this.scoring.reset();
    this.placements = 0;
    const start = [[0, 0, 'seedling'], ...DIRS.map((p, i) => [p.q, p.r, ['blossom', 'young', 'pond', 'leafy', 'blossom', 'leafy'][i]])];
    for (const [q, r, asset] of start) this.grid.set(makeCell(q, r, asset));
  }
  preview(q, r, asset, rotation) {
    if (!this.grid.canPlace(q, r)) return null;
    const cell = makeCell(q, r, asset, rotation);
    const evaluation = this.grid.evaluateEdges(q, r, cell.edges);
    const previewGrid = new GridManager();
    previewGrid.cells = new Map(this.grid.cells);
    previewGrid.set(cell);
    const scoring = new ScoringSystem(previewGrid);
    scoring.chain = this.scoring.chain;
    return { cell, evaluation, score: scoring.evaluatePlacement(cell, evaluation) };
  }
  place(q, r, asset, rotation = 0) {
    const candidate = this.preview(q, r, asset, rotation);
    if (!candidate) return null;
    // Original Game.placeTile order: evaluate before insert, then use ScoringSystem.
    this.grid.set(candidate.cell);
    const score = this.scoring.scorePlacement(candidate.cell, candidate.evaluation);
    this.placements++;
    return { ...candidate, score };
  }
}
