// ============================================================
// AutoMeshAdapters — DATA-DRIVEN type configs for the Universal
// Connectivity Engine: road, river, lake, village, castle.
//
// PURE LOGIC: no three.js imports. Rendering callbacks are
// passed in from the caller (Game wires MeshVariants.js here;
// unit tests pass none and assert masks/labels/flow only).
//
// NOTHING in the engine knows these types exist — every rule
// below is plain config + resolver functions. Adding walls,
// fences, railways, borders or trenches is one registerType()
// call following the same pattern (see makeStructureConfig and
// the extension guide in src/automesh/README.md).
// ============================================================
import { oppositeEdge, DIRS } from '../grid/Hex.js';
import { computeLakeEdgeClasses } from './LakeSmoothing.js';

// ---- shared domain vocabularies (data, not logic) -----------
// Tile types treated as water bodies for lake smoothing + river sinks.
export const WATER_TYPES = new Set(['lake']);
// Settlement tile types: roads terminate INTO these; they grow
// entrance paths back. Castles reuse the same structure config.
export const SETTLEMENT_TYPES = new Set(['village', 'castle']);
// Terrain that turns a lone river end into a spring (source).
export const SOURCE_TERRAIN = new Set(['mountain', 'hills']);

const hasEdge = (list, e) => !!list && list.includes(e);

function neighborAt(grid, cell, e) {
  if (e == null || e < 0) return null;
  const d = DIRS[e];
  return grid.get(cell.q + d.q, cell.r + d.r);
}

// ============================================================
// ROAD
//   connects: my road connector on edge i AND the neighbor either
//   continues the road on the opposite edge OR is a settlement
//   that accepts connections (asymmetric: road -> village needs
//   the village's consent, village -> road is forced — see
//   makeStructureConfig below).
// ============================================================
export const roadConfig = {
  priority: 10,
  maskInterpretation: 'symmetric',
  affects: ['village', 'castle'],

  appliesTo: (cell) => !!(cell.roadEdges && cell.roadEdges.length),

  connects: ({ cell, neighbor, edge }) => {
    if (!hasEdge(cell.roadEdges, edge)) return false;
    if (!neighbor) return false;
    if (hasEdge(neighbor.roadEdges, oppositeEdge(edge))) return true;
    // road terminates into a settlement — unless the structure
    // explicitly refuses (acceptsRoads === false).
    return SETTLEMENT_TYPES.has(neighbor.tileType) && neighbor.acceptsRoads !== false;
  },

  shapeAliases: {
    isolated: 'isolated',
    end: 'dead_end',
    straight: 'straight',
    curve_tight: 'corner',
    curve_wide: 'corner',
    junction_fan: 't_junction',
    junction_t: 't_junction',
    junction_t_mirror: 't_junction',
    junction_y: 't_junction',
    cross_fan: 'crossroads',
    cross_x: 'crossroads',
    cross_h: 'crossroads',
    star: 'crossroads',
    hub: 'crossroads',
  },

  // context-aware refinements (priority pipeline, first hit wins)
  resolvers: [
    {
      // a dead end whose single link enters a settlement is a gate road
      priority: 10,
      resolve: (ctx) => {
        if (ctx.cls.count !== 1) return null;
        const e = ctx.connections()[0];
        const n = ctx.neighbor(e);
        return n && SETTLEMENT_TYPES.has(n.tileType) ? 'settlement_approach' : null;
      },
    },
  ],
};

