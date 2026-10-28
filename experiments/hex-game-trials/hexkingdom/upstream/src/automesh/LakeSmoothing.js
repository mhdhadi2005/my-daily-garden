// ============================================================
// LakeSmoothing — water-blending edge classification.
//
// For every water tile we classify EACH of the 6 edges into:
//
//   'water'        — neighbor is water              (open blend)
//   'inlet'        — neighbor river flows into us   (river mouth blend)
//   'shore'        — plain land edge                (beach ring)
//   'shore_corner' — land edge flanked by water on BOTH sides
//                    (concave corner shore; needs corner piece)
//   'peninsula'    — water edge flanked by land on BOTH sides:
//                    a narrow tongue of water squeezing past a
//                    land spit (convex land corner / peninsula
//                    tip on the neighboring tiles)
//
// plus a whole-tile class:
//
//   'inner_water'  — all 6 edges water (fully surrounded)
//   'open_water'   — 5 edges water
//   'channel'      — exactly 2 OPPOSITE water edges (strait)
//   'shore_tile'   — mixed water/land
//   'pond'         — 0 water edges (isolated pool)
//
// Corner detection is what makes shorelines look smooth: a land
// edge whose BOTH neighbors (edge-1, edge+1) are water bends the
// beach around it instead of drawing two hard shore segments;
// the peninsula class is the convex mirror image of that rule.
//
// REUSABLE BY DESIGN — nothing here knows about "lakes": the
// classifier works on ANY inside/outside predicate pair. Use
// makeShorelineClassifier() to build an edgeClassifier for any
// region type (ocean, swamp, ice, lava, biome patches…) — the
// exact same corner/peninsula/channel machinery applies.
// ============================================================
import { popcount } from './Bitmask.js';

const OPPOSITE_PAIRS = [0b001001, 0b010010, 0b100100]; // e/e+3 pairs

/**
 * Classify the 6 edges of a water tile.
 * @param {number} waterMask  bit i set when edge i faces water
 * @param {number} inletMask  bit i set when a river flows in across edge i
 * @returns {string[]} 6 per-edge classes
 */
export function classifyLakeEdges(waterMask, inletMask = 0) {
  const classes = new Array(6);
  for (let e = 0; e < 6; e++) {
    const bit = 1 << e;
    const prev = (e + 5) % 6, next = (e + 1) % 6;
    const prevWater = (waterMask >> prev) & 1;
    const nextWater = (waterMask >> next) & 1;
    if (waterMask & bit) {
      // water edge pinched between two land edges: peninsula channel
      classes[e] = (!prevWater && !nextWater && popcount(waterMask) < 5)
        ? 'peninsula' : 'water';
      continue;
    }
    if (inletMask & bit) { classes[e] = 'inlet'; continue; }
    classes[e] = (prevWater && nextWater) ? 'shore_corner' : 'shore';
  }
  return classes;
}

/**
 * Whole-tile classification for variant labeling.
 * @returns 'inner_water' | 'open_water' | 'channel' | 'shore_tile' | 'pond'
 */
export function classifyLakeTile(waterMask) {
  const n = popcount(waterMask);
  if (n === 6) return 'inner_water';
  if (n === 5) return 'open_water';
  if (n === 2 && OPPOSITE_PAIRS.includes(waterMask & 0b111111)) return 'channel';
  if (n >= 1) return 'shore_tile';
  return 'pond';
}

/**
 * Build a full lake-edge report for a resolve context.
 * The type config provides the water/inlet predicates so this
 * stays data-driven (biome blending ready).
 *
 * @param ctx ResolveContext
 * @param {(ctx, e:number) => boolean} isWaterEdge
 * @param {(ctx, e:number) => boolean=} isInletEdge
 */
export function computeLakeEdgeClasses(ctx, isWaterEdge, isInletEdge = null) {
  let waterMask = 0, inletMask = 0;
  for (let e = 0; e < 6; e++) {
    if (isWaterEdge(ctx, e)) waterMask |= (1 << e);
    else if (isInletEdge && isInletEdge(ctx, e)) inletMask |= (1 << e);
  }
  return {
    waterMask,
    inletMask,
    landMask: (~waterMask & ~inletMask) & 0b111111,
    edges: classifyLakeEdges(waterMask, inletMask),
    tileClass: classifyLakeTile(waterMask),
  };
}

/**
 * Build a reusable edgeClassifier for ANY region-blending type.
 * This is the biome-transition entry point: shorelines, swamp
 * fringes, snow lines and lava crusts all share this machinery.
 *
 * @param {(ctx, e:number) => boolean} isInsideEdge  edge faces the
 *        same region ('water' for lakes, 'swamp' for swamps, …)
 * @param {(ctx, e:number) => boolean=} isInletEdge  optional
 *        directional feeder (river mouths, lava vents, …)
 * @returns {(ctx) => EdgeClassReport} plug straight into a type
 *          config's `edgeClassifier` slot.
 *
 * Example — a swamp biome fringe with zero new engine code:
 *   engine.registerType('swamp', {
 *     appliesTo: (c) => c.tileType === 'swamp',
 *     connects: ({neighbor}) => neighbor?.tileType === 'swamp',
 *     edgeClassifier: makeShorelineClassifier(
 *       (ctx, e) => ctx.neighbor(e)?.tileType === 'swamp'),
 *   });
 */
export function makeShorelineClassifier(isInsideEdge, isInletEdge = null) {
  return (ctx) => computeLakeEdgeClasses(ctx, isInsideEdge, isInletEdge);
}
