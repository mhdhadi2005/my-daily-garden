const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('blank integration secrets never authorize reader reads or point writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdg-blank-secrets-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../v2/fixture-server.js')], {
    env: {
      ...process.env,
      DB_PATH: path.join(dir, 'garden.db'),
      NODE_ENV: 'test',
      WP_APP_SHARED_SECRET: '',
      BEEHIIV_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/V2_PORT=(\d+)\n/);
        if (match) resolve(Number(match[1]));
      });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`app exited ${code}: ${stderr}`)));
    });
    const origin = `http://127.0.0.1:${port}`;
    for (const route of ['/api/seed-subscriber', '/webhooks/beehiiv/click', '/webhooks/beehiiv/open', '/api/wp/tree-status']) {
      const response = await fetch(origin + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriber_id: 'reader-a', email: 'reader@example.test', wp_user_id: 1 }),
      });
      assert.equal(response.status, 401, route);
    }
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
