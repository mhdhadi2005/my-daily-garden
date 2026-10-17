const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('legacy garden entries lead to private v2 without forwarding reader IDs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdg-v2-entry-'));
  const child = spawn(process.execPath, [path.join(__dirname, 'fixture-server.js')], {
    env: { ...process.env, DB_PATH: path.join(dir, 'garden.db'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/V2_PORT=(\d+)\n/);
        if (match) resolve(Number(match[1]));
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`app exited ${code}: ${stderr}`)));
    });
    for (const route of ['/', '/index.html', '/?demo=1', '/?subscriber=private-reader', '/index.html?subscriber=private-reader']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: 'manual' });
      assert.equal(response.status, 302, route);
      assert.equal(response.headers.get('location'), '/v2/', route);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer', route);
      assert.equal(response.headers.get('cache-control'), 'no-store', route);
    }
    const finalPage = await fetch(`http://127.0.0.1:${port}/?subscriber=private-reader`);
    assert.equal(finalPage.status, 200);
    assert.equal(new URL(finalPage.url).pathname, '/v2/');
    assert.match(await finalPage.text(), /My Almond Forest/);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
    await fs.rm(dir, { recursive: true, force: true });
  }
});
