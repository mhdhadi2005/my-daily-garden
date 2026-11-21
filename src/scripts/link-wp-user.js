// Links a verified pilot participant's garden to their 10almonds (WordPress)
// account, by hand. Refuses anything ambiguous or already linked elsewhere.
//
//   node src/scripts/link-wp-user.js <subscriber-id-or-email> <wp-user-id>
//   node src/scripts/link-wp-user.js <subscriber-id-or-email> --unlink
//
// On the live server:  railway ssh -- node src/scripts/link-wp-user.js ...
// (it uses the same database as the app, via DB_PATH).

const { db, initSchema } = require("../db");

const [who, target] = process.argv.slice(2);
if (!who || !target) {
  console.error("Usage: node src/scripts/link-wp-user.js <subscriber-id-or-email> <wp-user-id | --unlink>");
  process.exit(2);
}
initSchema();

const matches = who.includes("@")
  ? db.prepare("SELECT id, beehiiv_subscriber_id, email, wp_user_id FROM subscribers WHERE lower(email) = ?").all(who.trim().toLowerCase())
  : db.prepare("SELECT id, beehiiv_subscriber_id, email, wp_user_id FROM subscribers WHERE beehiiv_subscriber_id = ?").all(who.trim());
if (matches.length === 0) fail("No garden found for that subscriber.");
if (matches.length > 1) fail(`${matches.length} gardens share that email. Use the subscriber ID instead.`);
const sub = matches[0];

if (target === "--unlink") {
  db.prepare("UPDATE subscribers SET wp_user_id = NULL WHERE id = ?").run(sub.id);
  done(`Unlinked garden ${sub.beehiiv_subscriber_id} from WordPress user ${sub.wp_user_id ?? "(none)"}.`);
}

const wpUserId = Number(target);
if (!Number.isInteger(wpUserId) || wpUserId <= 0) fail("The WordPress user ID must be a positive whole number.");
if (sub.wp_user_id === wpUserId) done("Already linked. Nothing to do.");
if (sub.wp_user_id) fail(`This garden is already linked to WordPress user ${sub.wp_user_id}. Unlink it first if that's wrong.`);
const taken = db.prepare("SELECT beehiiv_subscriber_id FROM subscribers WHERE wp_user_id = ?").get(wpUserId);
if (taken) fail(`WordPress user ${wpUserId} is already linked to garden ${taken.beehiiv_subscriber_id}.`);
db.prepare("UPDATE subscribers SET wp_user_id = ? WHERE id = ? AND wp_user_id IS NULL").run(wpUserId, sub.id);
done(`Linked garden ${sub.beehiiv_subscriber_id} to WordPress user ${wpUserId}.`);

function fail(message) { console.error(`Not linked: ${message}`); process.exit(1); }
function done(message) { console.log(message); process.exit(0); }
