require("dotenv").config();
const express = require("express");
const path = require("path");
const { db, initSchema } = require("./db");
const webhookRoutes = require("./routes/webhooks");
const wpAuthRoutes  = require("./routes/wp-auth");
const demoRoutes    = require("./routes/demo");
const jobRoutes     = require("./routes/jobs");
const { startScheduler } = require("./jobs/scheduler");
const { initGarden, ensureGarden } = require("./v2/garden");
const { initPurchases } = require("./v2-purchases");
const { initDailyReports, readDailyStats, readLastSeen, ackLastSeen } = require("./v2-reports");
const { createAccess } = require("./v2-access");
const { createDesign } = require("./v2-customization");

initSchema();
initGarden();
initPurchases();
initDailyReports();

const app = express();

// Keep the raw body around for webhook signature verification, while still
// parsing JSON normally for every route.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// Old entry links may contain subscriber IDs. Never carry those into v2.
app.get(['/', '/index.html'], (_req, res) => {
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cache-Control', 'no-store');
  res.redirect('/v2/');
});
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(webhookRoutes);
// The old subscriber-ID routes exposed private forests and let anyone alter
// replay state or harvest by guessing an ID. The signed WordPress route below
// remains available to its existing server-to-server caller.
app.use('/api/tree', (_req, res) => res.status(410).json({ error: 'legacy_private_route_retired' }));
app.use(wpAuthRoutes);
app.use(demoRoutes);
app.use(jobRoutes);
if (process.env.GARDEN_PUBLIC_URL || process.env.NODE_ENV !== 'production') {
  const access = createAccess({
    db,
    ensureGarden: (readerId) => ({
      ...ensureGarden(readerId),
      stats: readDailyStats(readerId),
      previousVisit: readLastSeen(readerId),
    }),
    publicUrl: process.env.GARDEN_PUBLIC_URL || 'http://127.0.0.1:3001/v2/',
  });
  app.use(access.router);
  app.post('/api/v2/garden/viewed', access.requireReader, (req, res) => {
    try {
      res.json(ackLastSeen(req.v2ReaderId, req.body));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return res.status(400).json({ error: 'invalid_viewed_garden' });
      }
      throw error;
    }
  });
  app.use('/api/v2/design', access.requireReader, createDesign({ db }));
}
if (process.env.NODE_ENV === "test") app.use(require("./v2/test-routes"));


app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`My Daily Garden backend listening on :${PORT}`));
  // Only when run as the real server — importing the app for tests shouldn't
  // start background timers.
  startScheduler();
}

module.exports = app;
