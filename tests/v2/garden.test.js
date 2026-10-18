const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const token = "disposable-test-token";

async function startServer(dbPath, configuredToken = token) {
  const child = spawn(process.execPath, [path.join(__dirname, "fixture-server.js")], {
    env: { ...process.env, DB_PATH: dbPath, NODE_ENV: "test", V2_TEST_TOKEN: configuredToken },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/V2_PORT=(\d+)\n/);
      if (match) resolve(Number(match[1]));
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`fixture server exited ${code}`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  await once(server.child, "exit");
}

async function request(server, method, route, body, auth = token) {
  const response = await fetch(server.url + route, {
    method,
    headers: { "content-type": "application/json", "x-v2-test-token": auth },
    body: body && JSON.stringify(body),
  });
  const text = await response.text();
  let responseBody;
  try { responseBody = JSON.parse(text); } catch { responseBody = text; }
  return { status: response.status, body: responseBody };
}

test("a private reader keeps cumulative garden points and stable completed trees after restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdg-v2-test-"));
  const dbPath = path.join(dir, "garden.db");
  let server;
  try {
    server = await startServer(dbPath);
    assert.equal((await request(server, "GET", "/api/v2/test/garden/reader-a", null, "wrong")).status, 401);

    const first = await request(server, "POST", "/api/v2/test/credit", {
      readerId: "reader-a", creditKey: "event-1", points: 59,
    });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, {
      readerId: "reader-a", points: 59, trees: [],
      nextTree: { number: 1, threshold: 60, pointsNeeded: 1 },
    });
    assert.equal((await request(server, "POST", "/api/v2/test/credit", {
      readerId: "reader-a", creditKey: "invalid", points: -1,
    })).status, 400);

    const second = await request(server, "POST", "/api/v2/test/credit", {
      readerId: "reader-a", creditKey: "event-2", points: 501,
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.points, 560);
    assert.deepEqual(second.body.trees.map((tree) => [tree.number, tree.threshold]), [
      [1, 60], [2, 310], [3, 560],
    ]);
    assert.equal(new Set(second.body.trees.map((tree) => tree.id)).size, 3);
    assert.ok(second.body.trees.every((tree) => tree.earnedAt));
    assert.deepEqual(second.body.nextTree, { number: 4, threshold: 810, pointsNeeded: 250 });

    const retry = await request(server, "POST", "/api/v2/test/credit", {
      readerId: "reader-a", creditKey: "event-2", points: 501,
    });
    assert.deepEqual(retry, second);

    await stopServer(server);
    server = await startServer(dbPath);
    const afterRestart = await request(server, "GET", "/api/v2/test/garden/reader-a");
    assert.equal(afterRestart.status, 200);
    assert.deepEqual(afterRestart.body, second.body);

    await stopServer(server);
    server = await startServer(dbPath, "");
    assert.equal((await request(server, "GET", "/api/v2/test/garden/reader-a")).status, 401);
  } finally {
    if (server) await stopServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a verified reader can open an empty seed garden without receiving a credit", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdg-v2-seed-"));
  const dbPath = path.join(dir, "garden.db");
  let server;
  try {
    server = await startServer(dbPath);
    const seeded = await request(server, "POST", "/api/v2/test/garden", { readerId: "reader-seed" });
    assert.deepEqual(seeded, {
      status: 200,
      body: {
        readerId: "reader-seed", points: 0, trees: [],
        nextTree: { number: 1, threshold: 60, pointsNeeded: 60 },
      },
    });
    assert.deepEqual(await request(server, "POST", "/api/v2/test/garden", { readerId: "reader-seed" }), seeded);

    await stopServer(server);
    server = await startServer(dbPath);
    assert.deepEqual(await request(server, "GET", "/api/v2/test/garden/reader-seed"), seeded);
  } finally {
    if (server) await stopServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
