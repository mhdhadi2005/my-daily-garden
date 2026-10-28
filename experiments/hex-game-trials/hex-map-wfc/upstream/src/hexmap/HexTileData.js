// Trial tile definitions replace medieval terrain; every Blender rim is land.
export const LEVELS_COUNT = 1
export const HexDir = ['NE', 'E', 'SE', 'SW', 'W', 'NW']
export const HexOpposite = { NE: 'SW', E: 'W', SE: 'NW', SW: 'NE', W: 'E', NW: 'SE' }
export const TILE_LIST = [
  { name: 'Seedling', mesh: 'Hex_00_seedling', weight: 2 },
  { name: 'Pink blossom', mesh: 'Hex_01_blossoming', weight: 3 },
  { name: 'Young almond', mesh: 'Hex_02_young', weight: 2 },
  { name: 'Pond', mesh: 'Hex_03_pond', weight: 1.6, preventChaining: true },
  { name: 'Fruiting almond', mesh: 'Hex_04_fruiting', weight: 3 },
  { name: 'Pale blossom', mesh: 'Hex_05_blossoming', weight: 3 },
  { name: 'Full almond', mesh: 'Hex_06_fruiting', weight: 3 },
].map(tile => ({ ...tile, edges: Object.fromEntries(HexDir.map(dir => [dir, 'grass'])) }))

// Retained upstream six-edge rotation.
export function rotateHexEdges(edges, rotation) {
  const rotated = {}
  for (let i = 0; i < 6; i++) rotated[HexDir[(i + rotation) % 6]] = edges[HexDir[i]]
  return rotated
}
