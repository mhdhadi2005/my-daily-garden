const express = require("express");
const { initSchema } = require("../../src/db");
const { initGarden } = require("../../src/v2/garden");
const { initDailyReports } = require("../../src/v2-reports");
const reportRoutes = require("../../src/v2-reports/test-routes");

initSchema();
initGarden();
initDailyReports();

const app = express();
app.use(express.json());
app.use(reportRoutes);
app.use(require("../../src/v2/test-routes"));
app.listen(0, "127.0.0.1", function () {
  process.stdout.write(`REPORT_PORT=${this.address().port}\n`);
});
