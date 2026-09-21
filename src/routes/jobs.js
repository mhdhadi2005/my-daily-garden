const express = require("express");
const { runReferralSweep } = require("../jobs/referrals");

const router = express.Router();

// Admin-only trigger, protected by its own secret rather than the beehiiv
// webhook secret — that one is shared with beehiiv, and a signing secret
// shouldn't double as an admin bearer token. Fails closed: with no secret
// configured the endpoint is unavailable, including in dev, because it
// hands out points.
function isAuthorised(req) {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return false;
  const provided = (req.headers["authorization"] || "").replace("Bearer ", "");
  return provided === secret;
}

// POST /api/jobs/referrals — sweep beehiiv for new referrals and award points.
// Safe to call repeatedly: only referrals we haven't already credited earn points.
router.post("/api/jobs/referrals", async (req, res) => {
  if (!isAuthorised(req)) return res.status(401).json({ error: "unauthorized" });

  try {
    const summary = await runReferralSweep();
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
