// ============================================================
// GeometryUtils — helpers for building merged, vertex-colored
// low-poly geometry (single draw call per asset via instancing).
// ============================================================
import * as THREE from 'three';

/** Apply a flat color to every vertex of a geometry. */
export function colorize(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const count = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Translate / rotate / scale a geometry in place (chainable). */
export function xform(g, { t, rx, ry, rz, s } = {}) {
  if (s !== undefined) {
    if (typeof s === 'number') g.scale(s, s, s);
    else g.scale(s[0], s[1], s[2]);
  }
  if (rx !== undefined) g.rotateX(rx);
  if (rz !== undefined) g.rotateZ(rz);
  if (ry !== undefined) g.rotateY(ry);
  if (t !== undefined) g.translate(t[0], t[1], t[2]);
  return g;
}

/**
 * Merge non-indexed geometries with position/normal/color attributes
 * into one BufferGeometry (no external addons needed).
 */
export function merge(geometries) {
  let total = 0;
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) total += g.attributes.position.count;

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let offset = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, offset * 3);
    nor.set(g.attributes.normal.array, offset * 3);
    if (g.attributes.color) {
      col.set(g.attributes.color.array, offset * 3);
    } else {
      col.fill(1, offset * 3, (offset + n) * 3);
    }
    offset += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** Shorthand: colorize + transform a primitive. */
export function part(geometry, color, opts = {}) {
  return xform(colorize(geometry, color), opts);
}
