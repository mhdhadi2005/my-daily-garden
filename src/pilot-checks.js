// Pilot acceptance checks for the 10almonds risk assessment (20 Nov 2026).
// Starts two throwaway copies of the server on temporary databases (one with
// every secret set, one with none) and checks the required outcomes:
//
//   1. private garden access needs a valid pass; raw IDs, unsigned, modified,
//      forged and expired passes are refused; one reader can't reach another
//   2. missing secrets refuse requests instead of letting them through
//   3. accounts are linked by hand, safely; email never picks a garden
//   4. purchase points: once per order, linked participants only, no free orders,
//      one currency
//   5. what the plugin sends (read from the plugin source)
//   +  the small fixes, and the independent audit's findings (webhook replies,
//      repeat opens/quizzes, replayed requests, ID validation, headers, errors)
//
//   node src/pilot-checks.js            (nothing outside the temp folder is touched)

const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mdg-pilot-"));
const SECRETS = {
  WP_APP_SHARED_SECRET: crypto.randomBytes(24).toString("hex"),
  BEEHIIV_WEBHOOK_SECRET: crypto.randomBytes(24).toString("hex"),
  GARDEN_PASS_SECRET: crypto.randomBytes(24).toString("hex"),
  PURCHASE_CURRENCY: "AUD",
};
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(WP_|BEEHIIV_|WC_|ADMIN_API|PURCHASE_|GARDEN_|DB_PATH|PORT$|NODE_ENV$|PUBLIC_APP_URL)/.test(k)));
const ALICE = "sub_00000000-0000-4000-8000-00000000a11c", BOB = "sub_00000000-0000-4000-8000-000000000b0b", ALICE2 = "sub_00000000-0000-4000-8000-0000000a11c2";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
const section = (title) => console.log(`\n── ${title}`);

