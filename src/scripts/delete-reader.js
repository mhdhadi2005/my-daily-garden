// Deletes everything the garden holds about one reader (a deletion request):
// their garden, forest, history and purchase records. Backups taken before
// this still contain them until those backups are deleted too.
//
//   node src/scripts/delete-reader.js <subscriber-id-or-email> --yes
//   (live: railway ssh -- node src/scripts/delete-reader.js ...)

const { db, initSchema } = require("../db");

const [who, confirm] = process.argv.slice(2);
if (!who || confirm !== "--yes") {
  console.error("Usage: node src/scripts/delete-reader.js <subscriber-id-or-email> --yes");
  process.exit(2);
}
initSchema();
const subs = who.includes("@")
  ? db.prepare("SELECT id, beehiiv_subscriber_id FROM subscribers WHERE lower(email) = ?").all(who.trim().toLowerCase())
  : db.prepare("SELECT id, beehiiv_subscriber_id FROM subscribers WHERE beehiiv_subscriber_id = ?").all(who.trim());
if (!subs.length) { console.log("No garden found. Nothing deleted."); process.exit(0); }

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
const linked = tables.filter((t) => t !== "subscribers" && db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === "subscriber_id"));
db.exec("BEGIN");
try {
  for (const sub of subs) {
    for (const t of linked) db.prepare(`DELETE FROM ${t} WHERE subscriber_id = ?`).run(sub.id);
    db.prepare("DELETE FROM subscribers WHERE id = ?").run(sub.id);
    console.log(`Deleted garden ${sub.beehiiv_subscriber_id} and its records in: ${linked.join(", ")}.`);
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("Nothing deleted:", err.message);
  process.exit(1);
}
