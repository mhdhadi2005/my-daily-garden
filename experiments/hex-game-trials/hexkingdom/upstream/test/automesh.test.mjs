// ============================================================
// Universal Connectivity Engine — headless Node test suite.
// Run:  node test/automesh.test.mjs
// Pure logic only (no three.js): masks, registry, flow graphs,
// lake smoothing, structures, propagation, extensibility.
// ============================================================
import { GridManager } from '../src/grid/GridManager.js';
import {
  AutoMeshSystem, classifyMask, rotateMask, maskFromString,
  maskToString, edgesToMask, popcount,
} from '../src/automesh/AutoMeshSystem.js';
import {
  registerStandardTypes, WATER_TYPES, SOURCE_TERRAIN, makeStructureConfig,
} from '../src/automesh/AutoMeshAdapters.js';
import { classifyLakeEdges, classifyLakeTile } from '../src/automesh/LakeSmoothing.js';
import { classifyRole, FlowNode } from '../src/automesh/RiverFlowSystem.js';
import { oppositeEdge, DIRS } from '../src/grid/Hex.js';

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}
function eq(a, b, msg) {
  ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
function section(name) { console.log(`\n== ${name} ==`); }

// ---- helpers -------------------------------------------------
function makeEngine() {
  const grid = new GridManager();
  const engine = new AutoMeshSystem(grid);
  registerStandardTypes(engine);
  return { grid, engine };
}

let seedN = 1;
function cell(q, r, tileType, extra = {}) {
  return {
    q, r, tileType, rotation: 0, seed: seedN++,
    edges: ['g', 'g', 'g', 'g', 'g', 'g'],
    group: null, riverEdges: [], roadEdges: [], ...extra,
  };
}

/** place + notify engine (mimics TileFactory/Game flow) */
function place(grid, engine, c) {
  grid.set(c);
  engine.onTileChanged(c.q, c.r);
  return c;
}

// ============================================================
section('Bitmask math');
// ============================================================
eq(maskToString(maskFromString('010101')), '010101', 'mask string round-trip');
eq(rotateMask(0b000001, 1), 0b000010, 'rotate by 1');
eq(rotateMask(0b100000, 1), 0b000001, 'rotate wraps');
eq(popcount(0b111111), 6, 'popcount full');
eq(classifyMask(0b001001).shape, 'straight', 'straight shape');
eq(classifyMask(0b010101).shape, 'junction_y', 'Y shape');
eq(classifyMask(0b111111).shape, 'hub', 'hub shape');
// every mask classifies + rotation reconstructs it
let lutOk = true;
for (let m = 0; m < 64; m++) {
  const c = classifyMask(m);
  if (rotateMask(c.canonical, c.rotation) !== m) lutOk = false;
}
ok(lutOk, 'LUT rotation reconstructs all 64 masks');
eq(edgesToMask([0, 2, 4]), 0b010101, 'edgesToMask');

// ============================================================
section('Type registry: register / unregister / runtime extensibility');
// ============================================================
{
  const { engine } = makeEngine();
  ok(engine.hasType('road') && engine.hasType('river') && engine.hasType('lake')
    && engine.hasType('village') && engine.hasType('castle'),
    'standard types registered (incl. castle)');
  let threw = false;
  try { engine.registerType('road', {}); } catch { threw = true; }
  ok(threw, 'duplicate registration throws');

  // runtime NEW type without touching core: 'railway'
  engine.registerType('railway', {
    appliesTo: (c) => !!(c.railEdges && c.railEdges.length),
    connects: ({ cell, neighbor, edge }) =>
      !!neighbor && cell.railEdges.includes(edge) &&
      !!neighbor.railEdges?.includes(oppositeEdge(edge)),
    shapeAliases: { end: 'terminus', straight: 'track' },
  });
  ok(engine.hasType('railway'), 'runtime type registered');
  ok(engine.unregisterType('railway'), 'unregisterType removes');
  ok(!engine.hasType('railway'), 'railway gone after unregister');
}

// ============================================================
section('Road connectivity + variant labels');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // straight road: edges 0<->3 across three tiles in a row
  place(grid, engine, cell(0, 0, 'field', { roadEdges: [0, 3] }));
  place(grid, engine, cell(1, 0, 'field', { roadEdges: [0, 3] }));
  place(grid, engine, cell(-1, 0, 'field', { roadEdges: [0, 3] }));
  const v = engine.variantAt('road', 0, 0);
  eq(v.label, 'straight', 'middle tile is straight');
  eq(v.mask, 0b001001, 'mask = edges 0+3');
  const end = engine.variantAt('road', 1, 0);
  eq(end.label, 'dead_end', 'row end is dead_end');
}

