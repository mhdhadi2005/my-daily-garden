const crypto = require("node:crypto");
const express = require("express");
const { creditGarden, ensureGarden, readGarden } = require("./garden");

const router = express.Router();

router.use("/api/v2/test", (req, res, next) => {
  const expected = Buffer.from(process.env.V2_TEST_TOKEN || "");
  const received = Buffer.from(req.get("x-v2-test-token") || "");
  if (!expected.length || expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: "invalid test token" });
  }
  next();
});

router.get("/api/v2/test/garden/:readerId", (req, res) => {
  const garden = readGarden(req.params.readerId);
  if (!garden) return res.status(404).json({ error: "garden not found" });
  res.json(garden);
});

router.post("/api/v2/test/garden", (req, res) => {
  try {
    res.json(ensureGarden(req.body?.readerId));
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: error.message });
    throw error;
  }
});

router.post("/api/v2/test/credit", (req, res) => {
  try {
    res.json(creditGarden(req.body?.readerId, req.body?.creditKey, req.body?.points));
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

module.exports = router;
