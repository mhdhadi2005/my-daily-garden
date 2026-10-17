const express = require('express');

const PALETTES = ['cream', 'rose', 'apricot'];
// shortcut: these existing art IDs are provisional; confirm the two launch residents before the pilot.
const RESIDENTS = ['fox', 'hedgehog'];
const FRONT_TREES = [
  [-3.2, -.65], [-1.5, 1.8], [1.6, 1.75], [3.25, -.8],
  [.95, -2.15], [-1.65, -2.25], [-3.4, 2.1], [3.7, -2.4],
];
const FRONT_DECORATIONS = { 2: [-4.2, -2], 5: [0, -.2] };

function distantSpot(index) {
  return [-6 + index % 9 * 1.5, -4.3 - Math.floor(index / 9) * 1.5];
}

function earnedDecorations(treeCount) {
  const decorations = [];
  for (let number = 2; number <= treeCount; number++) {
    if (number === 2 || number === 5 || (number > 6 && number % 3 === 0)) {
      decorations.push({
        id: `decoration-${number}`,
        unlockedAtTree: number,
        // shortcut: later decoration types are placeholders until the choice catalogue is drawn.
        type: number === 2 ? 'wildflowers' : number === 5 ? 'bird_bath' : 'decoration',
      });
    }
  }
  return decorations;
}

function defaultPositions(trees, decorations) {
  const defaults = new Map();
  const decorationsByTree = new Map(decorations.map((item) => [item.unlockedAtTree, item]));
  let distant = 0;
  for (const tree of trees) {
    defaults.set(`tree:${tree.id}`, FRONT_TREES[tree.number - 1] ?? distantSpot(distant++));
    const decoration = decorationsByTree.get(tree.number);
    if (decoration) defaults.set(`decoration:${decoration.id}`,
      FRONT_DECORATIONS[tree.number] ?? distantSpot(distant++));
  }
  return { defaults, distantSlots: Array.from({ length: Math.ceil((distant + 2) / 9) * 9 }, (_, index) => distantSpot(index)) };
}

