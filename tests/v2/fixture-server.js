const app = require("../../src/server");

app.listen(0, "127.0.0.1", function () {
  process.stdout.write(`V2_PORT=${this.address().port}\n`);
});
