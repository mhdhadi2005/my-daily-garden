// ============================================================
// MeshVariants — three.js overlay builders for AutoMeshSystem
// variants. This is the ONLY rendering-aware part of the
// automesh stack: AutoMeshSystem.js and AutoMeshAdapters.js are
// pure logic and stay headless-testable.
//
// Builders are looked up in an open registry:
//   key "type:label"  (most specific, e.g. "river:waterfall")
//   key "type"        (fallback, e.g. "river")
// so future variants (waterfalls, railway crossings…) are added
// with registerOverlayBuilder() — no hardcoded switch anywhere.
//
// All frequently used geometries are cached and flagged
// `userData.shared`, matching the TileFactory dispose contract:
// shared geometry survives tile removal, unique geometry does
// not. Overlay groups attach to `cell.group` (local tile space),
// which keeps them compatible with the pooled/instanced world
// (InstancePool remains untouched — a future adapter may return
// pool indices from buildOverlay instead of a THREE.Group).
// ============================================================
import * as THREE from 'three';
import { MATS } from '../rendering/Materials.js';
import { edgeAngle, HEX_SIZE } from '../grid/Hex.js';
import { TILE_H } from '../tiles/TileMeshBuilder.js';

const APOTHEM = HEX_SIZE * Math.sqrt(3) / 2;
const TOP_Y = TILE_H;

// ---------------- shared geometry cache ----------------
const _geoCache = new Map();

function cachedGeo(key, make) {
  let g = _geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    _geoCache.set(key, g);
  }
  return g;
}