// ============================================================
section('Village/castle integration: auto-connect, force/optional accept');
// ============================================================
{
  const { grid, engine } = makeEngine();
  place(grid, engine, cell(0, 0, 'village'));
  place(grid, engine, cell(1, 0, 'field', { roadEdges: [0, 3] })); // road points at village (edge 3)
  const vv = engine.variantAt('village', 0, 0);
  eq(vv.label, 'single_entrance', 'village auto-connects to adjacent road');
  const rv = engine.variantAt('road', 1, 0);
  ok((rv.mask >> 3) & 1, 'road connects INTO the village (edge 3 set)');
  eq(rv.label, 'settlement_approach', 'context-aware road label near settlement');

  // optional accept: a structure refusing roads
  const { grid: g2, engine: e2 } = makeEngine();
  place(g2, e2, cell(0, 0, 'village', { acceptsRoads: false }));
  place(g2, e2, cell(1, 0, 'field', { roadEdges: [0, 3] }));
  eq(e2.variantAt('village', 0, 0).label, 'isolated', 'refusing village stays isolated');
  eq((e2.variantAt('road', 1, 0).mask >> 3) & 1, 0, 'road does not enter refusing village');

  // castle reuses the same system with its own labels
  const { grid: g3, engine: e3 } = makeEngine();
  place(g3, e3, cell(0, 0, 'castle'));
  place(g3, e3, cell(1, 0, 'field', { roadEdges: [0, 3] }));
  eq(e3.variantAt('castle', 0, 0).label, 'gate', 'castle gets gate label');
}

// ============================================================
section('River flow graph: source → stream → mouth (direction propagation)');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // mountain feeds a spring at (0,0); river runs east into a lake at (3,0)
  place(grid, engine, cell(-1, 0, 'mountain'));
  place(grid, engine, cell(0, 0, 'field', { riverEdges: [0, 3] })); // spring end faces mountain
  place(grid, engine, cell(1, 0, 'field', { riverEdges: [0, 3] }));
  place(grid, engine, cell(2, 0, 'field', { riverEdges: [0, 3] }));
  place(grid, engine, cell(3, 0, 'lake'));

  const flow = engine.flows.get('river');
  const n0 = flow.get(0, 0), n1 = flow.get(1, 0), n2 = flow.get(2, 0);
  eq(n0.role, 'source', 'head tile is source');
  eq(n1.role, 'stream', 'middle tile is stream');
  eq(n2.role, 'mouth', 'lake-adjacent tile is mouth');
  ok((n1.outMask >> 0) & 1, 'stream flows east (toward lake)');
  ok((n1.inMask >> 3) & 1, 'stream receives from west');
  ok((n2.sinkMask >> 0) & 1, 'mouth sink edge faces the lake');
  eq(engine.variantAt('river', 2, 0).label, 'river_into_lake', 'mouth variant label');
  eq(engine.variantAt('river', 0, 0).label, 'source', 'source variant label');

  // directions exposed via getConnections
  const conns = engine.getConnections('river', 1, 0);
  const outE = conns.find((c) => c.edge === 0), inE = conns.find((c) => c.edge === 3);
  eq(outE.direction, 'out', 'getConnections reports outbound');
  eq(inE.direction, 'in', 'getConnections reports inbound');
}

