const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");
const { STAGES, stageForPoints, streakStatus } = require("../engine/config");
const { recordPurchase } = require("../engine");
const { createPass } = require("../engine/pass");

const router = express.Router();

// This endpoint is NOT called directly by the browser. Per the architecture
// doc's auth section: the WordPress REST endpoint (see wordpress-snippet/)
// verifies who's logged in using WordPress's own session/nonce system, THEN
// makes this server-to-server call on her behalf. We verify the signature
// below to confirm the request really came from our WordPress site and
// wasn't forged or replayed.

const SHARED_SECRET = process.env.WP_APP_SHARED_SECRET;
const MAX_REQUEST_AGE_SECONDS = 60; // rejects replayed requests older than this

function verifyWpSignature(req) {
  if (!SHARED_SECRET) return false; // no secret, no entry — locally too (set it in .env)
  const signature = req.headers["x-wp-signature"];
  const timestamp = req.headers["x-wp-timestamp"];
  if (!signature || !timestamp) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > MAX_REQUEST_AGE_SECONDS) return false; // stale/replayed request

  // Sign the raw bytes WordPress actually sent, not a re-serialisation of the
  // parsed body: PHP's wp_json_encode and JS's JSON.stringify agree on today's
  // one-key payload, but they don't have to agree on key order, number
  // formatting or unicode escaping, and any drift there is a 401 that looks
  // like a wrong secret.
  const raw = req.rawBody ? req.rawBody.toString("utf8") : null;
  if (!raw) return false;

  const payload = `${timestamp}:${raw}`;
  const expected = crypto.createHmac("sha256", SHARED_SECRET).update(payload).digest("hex");

  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // signature was malformed / wrong length — reject, don't throw
  }
  if (!ok) return false;
  // Each signed request works once: a copy replayed inside the time window is refused.
  const now = Date.now();
  for (const [sig, at] of seenSignatures) if (now - at > 2 * MAX_REQUEST_AGE_SECONDS * 1000) seenSignatures.delete(sig);
  if (seenSignatures.has(signature)) return false;
  seenSignatures.set(signature, now);
  return true;
}
const seenSignatures = new Map(); // signature → when it was first seen

// POST /api/wp/tree-status  { wp_user_id }
// Called by WordPress on behalf of whichever subscriber is actually logged
// in — WordPress has already confirmed that before this request is made.
router.post("/api/wp/tree-status", (req, res) => {
  if (!verifyWpSignature(req)) return res.status(401).json({ error: "invalid or missing signature" });

  const { wp_user_id } = req.body || {};
  if (!wp_user_id) return res.status(400).json({ error: "missing wp_user_id" });

  const sub = findGarden(wp_user_id);
  if (!sub) {
    // Not an error — she may be logged in and have an account, but hasn't
    // clicked anything from an email yet, so no garden record exists.
    return res.json({ linked: false });
  }

  const stageIdx = stageForPoints(sub.points);
  const stage = STAGES[stageIdx];
  const nextStage = STAGES[stageIdx + 1] || null;

  res.json({
    linked: true,
    points: sub.points,
    streak: streakStatus(sub).streak,
    stage: stage.name,
    nextStage: nextStage ? { name: nextStage.name, pointsNeeded: nextStage.need - sub.points } : null,
  });
});

// The garden linked to a WordPress user, or null. Linking is done by hand
// for verified participants (src/scripts/link-wp-user.js): an account's
// email isn't proof its owner gets that newsletter, so it's never used to
// pick a garden. More than one garden on the same account is refused too.
function findGarden(wpUserId) {
  const id = Number(wpUserId) || 0;
  if (!id) return null;
  const linked = db.prepare("SELECT * FROM subscribers WHERE wp_user_id = ?").all(id);
  return linked.length === 1 ? linked[0] : null;
}

// POST /api/wp/ping — the plugin's settings page checks the address and secret.
router.post("/api/wp/ping", (req, res) => {
  if (!verifyWpSignature(req)) return res.status(401).json({ error: "invalid or missing signature" });
  res.json({ ok: true });
});

// POST /api/wp/session  { wp_user_id }
// The plugin asks for a pass to show this logged-in reader their garden.
router.post("/api/wp/session", (req, res) => {
  if (!verifyWpSignature(req)) return res.status(401).json({ error: "invalid or missing signature" });
  const { wp_user_id } = req.body || {};
  if (!wp_user_id) return res.status(400).json({ error: "missing wp_user_id" });
  const sub = findGarden(wp_user_id);
  if (!sub) return res.json({ linked: false });
  res.json({ linked: true, ...createPass(sub.beehiiv_subscriber_id) });
});

// POST /api/wp/purchase  { wp_user_id, order_id, total, currency }
// A WooCommerce order was completed by a linked participant. Points go to
// their garden, once per order however often WordPress reports it. Only the
// linked account counts (never an email match), free orders earn nothing,
// and if PURCHASE_CURRENCY is set, other currencies earn nothing.
router.post("/api/wp/purchase", (req, res) => {
  if (!verifyWpSignature(req)) return res.status(401).json({ error: "invalid or missing signature" });
  const { wp_user_id, order_id, total, currency } = req.body || {};
  if (!order_id) return res.status(400).json({ error: "missing order_id" });
  const sub = findGarden(wp_user_id);
  if (!sub) return res.json({ credited: false, reason: "no garden for this customer" });
  if (!(Number(total) > 0)) return res.json({ credited: false, reason: "free order" });
  const wanted = (process.env.PURCHASE_CURRENCY || "").toUpperCase();
  if (wanted && String(currency || "").toUpperCase() !== wanted) return res.json({ credited: false, reason: "other currency" });
  const seen = db.prepare("SELECT 1 FROM purchase_log WHERE order_id = ?").get(String(order_id));
  if (seen) return res.json({ credited: false, reason: "already credited" });
  let result;
  try {
    result = recordPurchase({ beehiivSubscriberId: sub.beehiiv_subscriber_id, email: sub.email, orderId: String(order_id), amount: total });
  } catch (err) {
    console.error(`Purchase ${order_id} not recorded:`, err.message);
    return res.status(503).json({ error: "not_recorded" }); // WordPress tries again later
  }
  if (result.duplicate) return res.json({ credited: false, reason: "already credited" });
  res.json({ credited: true, pointsAwarded: result.pointsAwarded, points: result.subscriber.points });
});

module.exports = router;
