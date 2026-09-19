const express = require("express");
const crypto = require("crypto");
const { recordClick, recordOpen, recordQuizAnswer } = require("../engine");

const router = express.Router();

// beehiiv (like most providers) signs webhook payloads with a shared secret.
// Verify this BEFORE trusting the body — otherwise anyone who finds the
// endpoint URL could award themselves unlimited points.
// The exact header name/signing scheme should be confirmed against beehiiv's
// current webhook docs when the account is connected; this is a standard
// HMAC-SHA256-over-raw-body check that's easy to adapt once confirmed.
function verifySignature(req) {
  const secret = process.env.BEEHIIV_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // allow through in local dev only
  const signature = req.headers["x-beehiiv-signature"];
  if (!signature || !req.rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Fires from a beehiiv Automation with a Click Trigger on real article links.
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

// Fires from beehiiv's "Email Opened" automation trigger.
router.post("/webhooks/beehiiv/open", (req, res) => {
  if (!verifySignature(req)) return res.status(401).json({ error: "invalid signature" });

  const { subscriber_id, email } = req.body || {};
  if (!subscriber_id) return res.status(400).json({ error: "missing subscriber_id" });

  const result = recordOpen({ beehiivSubscriberId: subscriber_id, email });
  res.json({ ok: true, result });
});

module.exports = router;
