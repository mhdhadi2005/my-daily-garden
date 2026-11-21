// Restore test: starts the app on a COPY of a database backup, in a temp
// folder, and opens one reader's garden the way a reader would (personal
// link → pass → garden). Nothing outside the temp folder is touched.
//
//   node src/scripts/restore-check.js <backup.db> <subscriber-id>
//
// Backups: see "Backups" in README.md.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const [backup, subscriberId] = process.argv.slice(2);
if (!backup || !subscriberId) {
  console.error("Usage: node src/scripts/restore-check.js <backup.db> <subscriber-id>");
  process.exit(2);
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mdg-restore-"));
const copy = path.join(TMP, "restored.db");
fs.copyFileSync(backup, copy);

const PORT = 3193, BASE = `http://127.0.0.1:${PORT}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(WP_|BEEHIIV_|WC_|ADMIN_API|DB_PATH|PORT$)/.test(k)));
const server = spawn(process.execPath, ["src/server.js"], { cwd: path.join(__dirname, "../.."), env: { ...env, PORT: String(PORT), DB_PATH: copy }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

(async () => {
  let ok = false;
  try {
    for (let i = 0; i < 75 && !/listening/.test(log); i++) await new Promise((r) => setTimeout(r, 200));
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(copy, { readOnly: true });
    const row = db.prepare("SELECT garden_token, points, total_harvests FROM subscribers WHERE beehiiv_subscriber_id = ?").get(subscriberId);
    const counts = db.prepare("SELECT (SELECT COUNT(*) FROM subscribers) AS readers, (SELECT COUNT(*) FROM harvests) AS trees").get();
    db.close();
    if (!row) throw new Error(`no reader ${subscriberId} in the backup`);
    const { pass } = await fetch(`${BASE}/api/garden/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: row.garden_token }) }).then((r) => r.json());
    const res = await fetch(`${BASE}/api/tree/me`, { headers: { "X-Garden-Pass": pass } });
    const garden = await res.json();
    ok = res.status === 200 && garden.points === row.points && (garden.forest || []).length === row.total_harvests;
    console.log(`Backup holds ${counts.readers} readers and ${counts.trees} grown trees.`);
    console.log(`Restored garden for ${subscriberId}: ${garden.points} points, stage ${garden.stage && garden.stage.name || garden.stageName || "?"}, streak ${garden.streak}, ${(garden.forest || []).length} trees in the forest.`);
  } catch (err) {
    console.error(err.message, "\n", log);
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(ok ? "RESTORE OK" : "RESTORE FAILED");
  process.exit(ok ? 0 : 1);
})();
