import { CUBE_DIRS, cubeKey, cubeCoordsInRadius, cubeDistance } from './upstream/src/hexmap/HexWFCCore.js';
export const ALL_CELLS = cubeCoordsInRadius(0, 0, 0, 2);
export const keyOf = tile => cubeKey(tile.q, tile.r, tile.s);
export const positionOf = ({ q, r }) => ({ x: 2.25 * q, z: -1.5 * Math.sqrt(3) * (r + q / 2) });
export function frontier(tiles) {
  const keys = new Set(tiles.map(keyOf));
  return ALL_CELLS.filter(cell => !keys.has(keyOf(cell)) && CUBE_DIRS.some(dir =>
    keys.has(cubeKey(cell.q + dir.dq, cell.r + dir.dr, cell.s + dir.ds))
  )).sort((a, b) => cubeDistance(a.q, a.r, a.s, 0, 0, 0) - cubeDistance(b.q, b.r, b.s, 0, 0, 0));
}
export function localPatch(tiles, center) {
  return tiles.filter(tile => cubeDistance(tile.q, tile.r, tile.s, center.q, center.r, center.s) <= 1);
}
export function validateGarden(tiles) {
  const byKey = new Map(tiles.map(tile => [keyOf(tile), tile]));
  if (byKey.size !== tiles.length || tiles.length > 19) throw new Error('Invalid garden size.');
  for (const tile of tiles) {
    if (tile.q + tile.r + tile.s !== 0 || cubeDistance(tile.q, tile.r, tile.s, 0, 0, 0) > 2 ||
        !Number.isInteger(tile.type) || tile.type < 0 || tile.type > 6 || tile.level !== 0 ||
        !Number.isInteger(tile.rotation) || tile.rotation < 0 || tile.rotation > 5) throw new Error('Invalid generated tile.');
    if (tile.type === 3 && CUBE_DIRS.some(dir => byKey.get(cubeKey(
      tile.q + dir.dq, tile.r + dir.dr, tile.s + dir.ds
    ))?.type === 3)) throw new Error('The generator placed neighbouring ponds.');
  }
  return tiles;
}
