// ============================================================
// VariantResolver — the context-aware resolution pipeline that
// replaces "static mask -> mesh" lookup.
//
// PIPELINE (per tile, per type)
//   input:  ResolveContext {cell, mask, cls, type, engine,
//                           flow?, edgeClasses?, neighbors()}
//   stages:
//     1. resolvers[]   — priority-ordered, first non-null wins.
//                        each returns a label string OR a full
//                        {label, meta} object for richer output.
//     2. shapeAliases  — type's canonical-shape -> domain label
//     3. fallbackLabel — type-level fallback
//     4. raw shape     — engine-level fallback (always exists)
//   layers:
//     after the BASE label is fixed, each declared layer's
//     resolve(ctx, baseVariant) may contribute an overlay label
//     (e.g. 'bridge' on top of a road, 'ice' on top of a lake).
//
//   output: VariantInfo {
//     type, mask, canonical, shape, rotation, count,
//     connections, label, meta, layers: [{name, label, meta}]
//   }
// ============================================================
import { classifyMask, maskEdges } from './Bitmask.js';
import { DIRS } from '../grid/Hex.js';

/**
 * Rich context object handed to every resolver. Lazily exposes
 * neighbor access so cheap resolvers stay cheap.
 */
export class ResolveContext {
  constructor(engine, type, cell, mask) {
    this.engine = engine;
    this.grid = engine.grid;
    this.type = type;
    this.cell = cell;
    this.mask = mask;
    this.cls = classifyMask(mask);
    // filled by the engine when the type opts into subsystems:
    this.flow = null;        // FlowNode (rivers)
    this.edgeClasses = null; // per-edge classification (lakes)
  }

  /** neighbor cell across edge e (or null) */
  neighbor(e) {
    const d = DIRS[e];
    return this.grid.get(this.cell.q + d.q, this.cell.r + d.r);
  }

  /** is edge e connected in the mask? */
  connected(e) {
    return ((this.mask >> e) & 1) === 1;
  }

  /** edge indices set in the mask */
  connections() {
    return maskEdges(this.mask);
  }
}

// ============================================================
// DECLARATIVE RULE ENGINE — data-driven resolver rules.
//
// A resolver entry may be:
//   * a plain function (ctx) => label | {label, meta} | null
//   * {priority, resolve(ctx)}              (imperative object)
//   * {priority, when, label, meta}         (DECLARATIVE rule)
//
// Declarative `when` conditions are plain data (AND semantics):
//   shape:  'end' | ['end','straight']       canonical shape(s)
//   count:  1 | [2, 3]                       connection count(s)
//   mask:   0b001001                         exact mask
//   flowRole: 'mouth' | ['merge','split']    directed-flow role(s)
//   tileClass: 'inner_water' | [...]         edge-classifier tile class
//   cell:   {isCliff: true}                  cell property equals
//   neighborTileType: 'castle' | [...]       ANY neighbor matches
//   connectedNeighborTileType: 'village'     ANY CONNECTED neighbor
//   all: [cond, …] / any: [cond, …] / not: cond   combinators
//   when may also be a predicate function (ctx) => boolean.
//
// `label` and `meta` may be values or (ctx) => value functions.
// Rules are compiled ONCE at registration — zero hardcoded
// behavior lives inside the engine.
// ============================================================

const toSet = (v) => new Set(Array.isArray(v) ? v : [v]);

/** Compile a declarative condition (or predicate) into (ctx) => boolean. */
export function compileCondition(when) {
  if (when == null) return null;
  if (typeof when === 'function') return when;
  const tests = [];
  if (when.shape != null) {
    const s = toSet(when.shape);
    tests.push((ctx) => s.has(ctx.cls.shape));
  }
  if (when.count != null) {
    const s = toSet(when.count);
    tests.push((ctx) => s.has(ctx.cls.count));
  }
  if (when.mask != null) tests.push((ctx) => ctx.mask === when.mask);
  if (when.flowRole != null) {
    const s = toSet(when.flowRole);
    tests.push((ctx) => !!ctx.flow && s.has(ctx.flow.role));
  }
  if (when.tileClass != null) {
    const s = toSet(when.tileClass);
    tests.push((ctx) => !!ctx.edgeClasses && s.has(ctx.edgeClasses.tileClass));
  }
  if (when.cell != null) {
    const entries = Object.entries(when.cell);
    tests.push((ctx) => entries.every(([k, v]) => ctx.cell[k] === v));
  }
  if (when.neighborTileType != null) {
    const s = toSet(when.neighborTileType);
    tests.push((ctx) => {
      for (let e = 0; e < 6; e++) {
        const n = ctx.neighbor(e);
        if (n && s.has(n.tileType)) return true;
      }
      return false;
    });
  }
  if (when.connectedNeighborTileType != null) {
    const s = toSet(when.connectedNeighborTileType);
    tests.push((ctx) => {
      for (const e of ctx.connections()) {
        const n = ctx.neighbor(e);
        if (n && s.has(n.tileType)) return true;
      }
      return false;
    });
  }
  if (when.all != null) {
    const subs = when.all.map(compileCondition);
    tests.push((ctx) => subs.every((t) => t(ctx)));
  }
  if (when.any != null) {
    const subs = when.any.map(compileCondition);
    tests.push((ctx) => subs.some((t) => t(ctx)));
  }
  if (when.not != null) {
    const sub = compileCondition(when.not);
    tests.push((ctx) => !sub(ctx));
  }
  return (ctx) => tests.every((t) => t(ctx));
}