// ============================================================
// RIVER — flow-enabled type. The undirected mask says WHERE the
// river runs; the RiverFlowSystem graph says WHICH WAY it flows.
// Labels come from the flow role first (source / mouth / merge /
// split / stream / end), shape aliases fill visual detail.
// ============================================================
export const riverConfig = {
  priority: 20,
  maskInterpretation: 'directed',

  appliesTo: (cell) => !!(cell.riverEdges && cell.riverEdges.length),

  connects: ({ cell, neighbor, edge }) => {
    if (!hasEdge(cell.riverEdges, edge)) return false;
    if (!neighbor) return false;
    if (hasEdge(neighbor.riverEdges, oppositeEdge(edge))) return true;
    return WATER_TYPES.has(neighbor.tileType); // river flows into lakes
  },

  // directed-graph configuration consumed by RiverFlowSystem
  flow: {
    // a river tile is a natural spring when one of its own
    // UNCONNECTED connector ends faces mountainous terrain
    isSource: (cell, engine) => {
      const mask = engine.computeMask('river', cell);
      for (const e of cell.riverEdges) {
        if ((mask >> e) & 1) continue;
        const n = neighborAt(engine.grid, cell, e);
        if (n && SOURCE_TERRAIN.has(n.tileType)) return true;
      }
      return false;
    },
    // an edge into a water body is a sink (river -> lake transition)
    isSinkEdge: (cell, nCell) => WATER_TYPES.has(nCell.tileType),
    // waterfall hook system: future extension point. Example:
    //   riverConfig.flow.hooks.push({
    //     name: 'waterfall',
    //     test: (node, cell, engine) => cellDropsOffCliff(cell, node.outMask),
    //   });
    // plus registerOverlayBuilder('river:waterfall', …) — zero core changes.
    hooks: [],
  },

  shapeAliases: {
    isolated: 'source',
    end: 'river_ending',
    straight: 'straight',
    curve_tight: 'corner',
    curve_wide: 'corner',
    junction_fan: 'merge',
    junction_t: 'merge',
    junction_t_mirror: 'merge',
    junction_y: 'split',
    cross_fan: 'merge',
    cross_x: 'merge',
    cross_h: 'merge',
    star: 'merge',
    hub: 'merge',
  },

  // flow-graph roles beat static shape guesses (priority pipeline)
  resolvers: [
    {
      priority: 100,
      resolve: (ctx) => {
        const f = ctx.flow;
        if (!f) return null;
        switch (f.role) {
          case 'mouth': return { label: 'river_into_lake', meta: { sinkMask: f.sinkMask } };
          case 'source': return ctx.cls.count === 0 ? 'source' : { label: 'source', meta: { depth: f.depth } };
          case 'merge': return { label: 'merge', meta: { inputs: f.inMask, output: f.outMask } };
          case 'split': return { label: 'split', meta: { input: f.inMask, outputs: f.outMask } };
          case 'end': return 'river_ending';
          case 'still': return 'source';
          default: return null; // 'stream' -> fall through to shape aliases
        }
      },
    },
    {
      // waterfall (or any hook tag) overrides everything when present
      priority: 200,
      resolve: (ctx) => {
        const tags = ctx.flow?.tags;
        return tags && tags.length ? { label: tags[0], meta: { tags } } : null;
      },
    },
  ],
};

// ============================================================
// LAKE — water blending. Connectivity: neighbor is water OR a
// river pointing at us. The edgeClassifier produces per-edge
// shore classes (water / inlet / shore / shore_corner) and the
// tile class picks the variant label.
// ============================================================
export const lakeConfig = {
  priority: 15,
  maskInterpretation: 'symmetric',

  appliesTo: (cell) => WATER_TYPES.has(cell.tileType),

  connects: ({ neighbor, edge }) => {
    if (!neighbor) return false;
    if (WATER_TYPES.has(neighbor.tileType)) return true;
    return hasEdge(neighbor.riverEdges, oppositeEdge(edge)); // river inlet
  },

  // automatic shoreline detection + inner/edge/corner classes.
  // Data-driven: future biome blending swaps the predicates only.
  edgeClassifier: (ctx) => computeLakeEdgeClasses(
    ctx,
    (c, e) => {
      const n = c.neighbor(e);
      return !!n && WATER_TYPES.has(n.tileType);
    },
    (c, e) => {
      const n = c.neighbor(e);
      return !!n && hasEdge(n.riverEdges, oppositeEdge(e));
    },
  ),

  resolvers: [
    {
      priority: 50,
      resolve: (ctx) => {
        if (!ctx.edgeClasses) return null;
        const { tileClass, edges } = ctx.edgeClasses;
        switch (tileClass) {
          case 'inner_water': return 'inner_water';
          case 'open_water': return 'open_water';
          case 'pond': return ctx.cls.count ? 'shore' : 'pond';
          default: {
            const corners = edges.filter((c) => c === 'shore_corner').length;
            return corners > 0
              ? { label: 'corner_shore', meta: { corners } }
              : 'shore';
          }
        }
      },
    },
  ],
  fallbackLabel: 'shore',
};

