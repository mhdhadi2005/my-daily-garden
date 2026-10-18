const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('the app retires guessable reader routes and preserves signed WordPress status', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdg-v2-access-'));
  const secret = 'disposable-wordpress-signing-secret';
  const child = spawn(process.execPath, [path.join(__dirname, '../v2/fixture-server.js')], {
    env: {
      ...process.env,
      DB_PATH: path.join(dir, 'garden.db'),
      NODE_ENV: 'test',
      GARDEN_PUBLIC_URL: 'http://127.0.0.1:3001/v2/',
      WP_APP_SHARED_SECRET: secret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let port;
  try {
    port = await new Promise((resolve, reject) => {
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
    for (const [method, route] of [
      ['GET', '/api/tree/reader-a'],
      ['POST', '/api/tree/reader-a/viewed'],
      ['POST', '/api/tree/reader-a/harvest'],
    ]) {
      assert.equal((await fetch(origin + route, { method })).status, 410);
    }
    assert.equal((await fetch(origin + '/api/v2/garden')).status, 401);
    assert.equal((await fetch(origin + '/api/v2/garden/viewed', { method: 'POST' })).status, 401);
    assert.equal((await fetch(origin + '/api/v2/design')).status, 401);
    assert.equal((await fetch(origin + '/api/v2/design', { method: 'PUT' })).status, 401);
    const body = JSON.stringify({ wp_user_id: 123 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}:${body}`).digest('hex');
    const signed = await fetch(origin + '/api/wp/tree-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wp-timestamp': timestamp, 'x-wp-signature': signature },
      body,
    });
    assert.equal(signed.status, 200);
    assert.deepEqual(await signed.json(), { linked: false });
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