function validPosition(position, scenic, distantSlots) {
  if (!Array.isArray(position) || position.length !== 2 ||
      !position.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
  const [x, z] = position;
  if (!scenic) return distantSlots.some(([spotX, spotZ]) => x === spotX && z === spotZ);
  return Math.abs(x) <= 4.5 && Math.abs(z) <= 3 &&
    x * x / 30.5 + z * z / 16.7 < .86 &&
    (x - 3.15) ** 2 / 2.56 + (z - 2.35) ** 2 / 1.21 >= 1;
}

function openSpots(positions) {
  const spots = [];
  for (const z of [0, -1.4, 1.4, -2.8, 2.8]) {
    for (const x of [-4.2, 0, 4.2, -2.8, 2.8, -1.4, 1.4]) {
      const point = [x, z];
      if (validPosition(point, true, []) && positions.every((other) =>
        Math.hypot(x - other[0], z - other[1]) >= 1.49)) spots.push(point);
      if (spots.length === 12) return spots;
    }
  }
  return spots;
}

function createDesign({ db }) {
  if (!db) throw new Error('design database is required');
  db.exec(`CREATE TABLE IF NOT EXISTS v2_design (
    reader_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 0,
    palette TEXT,
    resident TEXT,
    placements TEXT NOT NULL DEFAULT '[]'
  )`);

  const router = express.Router();

  function read(readerId, replacementPlacements) {
    const trees = db.prepare(`SELECT id, tree_number AS number FROM v2_trees
      WHERE reader_id = ? ORDER BY tree_number`).all(readerId);
    const decorations = earnedDecorations(trees.length);
    const saved = db.prepare('SELECT revision, palette, resident, placements FROM v2_design WHERE reader_id = ?').get(readerId);
    const foundingAward = !!db.prepare("SELECT 1 FROM v2_credits WHERE reader_id = ? AND credit_key = 'historical:launch'").get(readerId);
    const { defaults, distantSlots } = defaultPositions(trees, decorations);
    const positions = new Map(defaults);
    for (const { kind, id, position } of replacementPlacements ?? (saved ? JSON.parse(saved.placements) : [])) {
      positions.set(`${kind}:${id}`, position);
    }
    const allPositions = [...positions.values()];
    return {
      revision: saved?.revision ?? 0,
      palette: saved?.palette ?? (trees.length ? 'cream' : null),
      resident: saved?.resident ?? null,
      availablePalettes: trees.length ? PALETTES : [],
      availableResidents: trees.length >= 3 ? RESIDENTS : [],
      foundingAward,
      requiredChoices: [
        ...(trees.length >= 1 && !foundingAward && !saved?.palette ? ['palette'] : []),
        ...(trees.length >= 3 && !saved?.resident ? ['resident'] : []),
      ],
      areas: [
        ...(trees.length >= 1 ? ['meadow'] : []),
        ...(trees.length >= 4 ? ['pond'] : []),
        ...(trees.length >= 6 ? ['woodland'] : []),
      ],
      distantSlots: trees.length > 8 ? distantSlots : [],
      openSpots: trees.length ? openSpots(allPositions) : [],
      trees: trees.map((tree) => ({ ...tree, position: positions.get(`tree:${tree.id}`) ?? null })),
      decorations: decorations.map((decoration) => ({
        ...decoration, position: positions.get(`decoration:${decoration.id}`) ?? null,
      })),
    };
  }

  router.get('/', (req, res) => {
    if (!req.v2ReaderId) return res.status(401).json({ error: 'private_garden' });
    res.json(read(req.v2ReaderId));
  });

  router.put('/', (req, res) => {
    if (!req.v2ReaderId) return res.status(401).json({ error: 'private_garden' });
    const { revision, palette, resident, placements } = req.body ?? {};
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
        !Object.keys(req.body).every((key) => ['revision', 'palette', 'resident', 'placements'].includes(key)) ||
        !Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(placements)) {
      return res.status(400).json({ error: 'invalid_design' });
    }
    let updated;
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = read(req.v2ReaderId);
      if (revision !== current.revision) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'design_changed', current });
      }
      if ((current.trees.length ? !PALETTES.includes(palette) : palette !== null) ||
          (resident !== null && (current.trees.length < 3 || !RESIDENTS.includes(resident)))) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: 'locked_choice' });
      }
      const ownedTrees = new Set(current.trees.map(({ id }) => id));
      const ownedDecorations = new Set(current.decorations.map(({ id }) => id));
      const treeNumber = new Map(current.trees.map(({ id, number }) => [id, number]));
      const decorationNumber = new Map(current.decorations.map(({ id, unlockedAtTree }) => [id, unlockedAtTree]));
      const seen = new Set();
      for (const item of placements) {
        const key = `${item?.kind}:${item?.id}`;
        const scenic = item?.kind === 'tree' ? treeNumber.get(item?.id) <= 8 : decorationNumber.get(item?.id) <= 5;
        if (!item || typeof item !== 'object' || Array.isArray(item) ||
            !Object.keys(item).every((field) => ['kind', 'id', 'position'].includes(field)) ||
            !(item.kind === 'tree' && Number.isSafeInteger(item.id) && ownedTrees.has(item.id) ||
              item.kind === 'decoration' && typeof item.id === 'string' && ownedDecorations.has(item.id)) ||
            !validPosition(item.position, scenic, current.distantSlots) || seen.has(key)) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: 'invalid_placement' });
        }
        seen.add(key);
      }
      const arranged = read(req.v2ReaderId, placements);
      const allPositions = [...arranged.trees, ...arranged.decorations].map(({ position }) => position);
      if (allPositions.some((point, index) => allPositions.slice(index + 1).some((other) =>
        Math.hypot(point[0] - other[0], point[1] - other[1]) < 1.49))) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: 'occupied_spot' });
      }
      db.prepare(`INSERT INTO v2_design (reader_id, revision, palette, resident, placements)
        VALUES (?, 1, ?, ?, ?)
        ON CONFLICT(reader_id) DO UPDATE SET revision = v2_design.revision + 1,
          palette = excluded.palette, resident = excluded.resident, placements = excluded.placements`)
        .run(req.v2ReaderId, palette, resident, JSON.stringify(placements));
      updated = read(req.v2ReaderId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json(updated);
  });

  return router;
}

module.exports = { createDesign };