/** strip from tile center toward edge e midpoint (lenFactor of full apothem) */
function strip(e, width, y, material, lenFactor = 1) {
  const len = (APOTHEM + 0.06) * lenFactor;
  const geo = cachedGeo(`strip:${width}:${lenFactor}`, () => {
    const g = new THREE.BoxGeometry(len, 0.03, width);
    g.translate(len / 2, 0, 0);
    return g;
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.rotation.y = edgeAngle(e);
  return mesh;
}

/** flat disc (plaza / pond / cap) */
function disc(radius, y, material, segments = 8, height = 0.03) {
  const geo = cachedGeo(`disc:${radius}:${segments}:${height}`,
    () => new THREE.CylinderGeometry(radius, radius, height, segments));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  return mesh;
}

/** point at distance d along edge e direction (matches strip orientation) */
function alongEdge(e, d) {
  const a = edgeAngle(e);
  return { x: Math.cos(a) * d, z: -Math.sin(a) * d };
}

// ============================================================
// Registry
// ============================================================
export const OVERLAY_BUILDERS = new Map();

/** Register/override a builder. key: "type" or "type:label". */
export function registerOverlayBuilder(key, fn) {
  OVERLAY_BUILDERS.set(key, fn);
}

/**
 * Build the overlay group for a resolved variant and attach it
 * to the cell's tile group. Returns the handle (THREE.Group).
 * Used as the `buildOverlay` callback of AutoMeshSystem types.
 */
export function buildOverlay(cell, variant) {
  const fn = OVERLAY_BUILDERS.get(`${variant.type}:${variant.label}`)
    || OVERLAY_BUILDERS.get(variant.type);
  if (!fn || !cell.group) return null;
  const g = fn(cell, variant);
  if (!g) return null;
  g.name = `automesh:${variant.type}`;
  cell.group.add(g);
  return g;
}

/** Dispose callback for AutoMeshSystem types. */
export function disposeOverlay(handle) {
  if (!handle) return;
  if (handle.parent) handle.parent.remove(handle);
  handle.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}

// ============================================================
// ROAD — isolated / dead_end / straight / corner / t_junction /
//        crossroads. Connected edges run flush to the tile
//        border; unconnected road stubs stop short with a
//        rounded dead-end cap.
// ============================================================
function roadBuilder(cell, variant) {
  const g = new THREE.Group();
  const own = cell.roadEdges || [];
  if (!own.length) return null;

  for (const e of own) {
    const connected = (variant.mask >> e) & 1;
    if (connected) {
      g.add(strip(e, 0.3, TOP_Y + 0.02, MATS.road));
    } else {
      g.add(strip(e, 0.3, TOP_Y + 0.02, MATS.road, 0.6));
      const cap = disc(0.16, TOP_Y + 0.02, MATS.road, 8, 0.028);
      const p = alongEdge(e, (APOTHEM + 0.06) * 0.6);
      cap.position.x = p.x;
      cap.position.z = p.z;
      g.add(cap);
    }
  }

  // center piece scales with junction complexity; a clean straight
  // needs no plaza (seamless through-road).
  let plazaR = 0;
  switch (variant.label) {
    case 'crossroads': plazaR = 0.28; break;
    case 't_junction': plazaR = 0.24; break;
    case 'corner': plazaR = 0.2; break;
    case 'straight': plazaR = 0; break;
    default: plazaR = 0.18; break; // dead_end / isolated / preview
  }
  if (plazaR > 0) g.add(disc(plazaR, TOP_Y + 0.02, MATS.road, 8, 0.028));
  return g;
}

// ============================================================
// RIVER — flow-aware builder. Uses the directed flow graph
// (variant.flow: inMask/outMask/role) when available:
//   * outflow edges into lakes get a widened delta fan
//   * merge/split confluences widen the central pool
//   * unconnected ends render springs or drying deltas
// ============================================================
function riverBuilder(cell, variant) {
  const g = new THREE.Group();
  const own = cell.riverEdges || [];
  if (!own.length) return null;
  const flow = variant.flow || null;

  for (const e of own) {
    const connected = (variant.mask >> e) & 1;
    const lenF = connected ? 1 : 0.66;
    // outflow into a lake gets a slightly wider water strip (mouth)
    const isSinkEdge = !!flow && ((flow.sinkMask >> e) & 1);
    g.add(strip(e, 0.36, TOP_Y + 0.005, MATS.dirt, lenF));   // bed
    g.add(strip(e, isSinkEdge ? 0.34 : 0.28, TOP_Y + 0.028, MATS.water, lenF));  // water

    if (!connected) {
      const p = alongEdge(e, (APOTHEM + 0.06) * 0.66);
      if (variant.label === 'source') {
        // mountain spring: stone ring + welling pool
        const ring = disc(0.2, TOP_Y + 0.012, MATS.rockDark || MATS.dirt, 7, 0.05);
        ring.position.set(p.x, TOP_Y + 0.012, p.z);
        g.add(ring);
        const pool = disc(0.13, TOP_Y + 0.042, MATS.water, 7, 0.03);
        pool.position.set(p.x, TOP_Y + 0.042, p.z);
        g.add(pool);
      } else {
        // river ending: fanned-out delta soaking into the land
        const sand = disc(0.24, TOP_Y + 0.008, MATS.sand, 8, 0.02);
        sand.position.set(p.x, TOP_Y + 0.008, p.z);
        g.add(sand);
        const pool = disc(0.17, TOP_Y + 0.026, MATS.water, 8, 0.026);
        pool.position.set(p.x, TOP_Y + 0.026, p.z);
        g.add(pool);
      }
    }
  }

  // central pond joins the strips; confluences (merge/split) widen it
  const isConfluence = variant.label === 'merge' || variant.label === 'split';
  if (own.length >= 2 || variant.count >= 2) {
    const r = (variant.count >= 3 || isConfluence) ? 0.3 : 0.24;
    g.add(disc(r, TOP_Y + 0.028, MATS.water, 8, 0.03));
    if (variant.count >= 3 || isConfluence) {
      g.add(disc(r + 0.06, TOP_Y + 0.006, MATS.dirt, 8, 0.02));
    }
  }
  return g;
}

// ============================================================
// LAKE — edge-class-aware water blending. Reads the smoothing
// report (variant.edgeClasses) to pick per-edge treatment:
//   water        — full-width tongue to the border (open blend)
//   inlet        — narrower tongue where a river flows in
//   shore_corner — beach bends around the corner (extra sand)
//   shore        — plain beach ring segment
// Tile classes inner_water / open_water drop the shore ring.
// ============================================================
function lakeBuilder(cell, variant) {
  const g = new THREE.Group();
  const ec = variant.edgeClasses || null;
  const tileClass = ec?.tileClass
    || (variant.label === 'open_water' ? 'open_water' : 'shore_tile');
  const open = tileClass === 'open_water' || tileClass === 'inner_water';

  // sandy/dirt shore ring (skipped for fully inner water)
  if (tileClass !== 'inner_water') {
    const shoreGeo = cachedGeo(`lakeShore:${open ? 1 : 0}`, () =>
      new THREE.CylinderGeometry(open ? 0.8 : 0.72, open ? 0.86 : 0.78, 0.02, 8));
    const shore = new THREE.Mesh(shoreGeo, MATS.dirt);
    shore.position.y = TOP_Y + 0.004;
    g.add(shore);
  }

  // main water body
  const bodyR = tileClass === 'inner_water' ? 0.9 : (open ? 0.82 : 0.64);
  g.add(disc(bodyR, TOP_Y + 0.026, MATS.water, 8, 0.03));

  // per-edge blending
  for (let e = 0; e < 6; e++) {
    const cls = ec ? ec.edges[e]
      : (((variant.mask >> e) & 1) ? 'water' : 'shore');
    switch (cls) {
      case 'water': // full open blend into the neighboring water tile
        g.add(strip(e, 0.58, TOP_Y + 0.004, MATS.dirt, 1));
        g.add(strip(e, 0.5, TOP_Y + 0.026, MATS.water, 1));
        break;
      case 'inlet': { // river mouth: narrower tongue + sandy fan
        g.add(strip(e, 0.4, TOP_Y + 0.004, MATS.dirt, 1));
        g.add(strip(e, 0.3, TOP_Y + 0.026, MATS.water, 1));
        const p = alongEdge(e, APOTHEM * 0.7);
        const fan = disc(0.18, TOP_Y + 0.008, MATS.sand || MATS.dirt, 8, 0.02);
        fan.position.x = p.x;
        fan.position.z = p.z;
        g.add(fan);
        break;
      }
      case 'shore_corner': { // concave corner: beach bulge smooths the bend
        const p = alongEdge(e, APOTHEM * 0.78);
        const bulge = disc(0.22, TOP_Y + 0.006, MATS.sand || MATS.dirt, 8, 0.018);
        bulge.position.x = p.x;
        bulge.position.z = p.z;
        g.add(bulge);
        break;
      }
      default: break; // plain shore: ring already covers it
    }
  }
  return g;
}

// ============================================================
// VILLAGE / CASTLE — entrance paths that automatically connect
// to adjacent roads. Castles reuse the same builder (their
// labels differ, the geometry is shared).
// ============================================================
function villageBuilder(cell, variant) {
  if (!variant.connections.length) return null; // isolated village: no paths
  const g = new THREE.Group();
  for (const e of variant.connections) {
    // dirt approach path meeting the neighbor road
    g.add(strip(e, 0.24, TOP_Y + 0.018, MATS.dirt));
    // entrance markers (two posts flanking the path at the border)
    const a = edgeAngle(e);
    const d = APOTHEM * 0.82;
    const px = Math.cos(a) * d, pz = -Math.sin(a) * d;
    const ox = Math.sin(a) * 0.2, oz = Math.cos(a) * 0.2;
    const postGeo = cachedGeo('villagePost', () => new THREE.BoxGeometry(0.06, 0.22, 0.06));
    for (const s of [1, -1]) {
      const post = new THREE.Mesh(postGeo, MATS.road);
      post.position.set(px + ox * s, TOP_Y + 0.11, pz + oz * s);
      g.add(post);
    }
  }
  // village plaza where paths converge
  g.add(disc(0.2, TOP_Y + 0.018, MATS.dirt, 8, 0.026));
  return g;
}

// default builders (label-specific overrides go through
// registerOverlayBuilder, e.g. 'river:waterfall' in the future)
registerOverlayBuilder('road', roadBuilder);
registerOverlayBuilder('river', riverBuilder);
registerOverlayBuilder('lake', lakeBuilder);
registerOverlayBuilder('village', villageBuilder);
registerOverlayBuilder('castle', villageBuilder);

// ============================================================
// Ghost preview — a tile in hand has no neighbors yet, so the
// ghost renders its own connectors as if fully connected.
// ============================================================
function bitsOf(edges) {
  let m = 0;
  for (const e of edges) m |= (1 << e);
  return m;
}

function previewVariant(type, edges, label) {
  const mask = bitsOf(edges);
  return {
    type, mask, canonical: mask, shape: 'preview', rotation: 0,
    count: edges.length, connections: [...edges], label,
    flow: null, edgeClasses: null, layers: [],
  };
}

/** Standalone connector visuals for the ghost/preview tile. */
export function buildConnectorPreview(cell) {
  const g = new THREE.Group();
  g.name = 'automesh:preview';
  if (cell.riverEdges?.length) {
    const r = riverBuilder(cell, previewVariant('river', cell.riverEdges, 'straight'));
    if (r) g.add(r);
  }
  if (cell.roadEdges?.length) {
    const r = roadBuilder(cell, previewVariant('road', cell.roadEdges, 'straight'));
    if (r) g.add(r);
  }
  if (cell.tileType === 'lake') {
    const l = lakeBuilder(cell, previewVariant('lake', [], 'pond'));
    if (l) g.add(l);
  }
  return g.children.length ? g : null;
}
