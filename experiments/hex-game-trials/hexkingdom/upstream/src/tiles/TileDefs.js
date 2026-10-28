// ============================================================
// TileDefs — tile type catalogue: edge signatures, weights,
// evolution parameters. Edge arrays are BASE (rotation 0);
// index i corresponds to Hex.DIRS[i].
//
// Biomes: forest, field, river, mountain, village (core) +
// lake, meadow, swamp, hills, quarry, ruins (expansion).
// New biomes reuse the core edge vocabulary so they interlock
// with the existing tiles (lake→river banks, hills→mountain
// foothills, meadow→field grass, quarry→mountain+road…).
// ============================================================

export const EDGE = {
    FOREST: 'forest',
    FIELD: 'field',
    ROAD: 'road',
    RIVER: 'river',
    MOUNTAIN: 'mountain',
    VILLAGE: 'village',
  };
  
  export const TILE_TYPES = {
    forest: {
      name: 'Forest',
      weight: 20,
      variants: [
        { edges: ['forest', 'forest', 'forest', 'forest', 'forest', 'forest'] },
        { edges: ['forest', 'forest', 'field', 'forest', 'forest', 'field'] },
        { edges: ['forest', 'field', 'forest', 'forest', 'field', 'forest'] },
      ],
      previewColor: '#4e7f3a',
    },
    field: {
      name: 'Field',
      weight: 20,
      variants: [
        { edges: ['field', 'field', 'field', 'field', 'field', 'field'] },
        { edges: ['field', 'field', 'field', 'field', 'field', 'field'] },
        { edges: ['field', 'field', 'village', 'field', 'field', 'field'] },
      ],
      previewColor: '#d9b256',
    },
    river: {
      name: 'River',
      weight: 14,
      variants: [
        { edges: ['river', 'field', 'field', 'river', 'field', 'field'], river: [0, 3] },
        { edges: ['river', 'field', 'river', 'field', 'field', 'field'], river: [0, 2] },
        { edges: ['river', 'field', 'field', 'river', 'field', 'field'], river: [0, 3] },
      ],
      previewColor: '#4e8fc4',
    },
    mountain: {
      name: 'Mountain',
      weight: 11,
      variants: [
        { edges: ['mountain', 'mountain', 'field', 'mountain', 'mountain', 'field'] },
        { edges: ['mountain', 'mountain', 'mountain', 'mountain', 'mountain', 'mountain'] },
        { edges: ['mountain', 'forest', 'forest', 'mountain', 'forest', 'forest'] },
      ],
      previewColor: '#8d8d94',
    },
    village: {
      name: 'Village',
      weight: 17,
      variants: [
        { edges: ['village', 'field', 'village', 'village', 'field', 'village'] },
        { edges: ['village', 'village', 'village', 'village', 'village', 'village'] },
        { edges: ['village', 'field', 'field', 'village', 'field', 'field'] },
      ],
      previewColor: '#b0523a',
    },
  
    // ================= expansion biomes =================
  
    lake: {
      name: 'Lake',
      weight: 5,
      variants: [
        // shore all around; connects to rivers on two edges
        { edges: ['river', 'field', 'field', 'river', 'field', 'field'], river: [0, 3], lake: true },
        { edges: ['field', 'field', 'field', 'field', 'field', 'field'], lake: true },
      ],
      previewColor: '#3a72a4',
    },
    meadow: {
      name: 'Meadow',
      weight: 6,
      variants: [
        { edges: ['field', 'field', 'field', 'field', 'field', 'field'] },
        { edges: ['field', 'forest', 'field', 'field', 'forest', 'field'] },
      ],
      previewColor: '#a4c46a',
    },
    swamp: {
      name: 'Swamp',
      weight: 4,
      variants: [
        { edges: ['river', 'forest', 'field', 'river', 'forest', 'field'], river: [0, 3] },
        { edges: ['forest', 'field', 'forest', 'forest', 'field', 'forest'] },
      ],
      previewColor: '#5a7052',
    },
    hills: {
      name: 'Hills',
      weight: 6,
      variants: [
        { edges: ['mountain', 'field', 'field', 'mountain', 'field', 'field'] },
        { edges: ['field', 'field', 'field', 'field', 'field', 'field'] },
      ],
      previewColor: '#9aa06a',
    },
    quarry: {
      name: 'Quarry',
      weight: 4,
      variants: [
        { edges: ['mountain', 'field', 'field', 'mountain', 'field', 'field'] },
        { edges: ['mountain', 'mountain', 'field', 'mountain', 'mountain', 'field'] },
      ],
      previewColor: '#7d7468',
    },
    ruins: {
      name: 'Ruins',
      weight: 3,
      variants: [
        { edges: ['field', 'forest', 'field', 'field', 'forest', 'field'] },
        { edges: ['forest', 'forest', 'field', 'forest', 'forest', 'field'] },
      ],
      previewColor: '#8a8070',
    },
  };
  
  /** rotate a base edge array by `rot` steps (counter-clockwise edge shift) */
  export function rotateEdges(edges, rot) {
    const out = new Array(6);
    for (let i = 0; i < 6; i++) out[i] = edges[(i - rot + 6) % 6];
    return out;
  }
  
  /** rotate connector list (river/road edge indices) */
  export function rotateConnectors(list, rot) {
    if (!list) return null;
    return list.map((i) => (i + rot) % 6);
  }
  
  /** weighted random tile draw */
  export function randomTile(rng) {
    const entries = Object.entries(TILE_TYPES);
    let total = 0;
    for (const [, t] of entries) total += t.weight;
    let roll = rng.next() * total;
    for (const [type, t] of entries) {
      roll -= t.weight;
      if (roll <= 0) {
        const vi = rng.int(0, t.variants.length - 1);
        return { type, variant: vi };
      }
    }
    return { type: 'forest', variant: 0 };
  }
  