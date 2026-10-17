const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdg-v2-design-'));
process.env.DB_PATH = path.join(dir, 'garden.db');
process.env.NODE_ENV = 'test';

const { db, initSchema } = require('../../src/db');
const { initGarden, creditGarden, ensureGarden } = require('../../src/v2/garden');
const { createAccess } = require('../../src/v2-access');
const { createDesign } = require('../../src/v2-customization');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

initSchema();
initGarden();
db.prepare('INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)').run('reader-a', 'a@example.test');
db.prepare('INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)').run('reader-b', 'b@example.test');
db.prepare('INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)').run('reader-c', 'c@example.test');
creditGarden('reader-a', 'starter', 560);
creditGarden('reader-c', 'historical:launch', 560);
ensureGarden('reader-b');

async function fixture() {
  const access = createAccess({ db, ensureGarden, publicUrl: 'https://garden.example.test/v2/' });
  const design = createDesign({ db });
  db.exec('DELETE FROM v2_access_tokens');
  db.exec('DELETE FROM v2_design');
  const app = express();
  app.use(express.json());
  app.use(access.router);
  app.use('/api/v2/design', access.requireReader, design);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function cookie(readerId) {
    const secret = new URL(access.issueLink(readerId).url).hash.slice('#access='.length);
    const response = await fetch(origin + '/api/v2/access/claim', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: secret }),
    });
    assert.equal(response.status, 204);
    return response.headers.get('set-cookie').split(';')[0];
  }
  return { origin, cookie, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function request(origin, cookie, method = 'GET', body) {
  const response = await fetch(origin + '/api/v2/design', {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('a reader saves earned placements and choices, then sees them after reload', async () => {
  const app = await fixture();
  try {
    assert.equal((await request(app.origin)).status, 401);
    const ownCookie = await app.cookie('reader-a');
    const otherCookie = await app.cookie('reader-b');
    const start = await request(app.origin, ownCookie);
    assert.equal(start.status, 200);
    assert.equal(start.body.revision, 0);
    assert.equal(start.body.trees.length, 3);
    assert.equal(start.body.decorations.length, 1);
    assert.deepEqual(start.body.requiredChoices, ['palette', 'resident']);
    assert.equal(start.body.foundingAward, false);
    assert.deepEqual(start.body.trees[0].position, [-3.2, -.65]);
    assert.deepEqual(start.body.decorations[0].position, [-4.2, -2]);
    const treeId = start.body.trees[0].id;
    const decorationId = start.body.decorations[0].id;
    const changed = await request(app.origin, ownCookie, 'PUT', {
      revision: 0, palette: 'rose', resident: 'fox', placements: [
        { kind: 'tree', id: treeId, position: [-3.5, 0] },
        { kind: 'decoration', id: decorationId, position: [-4.3, -1.8] },
      ],
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.revision, 1);
    assert.equal(changed.body.palette, 'rose');
    assert.equal(changed.body.resident, 'fox');
    assert.deepEqual(changed.body.requiredChoices, []);
    assert.deepEqual(changed.body.trees[0].position, [-3.5, 0]);
    assert.deepEqual(changed.body.decorations[0].position, [-4.3, -1.8]);
    assert.deepEqual((await request(app.origin, ownCookie)).body, changed.body);
    const other = await request(app.origin, otherCookie);
    assert.equal(other.body.trees.length, 0);
    assert.equal(other.body.resident, null);
    assert.equal(other.body.revision, 0);
  } finally {
    await app.close();
  }
});

test('a reader cannot save unearned items, invalid spots, or stale edits', async () => {
  const app = await fixture();
  try {
    const ownCookie = await app.cookie('reader-a');
    const otherCookie = await app.cookie('reader-b');
    assert.deepEqual((await request(app.origin, otherCookie)).body.availablePalettes, []);
    assert.deepEqual((await request(app.origin, otherCookie)).body.requiredChoices, []);
    assert.equal((await request(app.origin, otherCookie, 'PUT', {
      revision: 0, palette: 'cream', resident: null, placements: [],
    })).status, 400);
    creditGarden('reader-b', 'first-tree', 60);
    assert.deepEqual((await request(app.origin, otherCookie)).body.availableResidents, []);
    assert.deepEqual((await request(app.origin, otherCookie)).body.requiredChoices, ['palette']);
    assert.equal((await request(app.origin, otherCookie, 'PUT', {
      revision: 0, palette: 'cream', resident: 'fox', placements: [],
    })).status, 400);
    const initial = (await request(app.origin, ownCookie)).body;
    const treeId = initial.trees[0].id;
    const badSaves = [
      { revision: 0, palette: 'rose', resident: 'fox', placements: [{ kind: 'tree', id: 999999, position: [-3, 1] }] },
      { revision: 0, palette: 'rose', resident: 'fox', placements: [{ kind: 'tree', id: treeId, position: initial.trees[1].position }] },
      { revision: 0, palette: 'rose', resident: 'fox', placements: [{ kind: 'tree', id: treeId, position: [3.15, 2.35] }] },
      { revision: 0, palette: 'rose', resident: 'fox', placements: [{ kind: 'tree', id: treeId, position: [NaN, 1] }] },
      { revision: 0, palette: 'rose', resident: 'fox', placements: [{ kind: 'tree', id: treeId, position: [-30, 1] }] },
      { revision: 0, palette: 'rose', resident: 'fox', placements: [], terrain: 'snow' },
      { revision: 0, palette: 'rose', resident: 'fox', placements: [{ kind: 'tree', id: treeId, position: [-3, 1], rotation: 90 }] },
      { revision: 0, palette: 'rose', resident: 'griffin', placements: [] },
    ];
    for (const body of badSaves) assert.equal((await request(app.origin, ownCookie, 'PUT', body)).status, 400);
    assert.equal((await request(app.origin, otherCookie, 'PUT', {
      revision: 0, palette: 'rose', resident: null, placements: [{ kind: 'tree', id: treeId, position: [-3, 1] }],
    })).status, 400);
    assert.equal((await request(app.origin, ownCookie)).body.revision, 0);
    const good = { revision: 0, palette: 'apricot', resident: 'hedgehog', placements: [] };
    assert.equal((await request(app.origin, ownCookie, 'PUT', good)).status, 200);
    assert.equal((await request(app.origin, ownCookie, 'PUT', good)).status, 409);
    creditGarden('reader-a', 'nine-trees', 1500);
    const nine = (await request(app.origin, ownCookie)).body;
    assert.deepEqual(nine.decorations.map(({ id }) => id), [
      'decoration-2', 'decoration-5', 'decoration-9',
    ]);
    assert.deepEqual(nine.trees[8].position, [-6, -4.3]);
    assert.deepEqual(nine.decorations[2].position, [-4.5, -4.3]);
    assert.deepEqual(nine.areas, ['meadow', 'pond', 'woodland']);
  } finally {
    await app.close();
  }
});

test('an audited founding forest asks for its resident without replaying a palette choice', async () => {
  const app = await fixture();
  try {
    const cookie = await app.cookie('reader-c');
    const initial = (await request(app.origin, cookie)).body;
    assert.equal(initial.foundingAward, true);
    assert.deepEqual(initial.requiredChoices, ['resident']);
    assert.equal(initial.palette, 'cream');
    const chosen = await request(app.origin, cookie, 'PUT', {
      revision: 0, palette: 'cream', resident: 'hedgehog', placements: [],
    });
    assert.equal(chosen.status, 200);
    assert.deepEqual(chosen.body.requiredChoices, []);
    assert.ok(initial.openSpots.length > 0);
    const moved = await request(app.origin, cookie, 'PUT', {
      revision: 1, palette: 'cream', resident: 'hedgehog',
      placements: [{ kind: 'tree', id: initial.trees[0].id, position: initial.openSpots[0] }],
    });
    assert.equal(moved.status, 200);
    assert.deepEqual(moved.body.trees[0].position, initial.openSpots[0]);
  } finally {
    await app.close();
  }
});

test('a moved item cannot cover an auto-placed or saved item', async () => {
  const app = await fixture();
  try {
    const cookie = await app.cookie('reader-a');
    const start = (await request(app.origin, cookie)).body;
    const overlapDefault = await request(app.origin, cookie, 'PUT', {
      revision: 0, palette: 'cream', resident: null,
      placements: [{ kind: 'tree', id: start.trees[0].id, position: start.trees[1].position }],
    });
    assert.deepEqual(overlapDefault, { status: 400, body: { error: 'occupied_spot' } });
    const saved = await request(app.origin, cookie, 'PUT', {
      revision: 0, palette: 'cream', resident: null,
      placements: [
        { kind: 'tree', id: start.trees[0].id, position: [-3.5, 0] },
        { kind: 'decoration', id: start.decorations[0].id, position: [-4.3, -1.8] },
      ],
    });
    assert.equal(saved.status, 200);
    const overlapSaved = await request(app.origin, cookie, 'PUT', {
      revision: 1, palette: 'cream', resident: null,
      placements: [
        { kind: 'tree', id: start.trees[1].id, position: [-4.3, -1.8] },
        { kind: 'decoration', id: start.decorations[0].id, position: [-4.3, -1.8] },
      ],
    });
    assert.deepEqual(overlapSaved, { status: 400, body: { error: 'occupied_spot' } });
    assert.equal((await request(app.origin, cookie)).body.revision, 1);
  } finally {
    await app.close();
  }
});

test('the full app mounts design only behind private reader access', async () => {
  const app = require('../../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await request(origin)).status, 401);
    assert.equal((await request(origin, null, 'PUT', {
      revision: 0, palette: null, resident: null, placements: [],
    })).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