function start(port, extraEnv, dbName) {
  const env = { ...CLEAN_ENV, PORT: String(port), DB_PATH: path.join(TMP, dbName), NODE_ENV: "production", ...extraEnv };
  // Run from the temp folder, so the server can't pick up the real .env.
  const proc = spawn(process.execPath, [path.join(REPO, "src/server.js")], { cwd: TMP, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  const ready = (async () => {
    for (let i = 0; i < 75 && !/listening/.test(log); i++) await new Promise((r) => setTimeout(r, 200));
    if (!/listening/.test(log)) throw new Error(`server on ${port} didn't start:\n${log}`);
  })();
  return { proc, ready, base: `http://127.0.0.1:${port}`, env };
}

const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})), headers: res.headers });
// Signed exactly like the plugin's mdg_post(): the body plus a fresh
// request_id (wp_generate_uuid4), signed with "<timestamp>:<json>".
// exact = send this body as it is (to replay a request); ts = fix the second.
const signed = (base, p, body, secret, exact = false, ts = String(Math.floor(Date.now() / 1000))) => {
  const raw = JSON.stringify(exact ? body : { ...body, request_id: crypto.randomUUID() });
  const headers = { "Content-Type": "application/json" };
  if (secret) Object.assign(headers, { "X-WP-Signature": crypto.createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex"), "X-WP-Timestamp": ts });
  return fetch(base + p, { method: "POST", headers, body: raw }).then(json);
};
const garden = (base, p, pass, options = {}) =>
  fetch(`${base}/api/tree/${p}`, { ...options, headers: { "Content-Type": "application/json", ...(pass ? { "X-Garden-Pass": pass } : {}), ...(options.headers || {}) } }).then(json);

(async () => {
  const A = start(3191, SECRETS, "secured.db");
  const N = start(3192, {}, "no-secrets.db");
  try {
    await Promise.all([A.ready, N.ready]);
    const hook = (kind, body, base = A.base, secret = SECRETS.BEEHIIV_WEBHOOK_SECRET) => fetch(`${base}/webhooks/beehiiv/${kind}`, { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "X-MDG-Secret": secret } : {}) }, body: JSON.stringify(body) }).then(json);
    const seed = async (id, email) => (await hook("click", { subscriber_id: id, email, link_url: "https://10almonds.com/x", link_id: "x" })).status;
    check("set up: two readers, Alice and Bob (through the newsletter click webhook)", (await seed(ALICE, "alice@example.com")) === 200 && (await seed(BOB, "bob@example.com")) === 200);

    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(TMP, "secured.db"), { readOnly: true });
    const tokenOf = (id) => db.prepare("SELECT garden_token FROM subscribers WHERE beehiiv_subscriber_id = ?").get(id).garden_token;

    section("1. Private garden access");
    const exchange = (token) => fetch(`${A.base}/api/garden/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(json);
    const alicePass = (await exchange(tokenOf(ALICE))).body.pass;
    const bobPass = (await exchange(tokenOf(BOB))).body.pass;
    check("each reader's personal newsletter link gives them a pass", /^p1\./.test(alicePass || "") && /^p1\./.test(bobPass || ""));
    check("a wrong or made-up newsletter link gives nothing", (await exchange("x".repeat(32))).status === 404 && (await exchange("")).status === 404);
    const aliceOwn = await garden(A.base, "me", alicePass);
    const bobOwn = await garden(A.base, "me", bobPass);
    check("Alice's pass opens Alice's garden, Bob's opens Bob's", aliceOwn.status === 200 && bobOwn.status === 200 && aliceOwn.body.points !== undefined);
    const viaBobsId = await garden(A.base, BOB, alicePass);
    check("putting Bob's ID in the address with Alice's pass still only shows Alice's garden", viaBobsId.status === 200 && JSON.stringify(viaBobsId.body) === JSON.stringify(aliceOwn.body));
    const rawId = await garden(A.base, BOB);
    check("a raw subscriber ID alone is refused", rawId.status === 401, `status ${rawId.status}`);
    for (const [action, p, method, body] of [["visit record", `${BOB}/viewed`, "POST"], ["tree move", `${BOB}/forest/move`, "POST", { harvestNumber: 1, q: 1, r: 0 }], ["water change", `${BOB}/forest/water`, "POST", { q: 1, r: -1, add: true }], ["harvest", `${BOB}/harvest`, "POST"]]) {
      const r = await garden(A.base, p, null, { method, body: body ? JSON.stringify(body) : undefined });
      check(`a raw ID can't make a ${action}`, r.status === 401, `status ${r.status}`);
    }
    const modified = alicePass.slice(0, -2) + (alicePass.endsWith("AA") ? "BB" : "AA");
    check("a modified pass is refused", (await garden(A.base, "me", modified)).status === 401);
    const forged = "p1." + Buffer.from(JSON.stringify({ s: BOB, e: 9999999999 })).toString("base64url") + ".forged";
    check("a made-up pass naming Bob is refused", (await garden(A.base, "me", forged)).status === 401);
    process.env.GARDEN_PASS_SECRET = SECRETS.GARDEN_PASS_SECRET; // same secret, to make a pass that has run out
    const { createPass } = require("./engine/pass");
    const expired = createPass(ALICE, Date.now() - 13 * 3600 * 1000).pass;
    const expiredRes = await garden(A.base, "me", expired);
    check("an expired pass is refused (12-hour life)", expiredRes.status === 401 && expiredRes.body.error === "pass_expired");
    check("the garden reply carries no IDs, emails or tokens", !/sub_0000|alice@|garden_token/.test(JSON.stringify(aliceOwn.body)));
    check("passes have their own key, not the WordPress shared secret", !/WP_APP_SHARED_SECRET/.test(fs.readFileSync(path.join(REPO, "src/engine/pass.js"), "utf8")));

    section("2. Missing secrets refuse requests");
    for (const [label, req] of [
      ["WordPress connection check", () => signed(N.base, "/api/wp/ping", {}, "anything")],
      ["WordPress garden pass", () => signed(N.base, "/api/wp/session", { wp_user_id: 1 }, "anything")],
      ["WordPress purchase", () => signed(N.base, "/api/wp/purchase", { wp_user_id: 1, order_id: "wc_1", total: 10 }, "anything")],
      ["unsigned WordPress request", () => signed(N.base, "/api/wp/ping", {})],
      ["beehiiv click webhook", () => hook("click", { subscriber_id: ALICE, email: "x@example.com" }, N.base, "anything")],
      ["beehiiv open webhook", () => hook("open", { subscriber_id: ALICE }, N.base, "anything")],
    ]) {
      const r = await req();
      check(`with no secrets set: ${label} is refused`, r.status === 401, `status ${r.status}`);
    }
    check("with secrets set: an unsigned WordPress request is refused", (await signed(A.base, "/api/wp/ping", {})).status === 401);
    check("with secrets set: a wrongly signed one is refused", (await signed(A.base, "/api/wp/ping", {}, "wrong")).status === 401);
    check("with secrets set: a correctly signed one works", (await signed(A.base, "/api/wp/ping", {}, SECRETS.WP_APP_SHARED_SECRET)).body.ok === true);
    check("a webhook without the beehiiv secret is refused", (await hook("click", { subscriber_id: ALICE }, A.base, null)).status === 401);
    const gone1 = (await fetch(`${A.base}/webhooks/purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status;
    const gone2 = (await fetch(`${A.base}/api/seed-subscriber`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status;
    check("the old store purchase webhook and admin seed route are gone", gone1 === 404 && gone2 === 404, `${gone1}, ${gone2}`);

    section("3. Account linking");
    const S = SECRETS.WP_APP_SHARED_SECRET;
    check("an account isn't matched to a garden by email (Alice's email, unlinked account)", (await signed(A.base, "/api/wp/session", { wp_user_id: 7, email: "alice@example.com" }, S)).body.linked === false);
    const link = (...args) => { try { return { ok: true, out: execFileSync(process.execPath, ["src/scripts/link-wp-user.js", ...args], { cwd: REPO, env: { ...CLEAN_ENV, DB_PATH: path.join(TMP, "secured.db") }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message) }; } };
    check("linking a verified participant by hand works", link(ALICE, "7").ok);
    check("Alice's account now opens her garden", (await signed(A.base, "/api/wp/session", { wp_user_id: 7 }, S)).body.linked === true);
    const taken = link(BOB, "7");
    check("a second garden can't be linked to the same account", !taken.ok && /already linked/.test(taken.out), taken.out.trim());
    const relink = link(ALICE, "8");
    check("a linked garden can't be moved to another account without unlinking", !relink.ok && /already linked/.test(relink.out), relink.out.trim());
    await seed(ALICE2, "ALICE@example.com");
    const ambiguous = link("alice@example.com", "9");
    check("an email shared by two gardens is refused as ambiguous", !ambiguous.ok && /share that email/.test(ambiguous.out), ambiguous.out.trim());
    check("an account that isn't linked gets no garden", (await signed(A.base, "/api/wp/session", { wp_user_id: 9 }, S)).body.linked === false);

    section("4. Purchase points");
    const buy = (body) => signed(A.base, "/api/wp/purchase", body, S);
    const first = await buy({ wp_user_id: 7, order_id: "wc_501", total: 12.5, currency: "AUD" });
    check("a linked participant's order adds points (100 per $1)", first.body.credited === true && first.body.pointsAwarded === 1250, JSON.stringify(first.body));
    const again = await buy({ wp_user_id: 7, order_id: "wc_501", total: 12.5, currency: "AUD" });
    check("retrying the same order never counts twice", again.body.credited === false && again.body.reason === "already credited");
    const bobLinked = link(BOB, "8").ok;
    check("the same order sent for another linked garden doesn't count again", bobLinked && (await buy({ wp_user_id: 8, order_id: "wc_501", total: 12.5, currency: "AUD" })).body.credited === false);
    check("an unlinked customer's order earns nothing", (await buy({ wp_user_id: 9, order_id: "wc_502", total: 20, currency: "AUD" })).body.credited === false);
    check("a guest order (no account) earns nothing", (await buy({ wp_user_id: 0, order_id: "wc_503", total: 20, currency: "AUD" })).body.credited === false);
    check("a free order earns nothing", (await buy({ wp_user_id: 7, order_id: "wc_504", total: 0, currency: "AUD" })).body.reason === "free order");
    check("an order in another currency earns nothing", (await buy({ wp_user_id: 7, order_id: "wc_505", total: 20, currency: "USD" })).body.reason === "other currency");
    check("an email in the purchase message is ignored, not used to find a garden", (await buy({ wp_user_id: 0, email: "alice@example.com", order_id: "wc_506", total: 20, currency: "AUD" })).body.credited === false);

    section("5. What the plugin sends (from its source)");
    const php = fs.readFileSync(path.join(REPO, "wordpress-plugin/my-daily-garden/my-daily-garden.php"), "utf8");
    const call = (route) => (php.match(new RegExp(`mdg_post\\('${route.replace(/\//g, "\\/")}',\\s*array\\(([\\s\\S]*?)\\)\\);`)) || [])[1] || "";
    const keys = (block) => [...block.matchAll(/'([a-z_]+)'\s*=>/g)].map((m) => m[1]);
    const sessionKeys = keys(call("/api/wp/session")), purchaseKeys = keys(call("/api/wp/purchase"));
    check("opening the garden sends only the WordPress user ID", JSON.stringify(sessionKeys) === JSON.stringify(["wp_user_id"]), sessionKeys.join(", "));
    check("a purchase sends user ID, order number, total and currency only (no email)", JSON.stringify(purchaseKeys) === JSON.stringify(["wp_user_id", "order_id", "total", "currency"]), purchaseKeys.join(", "));
    check("purchase points are off unless switched on", /'purchases'\s*=>\s*!empty\(\$saved\['purchases'\]\)/.test(php));
    check("orders are queued as background jobs, not sent during order completion", /woocommerce_order_status_completed', 'mdg_queue_purchase'/.test(php) && /as_schedule_single_action|wp_schedule_single_event/.test(php) && !/function mdg_queue_purchase[\s\S]*?mdg_post\(/.test(php.split("function mdg_schedule_send")[0]));
    check("guests and unlinked customers are never queued", /if \(!\$customer \|\| !get_user_meta\(\$customer, '_mdg_linked', true\)\)/.test(php));
    check("retries are limited", /MDG_MAX_RETRIES', 5\)/.test(php));
    check("deactivating removes all queued jobs (cancelled by hook, whatever their arguments)", /as_unschedule_all_actions\('mdg_send_purchase'\);/.test(php) && /wp_unschedule_hook\('mdg_send_purchase'\)/.test(php));
    const uninstall = fs.readFileSync(path.join(REPO, "wordpress-plugin/my-daily-garden/uninstall.php"), "utf8");
    check("deleting the plugin removes its settings, secret and account marks", /WP_UNINSTALL_PLUGIN/.test(uninstall) && /delete_option\('mdg_settings'\)/.test(uninstall) && /_mdg_linked/.test(uninstall));
    check("the garden address must be https and uses WordPress's safe request helper", /wp_safe_remote_post/.test(php) && /esc_url_raw\(.*array\('https'\)\)/.test(php) && /strpos\(\$s\['app_url'\], 'https:\/\/'\) !== 0/.test(php));
    check("the pass goes after # (never sent to a server) into a sandboxed, no-referrer frame", /'\/#pass='/.test(php) && /sandbox', 'allow-scripts allow-same-origin'/.test(php) && /referrerpolicy', 'no-referrer'/.test(php));

    section("Small fixes");
    const demo = await fetch(`${A.base}/api/demo/tree?harvests=1000000`).then(json);
    check("the public demo caps the forest size", demo.status === 200 && demo.body.forest.length <= 12, `${demo.body.forest.length} trees`);
    const page = await fetch(`${A.base}/`);
    check("pages send no referrer and may only be framed by 10almonds.com", page.headers.get("referrer-policy") === "no-referrer" && /frame-ancestors 'self' https:\/\/10almonds\.com/.test(page.headers.get("content-security-policy") || ""));
    check("no database files are tracked in git", !execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n").some((f) => /\.db(-wal|-shm)?$/.test(f)));

    section("Independent audit findings");
    const reply = await hook("click", { subscriber_id: ALICE, email: "alice@example.com", link_url: "https://10almonds.com/y", link_id: "y" });
    check("a webhook reply never includes the reader's record, email or garden token", reply.status === 200 && !/garden_token|alice@|beehiiv_subscriber_id|"subscriber"/.test(JSON.stringify(reply.body)), JSON.stringify(reply.body));
    const open1 = await hook("open", { subscriber_id: BOB }), open2 = await hook("open", { subscriber_id: BOB });
    check("only the first open of the day earns points", open1.body.pointsAwarded > 0 && open2.body.pointsAwarded === 0, `${open1.body.pointsAwarded} then ${open2.body.pointsAwarded}`);
    const quiz1 = await hook("click", { subscriber_id: BOB, quiz_id: "q-1", quiz_correct: true }), quiz2 = await hook("click", { subscriber_id: BOB, quiz_id: "q-1", quiz_correct: true });
    check("a quiz only counts once", quiz1.body.pointsAwarded > 0 && quiz2.body.pointsAwarded === 0, `${quiz1.body.pointsAwarded} then ${quiz2.body.pointsAwarded}`);
    for (const bad of ["../../publications", "sub_x?y=1", "a".repeat(5000), ""]) {
      check(`a webhook with a malformed subscriber ID is refused (${bad.slice(0, 18) || "empty"})`, (await hook("click", { subscriber_id: bad, email: "x@example.com" })).status === 400);
    }
    const exact = { wp_user_id: 7 };
    const firstTime = await signed(A.base, "/api/wp/session", exact, S, true);
    const replay = await signed(A.base, "/api/wp/session", exact, S, true);
    check("a signed WordPress request can't be replayed", firstTime.status === 200 && replay.status === 401, `${firstTime.status} then ${replay.status}`);
    const sameSecond = String(Math.floor(Date.now() / 1000));
    const [twinA, twinB] = await Promise.all([signed(A.base, "/api/wp/session", { wp_user_id: 7 }, S, false, sameSecond), signed(A.base, "/api/wp/session", { wp_user_id: 7 }, S, false, sameSecond)]);
    check("two genuine requests for the same reader in the same second are both accepted (plugin's request shape)", twinA.status === 200 && twinB.status === 200 && twinA.body.linked && twinB.body.linked, `${twinA.status}, ${twinB.status}`);
    const php2 = fs.readFileSync(path.join(REPO, "wordpress-plugin/my-daily-garden/my-daily-garden.php"), "utf8");
    check("the plugin adds a fresh request_id to every signed request", /\$body\['request_id'\] = wp_generate_uuid4\(\);\s*\$json = wp_json_encode\(\$body\);/.test(php2));

    section("Purchase storage failures (engine, temporary database)");
    const engineCheck = path.join(TMP, "engine-check.js");
    fs.writeFileSync(engineCheck, `
      const { db, initSchema } = require(${JSON.stringify(path.join(REPO, "src/db"))});
      initSchema();
      const { recordPurchase } = require(${JSON.stringify(path.join(REPO, "src/engine"))});
      const ID = "sub_00000000-0000-4000-8000-0000000000f1";
      db.prepare("INSERT INTO subscribers (beehiiv_subscriber_id, email, points) VALUES (?, 'f@example.com', 100)").run(ID);
      const points = () => db.prepare("SELECT points FROM subscribers WHERE beehiiv_subscriber_id = ?").get(ID).points;
      const logged = (o) => db.prepare("SELECT COUNT(*) AS n FROM purchase_log WHERE order_id = ?").get(o).n;
      const attempt = (o) => { try { return { result: recordPurchase({ beehiivSubscriberId: ID, email: "", orderId: o, amount: 10 }) }; } catch (e) { return { error: e.message }; } };
      const out = {};
      db.exec("CREATE TRIGGER fail_log BEFORE INSERT ON purchase_log BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END");
      const a = attempt("wc_901");
      out.insertFailure = { threw: !!a.error, duplicate: !!(a.result && a.result.duplicate), points: points(), logged: logged("wc_901") };
      db.exec("DROP TRIGGER fail_log");
      db.exec("CREATE TRIGGER fail_points BEFORE UPDATE OF points ON subscribers BEGIN SELECT RAISE(ABORT, 'simulated failure after logging'); END");
      const b = attempt("wc_902");
      out.midwayFailure = { threw: !!b.error, points: points(), logged: logged("wc_902") };
      db.exec("DROP TRIGGER fail_points");
      const c = attempt("wc_902");
      out.retry = { credited: !!(c.result && !c.result.duplicate), awarded: c.result && c.result.pointsAwarded, points: points(), logged: logged("wc_902") };
      const d = attempt("wc_902");
      out.duplicate = { duplicate: !!(d.result && d.result.duplicate), points: points(), logged: logged("wc_902") };
      console.log(JSON.stringify(out));
    `);
    const engineOut = JSON.parse(execFileSync(process.execPath, [engineCheck], { cwd: TMP, env: { ...CLEAN_ENV, DB_PATH: path.join(TMP, "engine.db") }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").pop());
    check("a storage error while logging an order is an error, not 'already credited'", engineOut.insertFailure.threw && !engineOut.insertFailure.duplicate && engineOut.insertFailure.points === 100 && engineOut.insertFailure.logged === 0, JSON.stringify(engineOut.insertFailure));
    check("a failure between logging and adding points leaves nothing half-done", engineOut.midwayFailure.threw && engineOut.midwayFailure.points === 100 && engineOut.midwayFailure.logged === 0, JSON.stringify(engineOut.midwayFailure));
    check("the retry after a failure credits the order once", engineOut.retry.credited && engineOut.retry.awarded === 1000 && engineOut.retry.points === 1100 && engineOut.retry.logged === 1, JSON.stringify(engineOut.retry));
    check("only the real duplicate-order rule counts as 'already credited'", engineOut.duplicate.duplicate && engineOut.duplicate.points === 1100 && engineOut.duplicate.logged === 1, JSON.stringify(engineOut.duplicate));
    const route = fs.readFileSync(path.join(REPO, "src/routes/wp-auth.js"), "utf8");
    check("the purchase route turns a storage error into an error reply, so WordPress retries", /catch \(err\) \{[\s\S]*?status\(503\)/.test(route));
    check("no X-Powered-By header; HSTS on; framing only from 10almonds.com", !page.headers.get("x-powered-by") && /max-age=/.test(page.headers.get("strict-transport-security") || "") && !/\*\.10almonds/.test(page.headers.get("content-security-policy") || ""));
    const badJson = await fetch(`${A.base}/api/garden/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    const badText = await badJson.text();
    check("a malformed JSON body gets a short error, never a stack trace", badJson.status === 400 && !/ at |node_modules|Error:/.test(badText), badText.slice(0, 60));
    db.close();
  } catch (err) {
    console.error(err);
    failures++;
  } finally {
    A.proc.kill();
    N.proc.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\n${failures ? `${failures} FAILED` : "All checks passed."}`);
  process.exit(failures ? 1 : 0);
})();
