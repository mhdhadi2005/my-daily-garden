const { db } = require("../../src/db");
const app = require("../../src/server");

db.prepare("INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)")
  .run("reader-a", "reader@example.test");

app.listen(0, "127.0.0.1", function () {
  process.stdout.write(`PURCHASE_PORT=${this.address().port}\n`);
});