// ============================================================
// STRUCTURES (village / castle) — one shared, parameterized
// config factory. Structures do not own connectors: entrances
// are generated wherever neighbor roads arrive.
//
// Directional, rule-based connection policy:
//   forceConnect:   the structure ALWAYS latches onto adjacent
//                   roads pointing at it (village default)
//   cell.acceptsRoads === false  lets an individual structure
//                   refuse road connections (optional accept)
// ============================================================
export function makeStructureConfig(tileTypes, {
  forceConnect = true,
  labels = null,
} = {}) {
  const typeSet = tileTypes instanceof Set ? tileTypes : new Set(tileTypes);
  return {
    priority: 5,
    maskInterpretation: 'symmetric',

    appliesTo: (cell) => typeSet.has(cell.tileType),

    // inbound-only connectivity: an edge is "connected" when the
    // NEIGHBOR's road points at this structure (and policy allows).
    connects: ({ cell, neighbor, edge }) => {
      if (!neighbor) return false;
      if (cell.acceptsRoads === false) return false;
      if (!forceConnect && !cell.wantsRoads) return false;
      return hasEdge(neighbor.roadEdges, oppositeEdge(edge));
    },

    shapeAliases: labels || {
      isolated: 'isolated',
      end: 'single_entrance',
      straight: 'through_entrances',
      curve_tight: 'twin_entrances',
      curve_wide: 'twin_entrances',
      junction_fan: 'multi_entrance',
      junction_t: 'multi_entrance',
      junction_t_mirror: 'multi_entrance',
      junction_y: 'multi_entrance',
      cross_fan: 'multi_entrance',
      cross_x: 'multi_entrance',
      cross_h: 'multi_entrance',
      star: 'hub_entrances',
      hub: 'hub_entrances',
    },
  };
}

export const villageConfig = makeStructureConfig(['village']);
export const castleConfig = makeStructureConfig(['castle'], {
  labels: {
    isolated: 'isolated',
    end: 'gate',
    straight: 'twin_gates',
    curve_tight: 'twin_gates',
    curve_wide: 'twin_gates',
    junction_fan: 'multi_gate',
    junction_t: 'multi_gate',
    junction_t_mirror: 'multi_gate',
    junction_y: 'multi_gate',
    cross_fan: 'multi_gate',
    cross_x: 'multi_gate',
    cross_h: 'multi_gate',
    star: 'fortress_gates',
    hub: 'fortress_gates',
  },
});

/**
 * Register the standard types on `engine`.
 * @param engine AutoMeshSystem
 * @param renderHooks optional {buildOverlay, disposeOverlay}
 *        (from MeshVariants.js in the browser; omit in Node tests)
 */
export function registerStandardTypes(engine, renderHooks = {}) {
  const hooks = {
    buildOverlay: renderHooks.buildOverlay || null,
    disposeOverlay: renderHooks.disposeOverlay || null,
  };
  engine.registerType('road', { ...roadConfig, ...hooks });
  engine.registerType('river', { ...riverConfig, ...hooks });
  engine.registerType('lake', { ...lakeConfig, ...hooks });
  engine.registerType('village', { ...villageConfig, ...hooks });
  engine.registerType('castle', { ...castleConfig, ...hooks });
  return engine;
}
