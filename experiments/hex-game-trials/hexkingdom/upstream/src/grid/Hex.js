// ============================================================
// Hex — axial coordinate math for pointy-top hexagons.
// World layout: X/Z plane (Y is up).
// ============================================================

export const HEX_SIZE = 1.0; // circumradius of a hex

const SQRT3 = Math.sqrt(3);

/**
 * Neighbor direction order (edge index 0..5).
 * Pointy-top axial directions, edge i faces neighbor DIRS[i].
 */
export const DIRS = [
  { q: 1, r: 0 },   // 0: East
  { q: 1, r: -1 },  // 1: North-East
  { q: 0, r: -1 },  // 2: North-West
  { q: -1, r: 0 },  // 3: West
  { q: -1, r: 1 },  // 4: South-West
  { q: 0, r: 1 },   // 5: South-East
];

/** opposite edge index */
export function oppositeEdge(i) {
  return (i + 3) % 6;
}

/** axial -> world position (x, z) */
export function axialToWorld(q, r, size = HEX_SIZE) {
  return {
    x: size * (SQRT3 * q + (SQRT3 / 2) * r),
    z: size * (3 / 2) * r,
  };
}

/** world (x, z) -> nearest axial cell */
export function worldToAxial(x, z, size = HEX_SIZE) {
  const q = ((SQRT3 / 3) * x - (1 / 3) * z) / size;
  const r = ((2 / 3) * z) / size;
  return axialRound(q, r);
}

/** fractional axial -> rounded axial using cube rounding */
export function axialRound(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  let s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** unique string key for a cell */
export function cellKey(q, r) {
  return q + ',' + r;
}

/** hex distance between two axial cells */
export function hexDistance(a, b) {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) / 2
  );
}

/** neighbors of a cell */
export function neighbors(q, r) {
  return DIRS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

/**
 * Angle (radians) of the CENTER of edge i for a pointy-top hex.
 * Edge 0 faces +X (east); edges proceed counter-clockwise.
 */
export function edgeAngle(i) {
  return (Math.PI / 3) * i;
}

/** midpoint of edge i relative to hex center, at given radius factor */
export function edgeMidpoint(i, size = HEX_SIZE) {
  const a = edgeAngle(i);
  const d = size * (SQRT3 / 2); // apothem
  return { x: Math.cos(a) * d, z: -Math.sin(a) * d };
}
