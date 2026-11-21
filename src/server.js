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
app.disable("x-powered-by");

// Keep the raw body around for webhook signature verification, while still
// parsing JSON normally for every route.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// Basic protections on every response. Garden pages may be framed only by the
// garden itself and 10almonds.com (the account page), and never send their
// address (which can carry a reader's link or pass) to other sites.
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=15552000");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://10almonds.com https://www.10almonds.com; object-src 'none'; base-uri 'self'");
  next();
});

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

// Errors (e.g. a malformed JSON body) get a short reply, never a stack trace.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.type === "entity.parse.failed" ? "bad_json" : status >= 500 ? "server_error" : "bad_request" });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`My Daily Garden backend listening on :${PORT}`));
  // Only when run as the real server — importing the app for tests shouldn't
  // start background timers.
  startScheduler();
}

module.exports = app;
