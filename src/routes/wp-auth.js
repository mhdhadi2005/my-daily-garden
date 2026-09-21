const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");
const { STAGES, stageForPoints } = require("../engine/config");

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
  if (!SHARED_SECRET) return process.env.NODE_ENV !== "production"; // dev-only bypass
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

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // signature was malformed / wrong length — reject, don't throw
  }
}

// POST /api/wp/tree-status  { wp_user_id }
// Called by WordPress on behalf of whichever subscriber is actually logged
// in — WordPress has already confirmed that before this request is made.
router.post("/api/wp/tree-status", (req, res) => {
  if (!verifyWpSignature(req)) return res.status(401).json({ error: "invalid or missing signature" });

  const { wp_user_id } = req.body || {};
  if (!wp_user_id) return res.status(400).json({ error: "missing wp_user_id" });

  const sub = db.prepare("SELECT * FROM subscribers WHERE wp_user_id = ?").get(wp_user_id);
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
    streak: sub.streak,
    stage: stage.name,
    nextStage: nextStage ? { name: nextStage.name, pointsNeeded: nextStage.need - sub.points } : null,
  });
});

module.exports = router;