/**
 * Compile ANY resolver entry (function, imperative object or
 * declarative rule) into the canonical {priority, resolve} form.
 */
export function compileResolverRule(rule) {
  if (typeof rule === 'function') {
    return { priority: 0, resolve: rule };
  }
  if (typeof rule.resolve === 'function') {
    return { priority: rule.priority ?? 0, resolve: rule.resolve };
  }
  // declarative {when?, label, meta?, priority?}
  if (rule.label === undefined) {
    throw new Error('VariantResolver: declarative rule needs label (or resolve())');
  }
  const test = compileCondition(rule.when ?? null);
  return {
    priority: rule.priority ?? 0,
    resolve: (ctx) => {
      if (test && !test(ctx)) return null;
      const label = typeof rule.label === 'function' ? rule.label(ctx) : rule.label;
      if (label == null) return null;
      const meta = typeof rule.meta === 'function' ? rule.meta(ctx) : (rule.meta ?? null);
      return meta != null ? { label, meta } : label;
    },
  };
}

/**
 * Compile + stable-sort a resolver list: priority DESC, ties keep
 * declaration order (deterministic across runs).
 */
export function compileResolverPipeline(resolvers) {
  return (resolvers || [])
    .map((r, i) => [compileResolverRule(r), i])
    .sort((a, b) => (b[0].priority - a[0].priority) || (a[1] - b[1]))
    .map(([r]) => r);
}

/**
 * Run the full pipeline for one type on one tile.
 * @returns VariantInfo
 */
export function resolveVariant(engine, type, cell, mask, extras = {}) {
  const ctx = new ResolveContext(engine, type, cell, mask);
  if (extras.flow !== undefined) ctx.flow = extras.flow;
  if (extras.edgeClasses !== undefined) ctx.edgeClasses = extras.edgeClasses;

  // ---- stage 1: priority resolvers (compiled rule pipeline) ----
  let label = null;
  let meta = null;
  for (const resolver of type.resolvers) {
    // registry pre-compiles to {priority, resolve}; raw entries
    // (tests mutating type.resolvers directly) still work.
    const fn = typeof resolver === 'function' ? resolver : resolver.resolve;
    const out = fn ? fn(ctx) : compileResolverRule(resolver).resolve(ctx);
    if (out == null) continue;
    if (typeof out === 'string') { label = out; }
    else { label = out.label; meta = out.meta ?? null; }
    break;
  }

  // ---- stage 2: shape aliases ----
  if (label == null && type.shapeAliases) {
    label = type.shapeAliases[ctx.cls.shape] ?? null;
  }

  // ---- stage 3 + 4: fallbacks ----
  if (label == null) label = type.fallbackLabel ?? ctx.cls.shape;

  const base = {
    type: type.typeId,
    mask,
    canonical: ctx.cls.canonical,
    shape: ctx.cls.shape,
    rotation: ctx.cls.rotation,
    count: ctx.cls.count,
    connections: maskEdges(mask),
    label,
    meta,
    flow: ctx.flow,
    edgeClasses: ctx.edgeClasses,
    layers: [],
  };

  // ---- multi-layer resolution (base + overlays) ----
  if (type.layers) {
    for (const layer of type.layers) {
      const out = layer.resolve(ctx, base);
      if (out == null) continue;
      if (typeof out === 'string') {
        base.layers.push({ name: layer.name, label: out, meta: null });
      } else {
        base.layers.push({ name: layer.name, label: out.label, meta: out.meta ?? null });
      }
    }
  }

  return base;
}

/**
 * Signature helper for change detection: two variants with the
 * same signature need no overlay rebuild.
 */
export function variantSignature(v) {
  let s = `${v.mask}|${v.label}`;
  if (v.flow) s += `|f:${v.flow.inMask},${v.flow.outMask},${v.flow.role}`;
  if (v.edgeClasses) {
    s += `|e:${v.edgeClasses.waterMask},${v.edgeClasses.inletMask},${v.edgeClasses.tileClass}`;
  }
  for (const l of v.layers) s += `|L:${l.name}=${l.label}`;
  return s;
}
