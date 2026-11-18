require("dotenv").config();
const express = require("express");
const path = require("path");
const { initSchema } = require("./db");
const webhookRoutes = require("./routes/webhooks");
const treeRoutes    = require("./routes/tree");
const harvestRoutes = require("./routes/harvest");
const wpAuthRoutes  = require("./routes/wp-auth");
const demoRoutes    = require("./routes/demo");
const jobRoutes     = require("./routes/jobs");
const { startScheduler } = require("./jobs/scheduler");
const { compressedStatic } = require("./static-compressed");

initSchema();

const app = express();

// Keep the raw body around for webhook signature verification, while still
// parsing JSON normally for every route.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

const PUBLIC = path.join(__dirname, "..", "public");
app.use(compressedStatic(PUBLIC, {
  longCache: (rel) => rel.startsWith("/forest3d/vendor/"), // three.js: only changes on an upgrade
  warm: ["forest3d/vendor/three.core.js", "forest3d/vendor/three.module.js", "forest3d/tree-reference.glb"],
}));
app.use(express.static(PUBLIC));
app.use(webhookRoutes);
app.use(treeRoutes);
app.use(harvestRoutes);
app.use(wpAuthRoutes);
app.use(demoRoutes);
app.use(jobRoutes);


app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`My Daily Garden backend listening on :${PORT}`));
  // Only when run as the real server — importing the app for tests shouldn't
  // start background timers.
  startScheduler();
}

module.exports = app;
