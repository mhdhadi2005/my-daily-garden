import assert from 'node:assert/strict';
import { AlmondTrial, CATALOG, cellPosition, cellAtPosition, makeCell, modelName, RADIUS } from './state.mjs';
import { GridManager } from './upstream/src/grid/GridManager.js';
import { ScoringSystem } from './upstream/src/systems/ScoringSystem.js';
import { DIRS, neighbors } from './upstream/src/grid/Hex.js';
import { rotateEdges } from './upstream/src/tiles/TileDefs.js';
import { events } from './upstream/src/core/Events.js';

for (let q = -8; q <= 8; q++) for (let r = -8; r <= 8; r++) {
  const p = cellPosition(q, r), inverse = cellAtPosition(p.x, p.z);
  assert(inverse.q === q && inverse.r === r, `Grid inverse failed at ${q},${r}`);
  for (const n of neighbors(q, r)) {
    const np = cellPosition(n.q, n.r);
    assert(Math.abs(Math.hypot(np.x - p.x, np.z - p.z) - RADIUS * Math.sqrt(3)) < 1e-9);
  }
}
const trial = new AlmondTrial();
assert.equal(trial.grid.size, 7);
assert.equal(trial.scoring.total, 0);
assert.equal(trial.grid.frontierCells().length, 12);
assert.equal(trial.place(0, 0, 'leafy'), null, 'Cannot replace a planted cell');
assert.equal(trial.place(100, 100, 'leafy'), null, 'Cannot place disconnected cells');
assert.equal(trial.scoring.total, 0, 'Rejected placement cannot score');
let scoreEvents = 0;
const off = events.on('score:changed', () => scoreEvents++);
for (const [i, asset] of Object.keys(CATALOG).entries()) {
  const p = trial.grid.frontierCells()[i % trial.grid.frontierCells().length];
  const cells = structuredClone([...trial.grid.cells.entries()]);
  const state = [trial.scoring.total, trial.scoring.chain, trial.placements, scoreEvents];
  const preview = trial.preview(p.q, p.r, asset, i);
  assert.deepEqual([...trial.grid.cells.entries()], cells, 'Preview cannot alter the live grid');
  assert.deepEqual([trial.scoring.total, trial.scoring.chain, trial.placements, scoreEvents], state, 'Preview cannot award points, advance chains or emit score events');
  const before = trial.scoring.total;
  const result = trial.place(p.q, p.r, asset, i);
  assert.equal(scoreEvents, state[3] + 1, 'Planting emits exactly one actual score award');
  assert(result && result.evaluation.total > 0);
  assert.deepEqual(result.cell.edges, preview.cell.edges);
  assert.equal(modelName(result.cell), modelName(preview.cell), 'Preview uses the actual planted model');
  assert.deepEqual(result.score, preview.score, 'Preview points must equal the actual award, including chain/region bonuses');
  assert.equal(trial.scoring.total, before + result.score.delta);
  assert(CATALOG[asset].roots.includes(modelName(result.cell)));
  assert.equal(trial.place(p.q, p.r, asset), null, 'Same placement cannot score twice');
}
off();
assert.equal(trial.grid.size, 12);
assert.equal(trial.placements, 5);
const grid = new GridManager(), score = new ScoringSystem(grid);
for (const p of DIRS.slice(0, 3)) grid.set(makeCell(p.q, p.r, 'leafy'));
const perfectCell = makeCell(0, 0, 'leafy');
perfectCell.edges = ['forest', 'forest', 'forest', 'forest', 'forest', 'forest'];
for (const c of grid.cells.values()) c.edges = [...perfectCell.edges];
const evaluation = grid.evaluateEdges(0, 0, perfectCell.edges);
grid.set(perfectCell);
const result = score.scorePlacement(perfectCell, evaluation);
assert.equal(result.perfect, true);
assert.equal(result.multiplier, 3);
assert.equal(result.delta, 120, '3 matching edges + 4-tile region = (30 + 10) × 3');
const nextScore = score.evaluatePlacement(perfectCell, evaluation);
assert.equal(nextScore.delta, 130, 'Same calculation includes the next chain bonus of 10');
assert.equal(nextScore.chain, 2);
assert.equal(score.chain, 1, 'Pure score calculation cannot advance the chain');
assert.equal(score.total, 120, 'Pure score calculation cannot award points');
const sample = ['forest', 'field', 'field', 'forest', 'field', 'field'];
assert.deepEqual(rotateEdges(sample, 6), sample);
assert.deepEqual(rotateEdges(rotateEdges(sample, 1), 5), sample);
trial.restart();
assert.equal(trial.grid.size, 7);
assert.equal(trial.scoring.total, 0);
assert.equal(trial.placements, 0);
console.log('PASS: grid adjacency/matching/scoring, immutable exact-score previews, almond placement invariants, flat-top coordinate conversion, rotation, restart and model mapping.');
