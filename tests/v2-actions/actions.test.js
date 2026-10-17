const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

async function withServer(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdg-v2-actions-'));
  const child = spawn(process.execPath, [path.join(__dirname, 'fixture-server.js')], {
    env: { ...process.env, DB_PATH: path.join(dir, 'garden.db'), NODE_ENV: 'test',
      V2_TEST_TOKEN: 'fixture-secret', V2_APPROVED_QUIZ_IDS: 'poll_editor_approved' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errorOutput = '';
  child.stderr.on('data', chunk => { errorOutput += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/V2_ACTIONS_PORT=(\d+)\n/);
        if (match) resolve(Number(match[1]));
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`fixture server exited ${code}: ${errorOutput}`)));
    });
    const request = async (route, body, token = 'fixture-secret') => {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-v2-test-token': token },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    await run(request);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('a published editor-approved trivia response earns 15 points once per reader and quiz', async () => {
  await withServer(async request => {
    const poll = { id: 'poll_editor_approved', poll_type: 'trivia', status: 'published', trivia_answer: 'choice_yes' };
    const response = { id: 'response_1', subscription_id: 'reader-quiz', poll_choice_id: 'choice_yes', subscription_deleted: false };
    const route = '/api/v2/test/actions/quiz';
    assert.equal((await request(route, { poll, response }, 'wrong')).status, 401);
    assert.equal((await request(route, { poll: { ...poll, id: 'poll_unknown' }, response })).body.points, 0);
    assert.equal((await request(route, { poll: { ...poll, status: 'draft' }, response })).body.points, 0);
    assert.equal((await request(route, { poll, response: { ...response, subscription_deleted: true } })).body.points, 0);
    assert.equal((await request(route, { poll, response: { ...response, poll_choice_id: 'choice_no' } })).body.points, 0);
    assert.equal((await request(route, { poll, response })).body.points, 15);
    assert.equal((await request(route, { poll, response: { ...response, id: 'response_2' } })).body.points, 15);
  });
});

test('only active referrals with stable IDs earn 50 points once each', async () => {
  await withServer(async request => {
    const route = '/api/v2/test/actions/referrals';
    const referrerId = 'reader-referrer';
    const referrals = [
      { id: 'sub_one', status: 'active' },
      { id: 'sub_two', status: 'pending' },
      { id: 'sub_three', status: 'active' },
      { id: 'sub_one', status: 'active' },
    ];
    assert.equal((await request(route, { referrerId, referrals: [
      { id: 'sub_four', status: 'active' }, { status: 'active' },
    ] })).status, 400);
    assert.equal((await request(route, { referrerId, referrals })).body.points, 100);
    assert.equal((await request(route, { referrerId, referrals })).body.points, 100);
    assert.equal((await request(route, { referrerId, referrals: [{ id: 'sub_two', status: 'active' }] })).body.points, 150);
    assert.equal((await request(route, { referrerId, referrals: [{ status: 'active' }] })).status, 400);
  });
});