// ============================================================
section('River merge: 2 inputs → 1 output');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // two branches meet at (0,0) and continue east into a lake
  // branch A arrives from West (edge 3), branch B from NW-ish edge 2
  place(grid, engine, cell(0, 0, 'field', { riverEdges: [0, 2, 3] }));
  place(grid, engine, cell(-1, 0, 'field', { riverEdges: [0] }));   // A: flows east into junction
  place(grid, engine, cell(0, -1, 'field', { riverEdges: [5] }));   // B: flows SE into junction
  place(grid, engine, cell(1, 0, 'lake'));                          // sink east

  const flow = engine.flows.get('river');
  const j = flow.get(0, 0);
  eq(j.role, 'merge', 'junction classified as merge');
  eq(popcount(j.inMask), 2, 'merge has 2 inputs');
  eq(popcount(j.outMask), 1, 'merge has 1 output');
  ok((j.outMask >> 0) & 1, 'merged output flows toward the lake');
  eq(engine.variantAt('river', 0, 0).label, 'merge', 'merge variant label');
}

// ============================================================
section('River split: 1 input → multiple streams');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // source on the west; junction fans into TWO sinks (lakes)
  place(grid, engine, cell(-2, 0, 'mountain'));
  place(grid, engine, cell(-1, 0, 'field', { riverEdges: [0, 3] })); // spring
  place(grid, engine, cell(0, 0, 'field', { riverEdges: [3, 0, 5] })); // fork
  place(grid, engine, cell(1, 0, 'lake'));   // sink 1 (east)
  place(grid, engine, cell(0, 1, 'lake'));   // sink 2 (south-east)

  const flow = engine.flows.get('river');
  const f = flow.get(0, 0);
  eq(f.role, 'split', 'fork classified as split');
  eq(popcount(f.inMask), 1, 'split has 1 input');
  eq(popcount(f.outMask), 2, 'split has 2 outputs');
  eq(engine.variantAt('river', 0, 0).label, 'split', 'split variant label');
}

// ============================================================
section('River termination + dynamic re-orientation');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // river with NO sink and NO source terrain: deterministic orientation, end role
  place(grid, engine, cell(0, 0, 'field', { riverEdges: [0, 3] }));
  place(grid, engine, cell(1, 0, 'field', { riverEdges: [0, 3] }));
  const flow = engine.flows.get('river');
  const roles = [flow.get(0, 0).role, flow.get(1, 0).role].sort();
  ok(roles.includes('end') || roles.includes('source'),
    'anchorless river still gets oriented deterministically');

  // NOW place a lake at the east end — flow must re-orient toward it
  place(grid, engine, cell(2, 0, 'lake'));
  eq(flow.get(1, 0).role, 'mouth', 'tile next to new lake becomes mouth');
  ok((flow.get(0, 0).outMask >> 0) & 1, 'upstream re-oriented east after lake placed');
  eq(engine.variantAt('river', 1, 0).label, 'river_into_lake',
    'variant updated after downstream lake appears (no manual refresh)');
}

// ============================================================
section('Waterfall hook system (future extension point)');
// ============================================================
{
  const { grid, engine } = makeEngine();
  const riverType = engine.registry.get('river');
  riverType.flow.hooks.push({
    name: 'waterfall',
    test: (node, c) => c.isCliff === true && node.outMask !== 0,
  });
  place(grid, engine, cell(-1, 0, 'mountain'));
  place(grid, engine, cell(0, 0, 'field', { riverEdges: [0, 3], isCliff: true }));
  place(grid, engine, cell(1, 0, 'field', { riverEdges: [0, 3] }));
  place(grid, engine, cell(2, 0, 'lake'));
  const node = engine.flows.get('river').get(0, 0);
  ok(node.tags.includes('waterfall'), 'hook tags the cliff tile');
  eq(engine.variantAt('river', 0, 0).label, 'waterfall',
    'hook label wins the resolver pipeline (priority 200)');
  riverType.flow.hooks.pop();
}

