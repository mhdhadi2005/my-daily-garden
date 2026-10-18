const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAccess } = require('../../src/v2-access');
process.env.DB_PATH = ':memory:';
const { db, initSchema } = require('../../src/db');
const { initGarden, ensureGarden, creditGarden } = require('../../src/v2/garden');

initSchema();
initGarden();

async function fixture({ sendLink, verifyReaderEmail = async () => true, now = () => Date.now() } = {}) {
  db.exec('DELETE FROM v2_trees; DELETE FROM v2_credits; DELETE FROM v2_gardens; DELETE FROM subscribers');
  db.prepare('INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)')
    .run('reader-a', 'reader@example.test');
  db.prepare('INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)')
    .run('reader-b', 'other@example.test');
  creditGarden('reader-a', 'starting-award', 60);
  const access = createAccess({
    db,
    ensureGarden,
    sendLink,
    verifyReaderEmail,
    publicUrl: 'https://garden.example.test/v2/',
    now,
  });
  db.exec('DELETE FROM v2_access_tokens');
  const app = express();
  app.use(express.json());
  app.put('/api/v2/test-private', access.requireReader, (req, res) => res.json({ readerId: req.v2ReaderId }));
  app.use(access.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    db,
    issueLink: access.issueLink,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function json(origin, path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}

test('a reader can recover and enter only their private garden', async () => {
  const sent = [];
  const app = await fixture({ sendLink: async (mail) => sent.push(mail) });
  try {
    assert.equal((await json(app.origin, '/api/v2/garden')).status, 401);
    assert.equal((await json(app.origin, '/api/v2/test-private', { method: 'PUT' })).status, 401);
    const unknown = await json(app.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'missing@example.test' },
    });
    const known = await json(app.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'reader@example.test' },
    });
    assert.deepEqual([unknown.status, unknown.body], [known.status, known.body]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].email, 'reader@example.test');
    const token = new URL(sent[0].url).hash.slice('#access='.length);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const claim = await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token } });
    assert.equal(claim.status, 204);
    const cookie = claim.headers.get('set-cookie').split(';')[0];
    assert.match(claim.headers.get('set-cookie'), /HttpOnly;.*SameSite=Lax/);
    const garden = (await json(app.origin, '/api/v2/garden', { cookie })).body;
    assert.equal(garden.readerId, 'reader-a');
    assert.equal(garden.points, 60);
    assert.equal(garden.trees.length, 1);
    assert.deepEqual((await json(app.origin, '/api/v2/test-private', { method: 'PUT', cookie })).body,
      { readerId: 'reader-a' });
    assert.equal((await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token } })).status, 401);
    assert.equal((await json(app.origin, '/api/v2/garden/reader-b', { cookie })).status, 404);
  } finally {
    await app.close();
  }
});

test('a new reader enters a zero-point seed garden without earning a credit', async () => {
  const sent = [];
  const app = await fixture({ sendLink: async (mail) => sent.push(mail) });
  try {
    await json(app.origin, '/api/v2/access/recover', { method: 'POST', body: { email: 'other@example.test' } });
    const token = new URL(sent[0].url).hash.slice('#access='.length);
    const claim = await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token } });
    const cookie = claim.headers.get('set-cookie').split(';')[0];
    const garden = (await json(app.origin, '/api/v2/garden', { cookie })).body;
    assert.deepEqual(garden, {
      readerId: 'reader-b', points: 0, trees: [],
      nextTree: { number: 1, threshold: 60, pointsNeeded: 60 },
    });
  } finally {
    await app.close();
  }
});

