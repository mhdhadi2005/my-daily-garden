// ============================================================
// TypeRegistry — central, runtime-extensible registry of
// connectivity types for the Universal Connectivity Engine.
//
// Each type is DATA + RESOLVER FUNCTIONS, never hardcoded core
// logic. A type config declares:
//
//   appliesTo(cell)                     -> is this type active here?
//   connects(ctx)                       -> OUTBOUND intent across an edge
//   acceptsFrom(ctx)                    -> INBOUND acceptance (asymmetric!)
//   maskInterpretation                  -> 'symmetric' | 'directed'
//   shapeAliases                        -> canonical shape -> domain label
//   resolvers[]                         -> priority variant pipeline
//   layers[]                            -> extra overlay layers (multi-layer)
//   flow                                -> optional directed-flow config (rivers)
//   edgeClassifier(ctx)                 -> optional per-edge class (lakes)
//   affects[] / affectedBy[]            -> cross-type invalidation hints
//   buildOverlay / disposeOverlay       -> rendering hooks (injected)
//
// ASYMMETRIC CONNECTIONS
//   The engine asks BOTH sides: A connects out to B via
//   A.connects(), and B accepts A via B.acceptsFrom() (checked
//   through the neighbor's own type config when it shares the
//   same typeId) — but a type may also unilaterally connect to
//   *foreign* tiles (e.g. road -> village) by returning true
//   from connects() with no reciprocity required. This is what
//   "village → road yes, road → village optional" means in
//   practice: each side's own rules decide independently.
//
// RULE ENGINE INTEGRATION
//   resolvers[] entries may be plain functions, imperative
//   {priority, resolve} objects OR fully DECLARATIVE rules
//   ({priority, when, label, meta} — see VariantResolver).
//   The registry compiles every entry ONCE at registration via
//   compileResolverPipeline, so all behavior is data-driven and
//   zero per-tile compilation cost is paid at resolve time.
//
// PLUGIN CONTRACT
//   createType({ id|typeId, ...config }) -> frozen plugin object
//   registerType(plugin)  or  registerType(typeId, config)
//   setTypeRules(typeId, patch) -> hot-swap rules at runtime
// ============================================================
import { compileResolverPipeline } from './VariantResolver.js';

const REQUIRED_FNS = ['appliesTo', 'connects'];

/**
 * PLUGIN FACTORY — build a self-contained, reusable type plugin.
 * The returned object is frozen data: pass it straight to
 * AutoMeshSystem.registerType(plugin) (or TypeRegistry). This is
 * the official extension entry point:
 *
 *   const RailType = createType({
 *     id: 'rail',
 *     appliesTo: (c) => !!c.railEdges?.length,
 *     connects: ({cell, neighbor, edge}) => …,
 *     shapeAliases: { straight: 'track' },
 *     resolvers: [{ when: { count: 3 }, label: 'switch' }],
 *   });
 *   engine.registerType(RailType);   // zero core changes
 */
export function createType(config) {
  const typeId = config.typeId || config.id;
  if (!typeId || typeof typeId !== 'string') {
    throw new Error('createType: config needs a string typeId (or id)');
  }
  for (const fn of REQUIRED_FNS) {
    if (typeof config[fn] !== 'function') {
      throw new Error(`createType: type "${typeId}" needs ${fn}()`);
    }
  }
  return Object.freeze({ ...config, typeId });
}

/** Normalize + freeze a raw user config into an internal record. */
function normalizeConfig(typeId, config) {
  for (const fn of REQUIRED_FNS) {
    if (typeof config[fn] !== 'function') {
      throw new Error(`TypeRegistry: type "${typeId}" needs ${fn}()`);
    }
  }
  return {
    typeId,
    priority: config.priority ?? 0,
    maskInterpretation: config.maskInterpretation || 'symmetric',

    // -- connection rules --------------------------------------
    appliesTo: config.appliesTo,
    connects: config.connects,
    // acceptsFrom(ctx): does THIS tile accept an incoming
    // connection from ctx.from across ctx.edge? Default: mirror
    // of connects (fully symmetric behavior).
    acceptsFrom: config.acceptsFrom || null,

    // -- mask interpretation / variants ------------------------
    shapeAliases: config.shapeAliases || null,
    // rule engine: functions, imperative objects AND declarative
    // {when, label, meta} rules all compile to {priority, resolve}
    resolvers: compileResolverPipeline(config.resolvers),
    fallbackLabel: config.fallbackLabel || null,
    layers: config.layers || null, // [{name, resolve(ctx)}]

    // -- optional subsystems ------------------------------------
    flow: config.flow || null,               // directed graph config
    edgeClassifier: config.edgeClassifier || null, // per-edge classes

    // -- cross-type propagation hints ---------------------------
    // when a tile of THIS type changes, also re-evaluate these
    // other types on neighbors (e.g. placing a road affects the
    // 'village' type of adjacent villages).
    affects: config.affects || [],

    // -- rendering hooks (opaque to the engine) -----------------
    buildOverlay: config.buildOverlay || null,
    disposeOverlay: config.disposeOverlay || null,

    // -- free-form extension data --------------------------------
    data: config.data || {},
  };
}

export class TypeRegistry {
  constructor() {
    this._types = new Map();
    this._listeners = new Set();
  }

  /**
   * Register a connectivity type at runtime.
   * Accepts either (typeId, config) or a single plugin object
   * produced by createType() (with .typeId/.id inside).
   * @param {string|object} typeId  id — or the plugin object
   * @param {object=} config  see module docs
   */
  registerType(typeId, config) {
    if (typeof typeId === 'object' && typeId !== null) {
      config = typeId;
      typeId = config.typeId || config.id;
    }
    if (!typeId || typeof typeId !== 'string') {
      throw new Error('TypeRegistry: registerType needs a typeId');
    }
    if (this._types.has(typeId)) {
      throw new Error(`TypeRegistry: type "${typeId}" already registered`);
    }
    const rec = normalizeConfig(typeId, config);
    this._types.set(typeId, rec);
    this._emit('register', rec);
    return rec;
  }

  /**
   * Hot-swap rules of a REGISTERED type at runtime: merge `patch`
   * over the current config and re-normalize (resolvers are
   * recompiled). Emits an 'update' event so the engine can
   * refresh affected tiles. Returns the new record.
   */
  setTypeRules(typeId, patch) {
    const rec = this.require(typeId);
    const updated = normalizeConfig(typeId, { ...rec, ...patch });
    this._types.set(typeId, updated);
    this._emit('update', updated);
    return updated;
  }

  /** Remove a type at runtime. Returns the removed record or null. */
  unregisterType(typeId) {
    const rec = this._types.get(typeId) || null;
    if (rec) {
      this._types.delete(typeId);
      this._emit('unregister', rec);
    }
    return rec;
  }

  get(typeId) {
    return this._types.get(typeId) || null;
  }

  require(typeId) {
    const rec = this._types.get(typeId);
    if (!rec) throw new Error(`TypeRegistry: unknown type "${typeId}"`);
    return rec;
  }

  has(typeId) {
    return this._types.has(typeId);
  }

  /** all registered types, highest priority first (stable) */
  all() {
    return [...this._types.values()].sort((a, b) => b.priority - a.priority);
  }

  get size() {
    return this._types.size;
  }

  /** subscribe to register/unregister events; returns unsubscribe fn */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(event, rec) {
    for (const fn of this._listeners) fn(event, rec);
  }
}
