const crypto = require("node:crypto");
const express = require("express");
const { applyDailyReport, readDailyStats, readLastSeen, ackLastSeen } = require("./index");

const router = express.Router();

router.use("/api/v2/test", (req, res, next) => {
  if (process.env.NODE_ENV !== "test") return res.sendStatus(404);
  const expected = Buffer.from(process.env.V2_TEST_TOKEN || "");
  const received = Buffer.from(req.get("x-v2-test-token") || "");
  if (!expected.length || expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: "invalid test token" });
  }
  next();
});

router.post("/api/v2/test/daily-report", (req, res) => {
  try {
    res.json(applyDailyReport(req.body || {}));
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

router.get("/api/v2/test/daily-stats/:readerId", (req, res) => {
  try {
    res.json(readDailyStats(req.params.readerId));
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    throw error;
  }
});

router.get("/api/v2/test/last-seen/:readerId", (req, res) => {
  res.json({ previousVisit: readLastSeen(req.params.readerId) });
});

router.post("/api/v2/test/last-seen", (req, res) => {
  try {
    res.json(ackLastSeen(req.body?.readerId, req.body));
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

module.exports = router;
