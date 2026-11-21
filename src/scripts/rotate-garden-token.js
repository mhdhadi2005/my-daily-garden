// Gives a reader (or everyone) a new personal garden link: the old /?t=…
// link stops working at once. Use it if a link has been forwarded or leaked.
// Afterwards run sync-garden-links.js so newsletters carry the new link.
//
//   node src/scripts/rotate-garden-token.js <subscriber-id>
//   node src/scripts/rotate-garden-token.js --all --yes
//   (live: railway ssh -- node src/scripts/rotate-garden-token.js ...)

const { db, initSchema, newGardenToken } = require("../db");

const [who, confirm] = process.argv.slice(2);
if (!who || (who === "--all" && confirm !== "--yes")) {
  console.error("Usage: node src/scripts/rotate-garden-token.js <subscriber-id> | --all --yes");
  process.exit(2);
}
initSchema();
const subs = who === "--all"
  ? db.prepare("SELECT id, beehiiv_subscriber_id FROM subscribers").all()
  : db.prepare("SELECT id, beehiiv_subscriber_id FROM subscribers WHERE beehiiv_subscriber_id = ?").all(who);
if (!subs.length) { console.error("No garden found."); process.exit(1); }
const give = db.prepare("UPDATE subscribers SET garden_token = ? WHERE id = ?");
for (const s of subs) give.run(newGardenToken(), s.id);
console.log(`New garden link for ${subs.length} reader(s). Old links no longer work. Run sync-garden-links.js to update beehiiv.`);
