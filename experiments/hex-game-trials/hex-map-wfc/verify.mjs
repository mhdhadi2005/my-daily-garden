import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HexWFCSolver } from './upstream/src/workers/wfc.worker.js';
import { HexWFCAdjacencyRules, cubeCoordsInRadius, CUBE_DIRS } from './upstream/src/hexmap/HexWFCCore.js';
import { setSeed } from './upstream/src/SeededRandom.js';
import { TILE_LIST } from './upstream/src/hexmap/HexTileData.js';
import { ALL_CELLS, keyOf, positionOf, frontier, localPatch, validateGarden } from './garden.js';

function solve(cells, fixed, seed) {
  setSeed(seed);
  const solver = new HexWFCSolver(HexWFCAdjacencyRules.fromTileDefinitions(), { maxTries: 3, quiet: true });
  const result = solver.solve(cells, fixed);
  assert.ok(result, `Solver failed for seed ${seed}`);
  assert.equal(result.length, cells.length);
  assert.deepEqual(new Set(result.map(keyOf)), new Set(cells.map(keyOf)));
  return validateGarden([...fixed, ...result]);
}

assert.equal(ALL_CELLS.length, 19);
for (const dir of CUBE_DIRS) {
  const p = positionOf({ q: dir.dq, r: dir.dr });
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - 1.5 * Math.sqrt(3)) < 1e-9, 'Flat-top Blender hexes must meet at every neighbour.');
}

for (let seed = 1; seed <= 60; seed++) {
  let tiles = solve(cubeCoordsInRadius(0, 0, 0, 1), [], seed);
  assert.deepEqual(tiles, solve(cubeCoordsInRadius(0, 0, 0, 1), [], seed), 'The same seed must replay the same grove.');
  while (tiles.length < 19) {
    const before = tiles;
    tiles = solve(frontier(tiles).slice(0, 1), before, seed + tiles.length);
    assert.deepEqual(tiles.slice(0, before.length), before, 'Growing one tile must preserve existing cells.');
  }
  const patch = localPatch(tiles, { q: 1, r: -1, s: 0 });
  assert.equal(patch.length, 7, 'A selected interior tile previews itself and all six occupied neighbours.');
  const keys = new Set(patch.map(keyOf));
  const fixed = tiles.filter(tile => !keys.has(keyOf(tile)));
  const regenerated = solve(patch, fixed, seed + 1000);
  assert.equal(regenerated.length, 19);
  assert.deepEqual(regenerated.slice(0, fixed.length), fixed, 'Local regeneration must keep every outside tile fixed.');
  const initial = solve(cubeCoordsInRadius(0, 0, 0, 1), [], seed);
  const initialKeys = new Set(initial.map(keyOf));
  assert.equal(solve(ALL_CELLS.filter(cell => !initialKeys.has(keyOf(cell))), initial, seed + 100).length, 19);
}

const glb = await readFile(new URL('../../hex-almond-world/seven-hex-world.glb', import.meta.url));
const jsonSize = glb.readUInt32LE(12);
const model = JSON.parse(glb.subarray(20, 20 + jsonSize).toString());
for (const tile of TILE_LIST) {
  const node = model.nodes.find(node => node.name === tile.mesh);
  assert.ok(node?.children?.length, `Missing complete Blender tile ${tile.mesh}`);
  assert.equal(node.extras.tile_radius, 1.5);
}
console.log('Passed: 60 seeds; deterministic 7-tile start, incremental and batch growth to 19, fixed-boundary patch regeneration, no neighbouring ponds, flat-top spacing and seven real Blender roots.');
