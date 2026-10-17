const express = require("express");
const crypto = require("crypto");
const { recordClick, recordOpen, recordQuizAnswer } = require("../engine");
const { creditCompletedPurchase } = require("../v2-purchases");


const router = express.Router();

// Verify BEFORE trusting the body — otherwise anyone who finds the endpoint
// URL could award themselves unlimited points.
//
// Confirmed against beehiiv's own "How to use webhooks in automations" docs:
// the Send Webhook automation action has no HMAC/signing capability — its
// only auth option is a fixed custom header you type in when you build the
// automation. So this checks that header against our stored secret directly,
// rather than verifying a computed signature (there isn't one to verify).
// When setting up the automation's Send Webhook step, add a header named
// X-MDG-Secret with this same value as BEEHIIV_WEBHOOK_SECRET.
function verifySignature(req) {
  const secret = process.env.BEEHIIV_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers["x-mdg-secret"];
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Fires from a beehiiv Automation: a Segment ("Post <X> was Clicked") feeding
// a Segment Action trigger, with a Send Webhook step pointed at this URL.
// Needs rebuilding per newsletter issue — beehiiv has no "any post, ever"
// version of this trigger, only "this specific post".
router.post("/webhooks/beehiiv/click", (req, res) => {
  if (!verifySignature(req)) return res.status(401).json({ error: "invalid signature" });

  const { subscriber_id, email, link_url, link_id, quiz_id, quiz_correct } = req.body || {};
  if (!subscriber_id) return res.status(400).json({ error: "missing subscriber_id" });

  // Quiz links are click-triggered the same way as regular links, but the
  // automation should tag them with quiz_id/quiz_correct so we route them
  // to the quiz handler instead of standard click scoring.
  const result = quiz_id
    ? recordQuizAnswer({ beehiivSubscriberId: subscriber_id, email, quizId: quiz_id, correct: !!quiz_correct })
    : recordClick({ beehiivSubscriberId: subscriber_id, email, linkUrl: link_url, linkId: link_id });

  res.json({ ok: true, result });
});

// Same mechanism as the click webhook above, just built off a
// "Post <X> was Opened" segment instead of "was Clicked".
router.post("/webhooks/beehiiv/open", (req, res) => {
  if (!verifySignature(req)) return res.status(401).json({ error: "invalid signature" });

  const { subscriber_id, email } = req.body || {};
  if (!subscriber_id) return res.status(400).json({ error: "missing subscriber_id" });

  const result = recordOpen({ beehiivSubscriberId: subscriber_id, email });
  res.json({ ok: true, result });
});

// POST /api/seed-subscriber — admin-only route to manually create a subscriber
// Protected by BEEHIIV_WEBHOOK_SECRET as a bearer token.
router.post("/api/seed-subscriber", (req, res) => {
  const secret = process.env.BEEHIIV_WEBHOOK_SECRET;
  const auth = (req.headers["authorization"] || "").replace("Bearer ", "");
  if (!secret || auth !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { subscriber_id, email } = req.body || {};
  if (!subscriber_id || !email) return res.status(400).json({ error: "missing subscriber_id or email" });

  const result = recordClick({ beehiivSubscriberId: subscriber_id, email, linkUrl: "https://seed", linkId: "seed" });
  res.json({ ok: true, result });
});

// WooCommerce signs webhook payloads with the secret set on the webhook
// itself (WooCommerce → Settings → Advanced → Webhooks), sent as a
// base64 HMAC-SHA256 of the raw body in the X-WC-Webhook-Signature header.
// Without this check anyone who finds the URL could award themselves
// unlimited purchase points for free.
function verifyWooSignature(req) {
  const secret = process.env.WC_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers["x-wc-webhook-signature"];
  if (!signature || !req.rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // signature was malformed — reject, don't throw
  }
}

// POST /webhooks/purchase — WooCommerce / store purchase webhook
router.post("/webhooks/purchase", (req, res) => {
  if (!verifyWooSignature(req)) return res.status(401).json({ error: "invalid signature" });
  try {
    const result = creditCompletedPurchase(req.body);
    if (result.status === "invalid_order") return res.status(400).json({ error: "invalid order id" });
    res.json({ ok: true, result });
  } catch (error) {
    console.error("Purchase credit failed:", error.name);
    res.status(500).json({ error: "purchase credit failed" });
  }
});

module.exports = router;