test('expired links and sessions cannot open a private garden', async () => {
  let clock = Date.UTC(2026, 9, 16);
  const sent = [];
  const app = await fixture({ now: () => clock, sendLink: async (mail) => sent.push(mail) });
  try {
    await json(app.origin, '/api/v2/access/recover', { method: 'POST', body: { email: 'reader@example.test' } });
    const expired = new URL(sent[0].url).hash.slice('#access='.length);
    clock += 25 * 60 * 60 * 1000;
    assert.equal((await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token: expired } })).status, 401);
    await json(app.origin, '/api/v2/access/recover', { method: 'POST', body: { email: 'reader@example.test' } });
    const fresh = new URL(sent[1].url).hash.slice('#access='.length);
    const claim = await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token: fresh } });
    const cookie = claim.headers.get('set-cookie').split(';')[0];
    assert.equal((await json(app.origin, '/api/v2/garden', { cookie })).status, 200);
    clock += 31 * 24 * 60 * 60 * 1000;
    assert.equal((await json(app.origin, '/api/v2/garden', { cookie })).status, 401);
  } finally {
    await app.close();
  }
});

test('a replacement link rotates the earlier unused link', async () => {
  let clock = Date.UTC(2026, 9, 16);
  const sent = [];
  const app = await fixture({ now: () => clock, sendLink: async (mail) => sent.push(mail) });
  try {
    await json(app.origin, '/api/v2/access/recover', { method: 'POST', body: { email: 'reader@example.test' } });
    const old = new URL(sent[0].url).hash.slice('#access='.length);
    clock += 16 * 60 * 1000;
    await json(app.origin, '/api/v2/access/recover', { method: 'POST', body: { email: 'reader@example.test' } });
    const replacement = new URL(sent[1].url).hash.slice('#access='.length);
    assert.equal((await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token: old } })).status, 401);
    assert.equal((await json(app.origin, '/api/v2/access/claim', { method: 'POST', body: { token: replacement } })).status, 204);
  } finally {
    await app.close();
  }
});

test('trusted link issuance also rotates an earlier unused link', async () => {
  const app = await fixture();
  try {
    const first = new URL(app.issueLink('reader-a').url).hash.slice('#access='.length);
    const second = new URL(app.issueLink('reader-a').url).hash.slice('#access='.length);
    assert.equal((await json(app.origin, '/api/v2/access/claim', {
      method: 'POST', body: { token: first },
    })).status, 401);
    assert.equal((await json(app.origin, '/api/v2/access/claim', {
      method: 'POST', body: { token: second },
    })).status, 204);
  } finally {
    await app.close();
  }
});

test('recovery fails closed without a sender and hides whether an address exists if delivery fails', async () => {
  const noSender = await fixture();
  try {
    assert.equal((await json(noSender.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'reader@example.test' },
    })).status, 503);
  } finally {
    await noSender.close();
  }
  let failedUrl;
  const failedSender = await fixture({ sendLink: async ({ url }) => { failedUrl = url; throw new Error('mail offline'); } });
  try {
    const known = await json(failedSender.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'reader@example.test' },
    });
    const unknown = await json(failedSender.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'unknown@example.test' },
    });
    assert.deepEqual([known.status, known.body], [unknown.status, unknown.body]);
    const token = new URL(failedUrl).hash.slice('#access='.length);
    assert.equal((await json(failedSender.origin, '/api/v2/access/claim', { method: 'POST', body: { token } })).status, 401);
  } finally {
    await failedSender.close();
  }
});

test('recovery requires an authoritative current email match before delivery', async () => {
  const sent = [];
  const unverified = await fixture({ sendLink: async (mail) => sent.push(mail), verifyReaderEmail: null });
  try {
    assert.equal((await json(unverified.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'reader@example.test' },
    })).status, 503);
    assert.equal(sent.length, 0);
  } finally {
    await unverified.close();
  }
  const changed = await fixture({ sendLink: async (mail) => sent.push(mail), verifyReaderEmail: async () => false });
  try {
    const oldAddress = await json(changed.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'reader@example.test' },
    });
    const unknown = await json(changed.origin, '/api/v2/access/recover', {
      method: 'POST', body: { email: 'missing@example.test' },
    });
    assert.deepEqual([oldAddress.status, oldAddress.body], [unknown.status, unknown.body]);
    assert.equal(sent.length, 0);
  } finally {
    await changed.close();
  }
});
