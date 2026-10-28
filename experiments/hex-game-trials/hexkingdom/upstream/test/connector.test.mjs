// Run: node test/connector.test.mjs
import { GridManager } from '../src/grid/GridManager.js';
import {
  syncRiversOnPlacement, buildRoadConnections, canHaveRoad,
} from '../src/systems/ConnectorSystem.js';

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

function cell(q, r, tileType, extra = {}) {
  return {
    q, r, tileType, rotation: 0, seed: 1,
    edges: ['g', 'g', 'g', 'g', 'g', 'g'],
    riverEdges: [], roadEdges: [], ...extra,
  };
}

console.log('\n== River auto-sync on placement ==');
{
  const grid = new GridManager();
  const river = cell(0, 0, 'river', { riverEdges: [0, 3] });
  grid.set(river);
  const field = cell(1, 0, 'field');
  syncRiversOnPlacement(field, grid);
  ok(field.riverEdges.includes(3), 'field gains river edge facing neighbor');
  ok(river.riverEdges.includes(0), 'river gains return edge');
}

console.log('\n== Road build connects neighbors ==');
{
  const grid = new GridManager();
  grid.set(cell(-1, 0, 'field', { roadEdges: [0] }));
  grid.set(cell(1, 0, 'village'));
  const hub = cell(0, 0, 'field');
  grid.set(hub);
  const changed = buildRoadConnections(hub, grid);
  ok(canHaveRoad(hub), 'field accepts roads');
  ok(hub.roadEdges.includes(3), 'hub links west to existing road');
  ok(hub.roadEdges.includes(0), 'hub links east to village');
  ok(changed.size >= 1, 'reports changed cells');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
