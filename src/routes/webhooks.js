const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");
const { recordClick, recordOpen, recordQuizAnswer } = require("../engine");


const router = express.Router();

// beehiiv subscription IDs look like sub_<uuid>. Anything else is refused:
// the ID is used in beehiiv API paths and creates a subscriber record.
const BEEHIIV_ID = /^sub_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What a webhook reply may say: never the subscriber's record (it holds
// their email and the secret token in their personal garden link).
const summary = (result) => ({ ok: true, pointsAwarded: result.pointsAwarded || 0, counted: result.counted !== false });

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
  if (!secret) return false; // no secret, no entry — locally too (set it in .env)
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
  if (!BEEHIIV_ID.test(String(subscriber_id || ""))) return res.status(400).json({ error: "invalid subscriber_id" });

  // Quiz links are click-triggered the same way as regular links, but the
  // automation should tag them with quiz_id/quiz_correct so we route them
  // to the quiz handler instead of standard click scoring.
  const result = quiz_id
    ? recordQuizAnswer({ beehiivSubscriberId: subscriber_id, email, quizId: quiz_id, correct: !!quiz_correct })
    : recordClick({ beehiivSubscriberId: subscriber_id, email, linkUrl: link_url, linkId: link_id });

  res.json(summary(result));
});

// Same mechanism as the click webhook above, just built off a
// "Post <X> was Opened" segment instead of "was Clicked".
router.post("/webhooks/beehiiv/open", (req, res) => {
  if (!verifySignature(req)) return res.status(401).json({ error: "invalid signature" });

  const { subscriber_id, email } = req.body || {};
  if (!BEEHIIV_ID.test(String(subscriber_id || ""))) return res.status(400).json({ error: "invalid subscriber_id" });

  const result = recordOpen({ beehiivSubscriberId: subscriber_id, email });
  res.json(summary(result));
});

module.exports = router;


