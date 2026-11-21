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
//   +  the small fixes: demo cap, security headers
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
  WC_WEBHOOK_SECRET: crypto.randomBytes(24).toString("hex"),
  PURCHASE_CURRENCY: "AUD",
};
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(WP_|BEEHIIV_|WC_|ADMIN_API|PURCHASE_|DB_PATH|PORT$|NODE_ENV$|PUBLIC_APP_URL)/.test(k)));

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
const section = (title) => console.log(`\n── ${title}`);

function start(port, extraEnv, dbName) {
  const env = { ...CLEAN_ENV, PORT: String(port), DB_PATH: path.join(TMP, dbName), NODE_ENV: "production", ...extraEnv };
  const proc = spawn(process.execPath, ["src/server.js"], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
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
const signed = (base, p, body, secret) => {
  const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000));
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
    const seed = (id, email) => fetch(`${A.base}/api/seed-subscriber`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRETS.BEEHIIV_WEBHOOK_SECRET}` }, body: JSON.stringify({ subscriber_id: id, email }) }).then((r) => r.status);
    check("set up: two readers, Alice and Bob", (await seed("sub_alice", "alice@example.com")) === 200 && (await seed("sub_bob", "bob@example.com")) === 200);

    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(TMP, "secured.db"), { readOnly: true });
    const tokenOf = (id) => db.prepare("SELECT garden_token FROM subscribers WHERE beehiiv_subscriber_id = ?").get(id).garden_token;

    section("1. Private garden access");
    const exchange = (token) => fetch(`${A.base}/api/garden/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(json);
    const alicePass = (await exchange(tokenOf("sub_alice"))).body.pass;
    const bobPass = (await exchange(tokenOf("sub_bob"))).body.pass;
    check("each reader's personal newsletter link gives them a pass", /^p1\./.test(alicePass || "") && /^p1\./.test(bobPass || ""));
    check("a wrong or made-up newsletter link gives nothing", (await exchange("x".repeat(32))).status === 404 && (await exchange("")).status === 404);
    const aliceOwn = await garden(A.base, "me", alicePass);
    const bobOwn = await garden(A.base, "me", bobPass);
    check("Alice's pass opens Alice's garden, Bob's opens Bob's", aliceOwn.status === 200 && bobOwn.status === 200 && aliceOwn.body.points !== undefined);
    const viaBobsId = await garden(A.base, "sub_bob", alicePass);
    check("putting Bob's ID in the address with Alice's pass still only shows Alice's garden", viaBobsId.status === 200 && JSON.stringify(viaBobsId.body) === JSON.stringify(aliceOwn.body));
    const rawId = await garden(A.base, "sub_bob");
    check("a raw subscriber ID alone is refused", rawId.status === 401, `status ${rawId.status}`);
    for (const [action, p, method, body] of [["visit record", "sub_bob/viewed", "POST"], ["tree move", "sub_bob/forest/move", "POST", { harvestNumber: 1, q: 1, r: 0 }], ["water change", "sub_bob/forest/water", "POST", { q: 1, r: -1, add: true }], ["harvest", "sub_bob/harvest", "POST"]]) {
      const r = await garden(A.base, p, null, { method, body: body ? JSON.stringify(body) : undefined });
      check(`a raw ID can't make a ${action}`, r.status === 401, `status ${r.status}`);
    }
    const modified = alicePass.slice(0, -2) + (alicePass.endsWith("AA") ? "BB" : "AA");
    check("a modified pass is refused", (await garden(A.base, "me", modified)).status === 401);
    const forged = "p1." + Buffer.from(JSON.stringify({ s: "sub_bob", e: 9999999999 })).toString("base64url") + ".forged";
    check("a made-up pass naming Bob is refused", (await garden(A.base, "me", forged)).status === 401);
    process.env.WP_APP_SHARED_SECRET = SECRETS.WP_APP_SHARED_SECRET; // same secret, to make a pass that has run out
    const { createPass } = require("./engine/pass");
    const expired = createPass("sub_alice", Date.now() - 13 * 3600 * 1000).pass;
    const expiredRes = await garden(A.base, "me", expired);
    check("an expired pass is refused (12-hour life)", expiredRes.status === 401 && expiredRes.body.error === "pass_expired");
    check("the garden reply carries no IDs, emails or tokens", !/sub_alice|alice@|garden_token/.test(JSON.stringify(aliceOwn.body)));

    section("2. Missing secrets refuse requests");
    for (const [label, req] of [
      ["WordPress connection check", () => signed(N.base, "/api/wp/ping", {}, "anything")],
      ["WordPress garden pass", () => signed(N.base, "/api/wp/session", { wp_user_id: 1 }, "anything")],
      ["WordPress purchase", () => signed(N.base, "/api/wp/purchase", { wp_user_id: 1, order_id: "wc_1", total: 10 }, "anything")],
      ["unsigned WordPress request", () => signed(N.base, "/api/wp/ping", {})],
      ["beehiiv click webhook", () => fetch(`${N.base}/webhooks/beehiiv/click`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriber_id: "x", email: "x@example.com" }) }).then(json)],
      ["beehiiv open webhook", () => fetch(`${N.base}/webhooks/beehiiv/open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(json)],
      ["store purchase webhook", () => fetch(`${N.base}/webhooks/purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@example.com", total: 10 }) }).then(json)],
      ["admin seed route", () => fetch(`${N.base}/api/seed-subscriber`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " }, body: JSON.stringify({ subscriber_id: "x", email: "x@example.com" }) }).then(json)],
    ]) {
      const r = await req();
      check(`with no secrets set: ${label} is refused`, r.status === 401, `status ${r.status}`);
    }
    check("with secrets set: an unsigned WordPress request is refused", (await signed(A.base, "/api/wp/ping", {})).status === 401);
    check("with secrets set: a wrongly signed one is refused", (await signed(A.base, "/api/wp/ping", {}, "wrong")).status === 401);
    check("with secrets set: a correctly signed one works", (await signed(A.base, "/api/wp/ping", {}, SECRETS.WP_APP_SHARED_SECRET)).body.ok === true);

    section("3. Account linking");
    const S = SECRETS.WP_APP_SHARED_SECRET;
    check("an account isn't matched to a garden by email (Alice's email, unlinked account)", (await signed(A.base, "/api/wp/session", { wp_user_id: 7, email: "alice@example.com" }, S)).body.linked === false);
    const link = (...args) => { try { return { ok: true, out: execFileSync(process.execPath, ["src/scripts/link-wp-user.js", ...args], { cwd: REPO, env: { ...CLEAN_ENV, DB_PATH: path.join(TMP, "secured.db") }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { ok: false, out: String(e.stderr || e.message) }; } };
    check("linking a verified participant by hand works", link("sub_alice", "7").ok);
    check("Alice's account now opens her garden", (await signed(A.base, "/api/wp/session", { wp_user_id: 7 }, S)).body.linked === true);
    const taken = link("sub_bob", "7");
    check("a second garden can't be linked to the same account", !taken.ok && /already linked/.test(taken.out), taken.out.trim());
    const relink = link("sub_alice", "8");
    check("a linked garden can't be moved to another account without unlinking", !relink.ok && /already linked/.test(relink.out), relink.out.trim());
    await seed("sub_alice_2", "ALICE@example.com");
    const ambiguous = link("alice@example.com", "9");
    check("an email shared by two gardens is refused as ambiguous", !ambiguous.ok && /share that email/.test(ambiguous.out), ambiguous.out.trim());
    check("Bob's account (not linked) gets no garden", (await signed(A.base, "/api/wp/session", { wp_user_id: 8 }, S)).body.linked === false);

    section("4. Purchase points");
    const buy = (body) => signed(A.base, "/api/wp/purchase", body, S);
    const first = await buy({ wp_user_id: 7, order_id: "wc_501", total: 12.5, currency: "AUD" });
    check("a linked participant's order adds points (100 per $1)", first.body.credited === true && first.body.pointsAwarded === 1250, JSON.stringify(first.body));
    const again = await buy({ wp_user_id: 7, order_id: "wc_501", total: 12.5, currency: "AUD" });
    check("retrying the same order never counts twice", again.body.credited === false && again.body.reason === "already credited");
    check("an unlinked customer's order earns nothing", (await buy({ wp_user_id: 8, order_id: "wc_502", total: 20, currency: "AUD" })).body.credited === false);
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
    check("deactivating removes all queued jobs", /as_unschedule_all_actions\('mdg_send_purchase'/.test(php) && /wp_unschedule_hook\('mdg_send_purchase'\)/.test(php));
    check("the garden address must be https and uses WordPress's safe request helper", /wp_safe_remote_post/.test(php) && /esc_url_raw\(.*array\('https'\)\)/.test(php) && /strpos\(\$s\['app_url'\], 'https:\/\/'\) !== 0/.test(php));
    check("the pass goes after # (never sent to a server) into a sandboxed, no-referrer frame", /'\/#pass='/.test(php) && /sandbox', 'allow-scripts allow-same-origin'/.test(php) && /referrerpolicy', 'no-referrer'/.test(php));

    section("Small fixes");
    const demo = await fetch(`${A.base}/api/demo/tree?harvests=1000000`).then(json);
    check("the public demo caps the forest size", demo.status === 200 && demo.body.forest.length <= 12, `${demo.body.forest.length} trees`);
    const page = await fetch(`${A.base}/`);
    check("pages send no referrer and may only be framed by 10almonds.com", page.headers.get("referrer-policy") === "no-referrer" && /frame-ancestors 'self' https:\/\/10almonds\.com/.test(page.headers.get("content-security-policy") || ""));
    check("no database files are tracked in git", !execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n").some((f) => /\.db(-wal|-shm)?$/.test(f)));
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
