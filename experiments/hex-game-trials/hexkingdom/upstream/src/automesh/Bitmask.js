// ============================================================
// Bitmask — 6-direction hex mask math + rotation-invariant
// shape classification (the "low level" of the connectivity
// engine). PURE LOGIC, zero dependencies beyond Hex constants.
//
// BIT ORDER
//   Bit i corresponds to Hex.DIRS[i] (the engine's canonical
//   edge order). Semantic names for the 6 bits are exported as
//   DIRECTION_NAMES so masks can be written/read as strings:
//   "000001" = only direction 0 connected, "111111" = all six.
// ============================================================

export const DIRECTION_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

/** bit value for a named direction, e.g. bitFor('NE') === 0b000010 */
export function bitFor(name) {
  const i = DIRECTION_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Bitmask: unknown direction "${name}"`);
  return 1 << i;
}

/** parse "010101"-style mask string (leftmost char = bit 5, rightmost = bit 0) */
export function maskFromString(s) {
  return parseInt(s, 2) & 0b111111;
}

/** mask -> "010101" string */
export function maskToString(mask) {
  return (mask & 0b111111).toString(2).padStart(6, '0');
}

/** rotate a 6-bit mask counter-clockwise by `steps` edge positions */
export function rotateMask(mask, steps) {
  const s = ((steps % 6) + 6) % 6;
  return ((mask << s) | (mask >> (6 - s))) & 0b111111;
}

/** number of set bits in a 6-bit mask */
export function popcount(mask) {
  let n = 0;
  for (let i = 0; i < 6; i++) if (mask & (1 << i)) n++;
  return n;
}

/** array of set edge indices, ascending */
export function maskEdges(mask) {
  const out = [];
  for (let i = 0; i < 6; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

/** build a mask from an array of edge indices */
export function edgesToMask(edges) {
  let m = 0;
  if (edges) for (const e of edges) m |= (1 << e);
  return m & 0b111111;
}

// ---------------------------------------------------------------
// Canonical shapes — the 14 rotation-equivalence classes of a
// 6-bit neighbor mask (binary necklaces of length 6):
//
//  count 0: isolated           (000000)
//  count 1: end                (000001)  dead end / source / ending
//  count 2: straight           (001001)  opposite edges, 180°
//           curve_tight        (000011)  adjacent edges, 60° turn
//           curve_wide         (000101)  one-gap edges, 120° turn
//  count 3: junction_fan       (000111)  three consecutive
//           junction_t         (001011)  T-junction
//           junction_t_mirror  (001101)  mirrored T-junction
//           junction_y         (010101)  symmetric Y (every other)
//  count 4: cross_fan          (001111)
//           cross_x            (010111)
//           cross_h            (011011)  two straights crossing
//  count 5: star               (011111)
//  count 6: hub                (111111)  full crossroads
// ---------------------------------------------------------------
const SHAPE_REPS = {
  isolated: 0b000000,
  end: 0b000001,
  straight: 0b001001,
  curve_tight: 0b000011,
  curve_wide: 0b000101,
  junction_fan: 0b000111,
  junction_t: 0b001011,
  junction_t_mirror: 0b001101,
  junction_y: 0b010101,
  cross_fan: 0b001111,
  cross_x: 0b010111,
  cross_h: 0b011011,
  star: 0b011111,
  hub: 0b111111,
};

export const SHAPES = Object.keys(SHAPE_REPS);

/** canonical (minimal-value) rotation of a mask */
export function canonicalMaskOf(mask) {
  let min = mask;
  for (let r = 1; r < 6; r++) {
    const m = rotateMask(mask, r);
    if (m < min) min = m;
  }
  return min;
}

// Precomputed LUT: mask (0..63) -> {shape, rotation, canonical, count}
// rotation r satisfies: rotateMask(canonical, r) === mask
export const MASK_LUT = (() => {
  const canonicalToShape = new Map();
  for (const [shape, rep] of Object.entries(SHAPE_REPS)) {
    canonicalToShape.set(canonicalMaskOf(rep), shape);
  }
  const lut = new Array(64);
  for (let mask = 0; mask < 64; mask++) {
    const canonical = canonicalMaskOf(mask);
    const shape = canonicalToShape.get(canonical);
    if (!shape) throw new Error(`Bitmask LUT: unclassified mask ${maskToString(mask)}`);
    let rotation = 0;
    for (let r = 0; r < 6; r++) {
      if (rotateMask(canonical, r) === mask) { rotation = r; break; }
    }
    lut[mask] = Object.freeze({ mask, canonical, shape, rotation, count: popcount(mask) });
  }
  return lut;
})();

/** classify any 6-bit mask into {shape, rotation, canonical, count} */
export function classifyMask(mask) {
  return MASK_LUT[mask & 0b111111];
}
