const app = require('../../src/server');
app.use(require('../../src/v2-actions/test-routes'));
app.listen(0, '127.0.0.1', function () {
  process.stdout.write(`V2_ACTIONS_PORT=${this.address().port}\n`);
});
