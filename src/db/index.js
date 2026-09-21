const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

// Local dev uses SQLite so this runs with zero setup — using Node's built-in
// node:sqlite module specifically (rather than better-sqlite3) so there's no
// native compilation step, which needs Visual Studio's C++ tools on Windows
// and Xcode command line tools on Mac. Requires Node 22.5+.
// For production, swap this file for a `pg` Pool — every query below uses
// plain SQL with no SQLite-specific syntax, so the rest of the codebase
// doesn't need to change.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/garden.db");

// On Railway (and most container hosts) the filesystem is ephemeral unless
// DB_PATH points into an attached persistent Volume — otherwise every
// redeploy/restart silently wipes all subscriber points/streaks/harvests.
if (process.env.NODE_ENV === "production" && !process.env.DB_PATH) {
  console.warn(
    "WARNING: DB_PATH is not set in production — SQLite data will be lost on the next " +
    "deploy/restart unless a persistent Volume is mounted and DB_PATH points into it."
  );
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const sqliteDb = new DatabaseSync(DB_PATH);
sqliteDb.exec("PRAGMA journal_mode = WAL");

// Thin wrapper so the rest of the codebase (written against better-sqlite3's
// API) doesn't need to change: .prepare(sql).get/.all/.run() all work the
// same way as before.
const db = {
  prepare: (sql) => sqliteDb.prepare(sql),
  exec: (sql) => sqliteDb.exec(sql),
};

// Columns added to existing tables after the first release. CREATE TABLE IF
// NOT EXISTS won't add them to a database that already exists, so they need an
// explicit ALTER that's safe to run on every boot.
const ADDED_COLUMNS = [
  ["subscribers", "referrals_credited", "INTEGER NOT NULL DEFAULT 0"],
];

function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);

  for (const [table, column, definition] of ADDED_COLUMNS) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (_) { /* already present */ }
  }
}

module.exports = { db, initSchema };
