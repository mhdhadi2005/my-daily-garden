const { db } = require("../db");

function initGarden() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS v2_gardens (
      reader_id TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)
    );
    CREATE TABLE IF NOT EXISTS v2_credits (
      reader_id TEXT NOT NULL,
      credit_key TEXT NOT NULL,
      points INTEGER NOT NULL CHECK (points > 0),
      credited_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (reader_id, credit_key)
    );
    CREATE TABLE IF NOT EXISTS v2_trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reader_id TEXT NOT NULL,
      tree_number INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      earned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (reader_id, tree_number)
    );
  `);
}

function treeThreshold(number) {
  return 60 + (number - 1) * 250;
}

function readGarden(readerId) {
  const garden = db.prepare("SELECT points FROM v2_gardens WHERE reader_id = ?").get(readerId);
  if (!garden) return null;
  const trees = db.prepare(`
    SELECT id, tree_number AS number, threshold, earned_at AS earnedAt
    FROM v2_trees WHERE reader_id = ? ORDER BY tree_number
  `).all(readerId);
  const number = trees.length + 1;
  const threshold = treeThreshold(number);
  return {
    readerId,
    points: garden.points,
    trees,
    nextTree: { number, threshold, pointsNeeded: threshold - garden.points },
  };
}

function ensureGarden(readerId) {
  if (typeof readerId !== "string" || !readerId.trim() || readerId.length > 255) {
    throw new TypeError("invalid reader ID");
  }
  db.prepare("INSERT OR IGNORE INTO v2_gardens (reader_id) VALUES (?)").run(readerId);
  return readGarden(readerId);
}

function creditGarden(readerId, creditKey, points) {
  if (typeof readerId !== "string" || !readerId.trim() || readerId.length > 255 ||
      typeof creditKey !== "string" || !creditKey.trim() || creditKey.length > 255 ||
      !Number.isSafeInteger(points) || points <= 0) {
    throw new TypeError("invalid garden credit");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT OR IGNORE INTO v2_gardens (reader_id) VALUES (?)").run(readerId);
    const inserted = db.prepare("INSERT OR IGNORE INTO v2_credits (reader_id, credit_key, points) VALUES (?, ?, ?)")
      .run(readerId, creditKey, points).changes;
    if (inserted) {
      const prior = db.prepare("SELECT points FROM v2_gardens WHERE reader_id = ?").get(readerId).points;
      if (!Number.isSafeInteger(prior + points)) throw new RangeError("garden points exceed safe integer range");
      const total = prior + points;
      db.prepare("UPDATE v2_gardens SET points = ? WHERE reader_id = ?").run(total, readerId);
      const current = db.prepare("SELECT COUNT(*) AS count FROM v2_trees WHERE reader_id = ?").get(readerId).count;
      const addTree = db.prepare("INSERT INTO v2_trees (reader_id, tree_number, threshold) VALUES (?, ?, ?)");
      for (let number = current + 1; treeThreshold(number) <= total; number++) {
        addTree.run(readerId, number, treeThreshold(number));
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readGarden(readerId);
}

module.exports = { initGarden, readGarden, ensureGarden, creditGarden };