// ============================================================
section('Lake smoothing: edge classes + tile classes');
// ============================================================
{
  // pure classifier
  eq(classifyLakeTile(0b111111), 'inner_water', 'all-water tile class');
  eq(classifyLakeTile(0b011111), 'open_water', '5-water tile class');
  eq(classifyLakeTile(0), 'pond', 'isolated pond class');
  // land edge 1 flanked by water 0 and 2 -> corner shore
  const cls = classifyLakeEdges(0b000101);
  eq(cls[1], 'shore_corner', 'flanked land edge is corner shore');
  eq(cls[0], 'peninsula', 'pinched water edge (land both sides) is peninsula');
  eq(cls[4], 'shore', 'plain land edge classified');
  // contiguous water: middle edge is plain water, not peninsula
  const cls2 = classifyLakeEdges(0b000111);
  eq(cls2[1], 'water', 'water edge flanked by water is plain water');

  // integrated: 7-tile lake — center becomes inner_water
  const { grid, engine } = makeEngine();
  place(grid, engine, cell(0, 0, 'lake'));
  for (let e = 0; e < 6; e++) {
    place(grid, engine, cell(DIRS[e].q, DIRS[e].r, 'lake'));
  }
  const center = engine.variantAt('lake', 0, 0);
  eq(center.label, 'inner_water', 'surrounded center is inner water');
  eq(center.edgeClasses.tileClass, 'inner_water', 'edge report agrees');
  const rim = engine.variantAt('lake', 1, 0);
  ok(rim.label === 'shore' || rim.label === 'corner_shore', 'rim tiles are shore');
  ok(rim.edgeClasses.edges.includes('water'), 'rim sees water edges');

  // river inlet classification
  const { grid: g2, engine: e2 } = makeEngine();
  place(g2, e2, cell(0, 0, 'lake'));
  place(g2, e2, cell(1, 0, 'field', { riverEdges: [3] })); // river flows west into lake
  const lk = e2.variantAt('lake', 0, 0);
  eq(lk.edgeClasses.edges[0], 'inlet', 'river mouth edge classified as inlet');
}

// ============================================================
section('Propagation: local-only updates, dedup, no world rebuild');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // build a 5-tile road line + far-away decoy tiles
  for (let q = 0; q < 5; q++) place(grid, engine, cell(q, 0, 'field', { roadEdges: [0, 3] }));
  for (let q = 20; q < 30; q++) place(grid, engine, cell(q, 5, 'forest'));

  engine.stats.updates = 0;
  engine.queue.stats.enqueued = 0;
  engine.queue.stats.deduped = 0;

  // change one middle tile
  place(grid, engine, cell(2, 1, 'field', { roadEdges: [2, 5] }));
  ok(engine.stats.updates <= 7 + 2, // tile + 6 neighbors (+ flow-changed refreshes)
    `single change touches ≤9 tiles (got ${engine.stats.updates})`);
  ok(engine.stats.updates < 15, 'decoy tiles never touched');

  // dedup: enqueue same tile many times before flush
  engine.queue.enqueue(0, 0);
  engine.queue.enqueue(0, 0);
  engine.queue.enqueue(0, 0);
  ok(engine.queue.stats.deduped >= 2, 'duplicate enqueues merged');
  engine.queue.flush();

  // change detection: re-processing an unchanged tile does not rebuild
  const before = engine.stats.rebuilds;
  engine.updateTile(0, 0);
  eq(engine.stats.rebuilds, before, 'no rebuild when signature unchanged');
}

// ============================================================
section('Variant resolver: priority, fallback, layers, meta');
// ============================================================
{
  const { grid, engine } = makeEngine();
  engine.registerType('fence', {
    appliesTo: (c) => c.hasFence === true,
    connects: ({ neighbor }) => !!neighbor && neighbor.hasFence === true,
    resolvers: [
      { priority: 1, resolve: () => null },                       // passes
      { priority: 5, resolve: (ctx) => ctx.cell.fancy ? 'ornate' : null }, // conditional
    ],
    shapeAliases: { isolated: 'post' },
    fallbackLabel: 'plain_fence',
    layers: [
      { name: 'decor', resolve: (ctx) => ctx.cell.ivy ? { label: 'ivy', meta: { density: 2 } } : null },
    ],
  });
  const a = place(grid, engine, cell(0, 0, 'field', { hasFence: true, fancy: true, ivy: true }));
  const v = engine.variantAt('fence', 0, 0);
  eq(v.label, 'ornate', 'high-priority conditional resolver wins');
  eq(v.layers.length, 1, 'overlay layer resolved');
  eq(v.layers[0].label, 'ivy', 'layer label');
  eq(v.layers[0].meta.density, 2, 'layer meta carried');

  a.fancy = false;
  engine.onTileChanged(0, 0);
  eq(engine.variantAt('fence', 0, 0).label, 'post',
    'falls back to shape alias when resolver declines');

  a.hasFence = true; a.fancy = false;
  // unknown shape alias -> fallbackLabel
  const type = engine.registry.get('fence');
  type.shapeAliases = {}; // no aliases at all
  engine.onTileChanged(0, 0);
  eq(engine.variantAt('fence', 0, 0).label, 'plain_fence', 'type fallbackLabel used');
}

