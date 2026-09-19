require("dotenv").config();
const express = require("express");
const path = require("path");
const { initSchema } = require("./db");
const webhookRoutes = require("./routes/webhooks");
const treeRoutes    = require("./routes/tree");
const harvestRoutes = require("./routes/harvest");
const wpAuthRoutes  = require("./routes/wp-auth");
const demoRoutes    = require("./routes/demo");

initSchema();

const app = express();

// Keep the raw body around for webhook signature verification, while still
// parsing JSON normally for every route.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

app.use(express.static(path.join(__dirname, "..", "public")));
app.use(webhookRoutes);
app.use(treeRoutes);
app.use(harvestRoutes);
app.use(wpAuthRoutes);
app.use(demoRoutes);


app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`My Daily Garden backend listening on :${PORT}`));
}

module.exports = app;