// ============================================================
section('API surface: setTileType / getTileData / resolveVariant');
// ============================================================
{
  const { grid, engine } = makeEngine();
  place(grid, engine, cell(0, 0, 'field'));
  place(grid, engine, cell(1, 0, 'field', { roadEdges: [0, 3] }));
  engine.setTileType(0, 0, 'village');
  eq(engine.variantAt('village', 0, 0).label, 'single_entrance',
    'setTileType propagates to structure connectivity');
  const data = engine.getTileData(0, 0);
  ok(data && data.village, 'getTileData returns per-type entries');
  const rv = engine.resolveVariant('road', grid.get(1, 0));
  eq(rv.label, 'settlement_approach', 'resolveVariant works standalone');
  eq(typeof engine.computeMask('road', grid.get(1, 0)), 'number', 'computeMask exposed');
}

// ============================================================
section('Plugin-style extension: trench system, zero core edits');
// ============================================================
{
  const { grid, engine } = makeEngine();
  // a brand-new system with its own semantics, added at runtime
  engine.registerType('trench', {
    appliesTo: (c) => !!(c.trenchEdges && c.trenchEdges.length),
    connects: ({ cell, neighbor, edge }) =>
      !!neighbor && cell.trenchEdges.includes(edge) &&
      !!neighbor.trenchEdges?.includes(oppositeEdge(edge)),
    shapeAliases: { end: 'trench_end', straight: 'trench_line', curve_tight: 'trench_bend' },
    resolvers: [{
      priority: 10,
      resolve: (ctx) => {
        // context-aware: trench next to a castle becomes a moat
        for (let e = 0; e < 6; e++) {
          const n = ctx.neighbor(e);
          if (n && n.tileType === 'castle') return 'moat';
        }
        return null;
      },
    }],
  });
  place(grid, engine, cell(-1, 0, 'field', { trenchEdges: [0, 3] }));
  place(grid, engine, cell(0, 0, 'field', { trenchEdges: [0, 3] }));
  place(grid, engine, cell(1, 0, 'field', { trenchEdges: [0, 3] }));
  eq(engine.variantAt('trench', 0, 0).label, 'trench_line', 'new system autotiles');
  place(grid, engine, cell(0, 1, 'castle'));
  eq(engine.variantAt('trench', 0, 0).label, 'moat',
    'context-aware resolver reacts to neighbor castle');
}

// ============================================================
section('Flow role classifier (unit)');
// ============================================================
{
  const n = new FlowNode(0, 0);
  eq(classifyRole(n), 'still', 'no connections -> still');
  n.inMask = 0b000001; n.outMask = 0b001000;
  eq(classifyRole(n), 'stream', '1-in 1-out -> stream');
  n.inMask = 0b000011;
  eq(classifyRole(n), 'merge', '2-in -> merge');
  n.inMask = 0b000001; n.outMask = 0b011000;
  eq(classifyRole(n), 'split', '2-out -> split');
  n.outMask = 0;
  eq(classifyRole(n), 'end', 'no output, no sink -> end');
  n.outMask = 0b001000; n.sinkMask = 0b001000;
  eq(classifyRole(n), 'mouth', 'sink edge -> mouth');
  n.inMask = 0; n.sinkMask = 0;
  eq(classifyRole(n), 'source', 'no input -> source');
}

// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
