const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const token = "disposable-report-token";

async function startServer(dbPath, environment = "test") {
  const child = spawn(process.execPath, [path.join(__dirname, "fixture-server.js")], {
    env: { ...process.env, DB_PATH: dbPath, NODE_ENV: environment, V2_TEST_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/REPORT_PORT=(\d+)\n/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`fixture server exited ${code}: ${errors}`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  await once(server.child, "exit");
}

async function request(server, body, auth = token) {
  const response = await fetch(server.url + "/api/v2/test/daily-report", {
    method: "POST",
    headers: { "content-type": "application/json", "x-v2-test-token": auth },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function garden(server, readerId) {
  const response = await fetch(server.url + `/api/v2/test/garden/${readerId}`, {
    headers: { "x-v2-test-token": token },
  });
  return { status: response.status, body: await response.json() };
}

async function dailyStats(server, readerId) {
  const response = await fetch(server.url + `/api/v2/test/daily-stats/${readerId}`, {
    headers: { "x-v2-test-token": token },
  });
  return { status: response.status, body: await response.json() };
}

async function lastSeen(server, readerId) {
  const response = await fetch(server.url + `/api/v2/test/last-seen/${readerId}`, {
    headers: { "x-v2-test-token": token },
  });
  return { status: response.status, body: await response.json() };
}

async function acknowledge(server, body) {
  const response = await fetch(server.url + "/api/v2/test/last-seen", {
    method: "POST",
    headers: { "content-type": "application/json", "x-v2-test-token": token },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function withServer(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdg-report-test-"));
  let server;
  try {
    server = await startServer(path.join(dir, "garden.db"));
    await run(server);
  } finally {
    if (server) await stopServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("first valid daily report sets a counter baseline without inventing points", async () => {
  await withServer(async (server) => {
    const report = await request(server, {
      readerId: "reader-a", day: "2026-10-16", openTotal: 12, clickTotal: 8,
      active: true, readFailed: false,
    });
    assert.equal(report.status, 200);
    assert.deepEqual(report.body, {
      readerId: "reader-a", day: "2026-10-16", status: "baseline",
      openTotal: 12, clickTotal: 8, opensCredited: 0, clicksCredited: 0,
      pointsAwarded: 0, clickStreak: 0, bestStreak: 0,
    });
    assert.equal((await request(server, { readerId: "reader-a", day: "2026-10-16" }, "wrong")).status, 401);
  });
});

test("new counts credit opens and at most five clicks per report, without carrying excess clicks forward", async () => {
  await withServer(async (server) => {
    await request(server, { readerId: "reader-a", day: "2026-10-16", openTotal: 12, clickTotal: 8, active: true });
    const growth = await request(server, {
      readerId: "reader-a", day: "2026-10-17", openTotal: 15, clickTotal: 16, active: true,
    });
    assert.deepEqual(growth.body, {
      readerId: "reader-a", day: "2026-10-17", status: "credited",
      openTotal: 15, clickTotal: 16, opensCredited: 3, clicksCredited: 5,
      pointsAwarded: 56, clickStreak: 1, bestStreak: 1,
    });
    assert.equal((await garden(server, "reader-a")).body.points, 56);

    const quiet = await request(server, {
      readerId: "reader-a", day: "2026-10-18", openTotal: 16, clickTotal: 16, active: true,
    });
    assert.equal(quiet.body.status, "credited");
    assert.equal(quiet.body.pointsAwarded, 2);
    assert.equal(quiet.body.clicksCredited, 0);
    assert.equal(quiet.body.clickStreak, 0);
    assert.equal((await garden(server, "reader-a")).body.points, 58);
    const unchanged = await request(server, {
      readerId: "reader-a", day: "2026-10-19", openTotal: 16, clickTotal: 16, active: true,
    });
    assert.equal(unchanged.body.status, "quiet");
    assert.equal(unchanged.body.pointsAwarded, 0);
  });
});

test("every seventh positive daily report earns one five-point streak bonus", async () => {
  await withServer(async (server) => {
    await request(server, { readerId: "reader-a", day: "2026-10-01", openTotal: 0, clickTotal: 0, active: true });
    for (let count = 1; count <= 14; count++) {
      const day = `2026-10-${String(count + 1).padStart(2, "0")}`;
      const result = await request(server, {
        readerId: "reader-a", day, openTotal: 0, clickTotal: count, active: true,
      });
      assert.equal(result.body.clickStreak, count);
      assert.equal(result.body.pointsAwarded, count % 7 === 0 ? 15 : 10);
    }
    assert.equal((await garden(server, "reader-a")).body.points, 150);
  });
});

test("a failed daily read pauses the reported click streak and awards nothing", async () => {
  await withServer(async (server) => {
    await request(server, { readerId: "reader-a", day: "2026-10-01", openTotal: 0, clickTotal: 0, active: true });
    await request(server, { readerId: "reader-a", day: "2026-10-02", openTotal: 0, clickTotal: 1, active: true });
    const failed = await request(server, { readerId: "reader-a", day: "2026-10-03", readFailed: true });
    assert.equal(failed.status, 200);
    assert.equal(failed.body.status, "failed");
    assert.equal(failed.body.pointsAwarded, 0);
    assert.equal(failed.body.clickStreak, 1);
    const resumed = await request(server, {
      readerId: "reader-a", day: "2026-10-04", openTotal: 0, clickTotal: 2, active: true,
    });
    assert.equal(resumed.body.clickStreak, 2);
    assert.equal(resumed.body.pointsAwarded, 10);
    assert.equal((await garden(server, "reader-a")).body.points, 20);
  });
});

test("an inactive reader keeps the counter baseline but earns no newsletter points", async () => {
  await withServer(async (server) => {
    await request(server, { readerId: "reader-a", day: "2026-10-01", openTotal: 4, clickTotal: 4, active: true });
    await request(server, { readerId: "reader-a", day: "2026-10-02", openTotal: 5, clickTotal: 5, active: true });
    const inactive = await request(server, {
      readerId: "reader-a", day: "2026-10-03", openTotal: 8, clickTotal: 6, active: false,
    });
    assert.equal(inactive.body.status, "inactive");
    assert.equal(inactive.body.pointsAwarded, 0);
    assert.equal(inactive.body.clickStreak, 0);
    assert.equal((await garden(server, "reader-a")).body.points, 12);
    const pausedStats = await dailyStats(server, "reader-a");
    assert.equal(pausedStats.body.opens, 8);
    assert.equal(pausedStats.body.clicks, 6);
    assert.equal(pausedStats.body.currentStreak, 0);
    assert.equal(pausedStats.body.bestStreak, 1);
    assert.equal(pausedStats.body.coverage.lastReportStatus, "inactive");
    const resumed = await request(server, {
      readerId: "reader-a", day: "2026-10-04", openTotal: 9, clickTotal: 7, active: true,
    });
    assert.equal(resumed.body.pointsAwarded, 12);
    assert.equal(resumed.body.clickStreak, 1);
    assert.equal((await garden(server, "reader-a")).body.points, 24);
  });
});

test("missing or falling counters fail closed and preserve the last good baseline", async () => {
  await withServer(async (server) => {
    await request(server, { readerId: "reader-a", day: "2026-10-01", openTotal: 10, clickTotal: 10, active: true });
    await request(server, { readerId: "reader-a", day: "2026-10-02", openTotal: 11, clickTotal: 11, active: true });
    const missing = await request(server, {
      readerId: "reader-a", day: "2026-10-03", openTotal: 11, active: true,
    });
    assert.equal(missing.body.status, "failed");
    assert.equal(missing.body.pointsAwarded, 0);
    const falling = await request(server, {
      readerId: "reader-a", day: "2026-10-04", openTotal: 11, clickTotal: 9, active: true,
    });
    assert.equal(falling.body.status, "failed");
    assert.equal(falling.body.clickStreak, 1);
    const recovered = await request(server, {
      readerId: "reader-a", day: "2026-10-05", openTotal: 12, clickTotal: 12, active: true,
    });
    assert.equal(recovered.body.pointsAwarded, 12);
    assert.equal(recovered.body.clickStreak, 2);
    assert.equal((await garden(server, "reader-a")).body.points, 24);
  });
});

test("one successful report per UTC day stays idempotent after retry and restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdg-report-restart-"));
  const dbPath = path.join(dir, "garden.db");
  let server;
  try {
    server = await startServer(dbPath);
    await request(server, { readerId: "reader-a", day: "2026-10-01", openTotal: 0, clickTotal: 0, active: true });
    const first = await request(server, {
      readerId: "reader-a", day: "2026-10-02", openTotal: 1, clickTotal: 1, active: true,
    });
    const changedRetry = await request(server, {
      readerId: "reader-a", day: "2026-10-02", openTotal: 20, clickTotal: 20, active: true,
    });
    assert.deepEqual(changedRetry, first);
    await stopServer(server);
    server = await startServer(dbPath);
    const afterRestart = await request(server, {
      readerId: "reader-a", day: "2026-10-02", openTotal: 20, clickTotal: 20, active: true,
    });
    assert.deepEqual(afterRestart, first);
    assert.equal((await garden(server, "reader-a")).body.points, 12);
    const nextDay = await request(server, {
      readerId: "reader-a", day: "2026-10-03", openTotal: 2, clickTotal: 2, active: true,
    });
    assert.equal(nextDay.body.pointsAwarded, 12);
    assert.equal((await garden(server, "reader-a")).body.points, 24);
  } finally {
    if (server) await stopServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("test-token scoring route is absent outside test mode", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdg-report-guard-"));
  let server;
  try {
    server = await startServer(path.join(dir, "garden.db"), "production");
    const response = await fetch(server.url + "/api/v2/test/daily-report", {
      method: "POST",
      headers: { "content-type": "application/json", "x-v2-test-token": token },
      body: JSON.stringify({
        readerId: "reader-a", day: "2026-10-01", openTotal: 0, clickTotal: 0, active: true,
      }),
    });
    assert.equal(response.status, 404);
  } finally {
    if (server) await stopServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("reader stats expose observed totals and their coverage without inventing missing history", async () => {
  await withServer(async (server) => {
    const missing = await dailyStats(server, "reader-a");
    assert.deepEqual(missing, { status: 200, body: {
      available: false, opens: null, clicks: null,
      currentStreak: null, bestStreak: null,
      coverage: {
        firstObservedDay: null, asOfDay: null,
        lastReportDay: null, lastReportStatus: null, historyStartKnown: false,
      },
    } });

    await request(server, { readerId: "reader-a", day: "2026-10-01", openTotal: 12, clickTotal: 8, active: true });
    await request(server, { readerId: "reader-a", day: "2026-10-02", openTotal: 14, clickTotal: 11, active: true });
    const observed = await dailyStats(server, "reader-a");
    assert.deepEqual(observed.body, {
      available: true, opens: 14, clicks: 11,
      currentStreak: 1, bestStreak: 1,
      coverage: {
        firstObservedDay: "2026-10-01", asOfDay: "2026-10-02",
        lastReportDay: "2026-10-02", lastReportStatus: "credited", historyStartKnown: false,
      },
    });

    await request(server, { readerId: "reader-a", day: "2026-10-03", readFailed: true });
    const paused = await dailyStats(server, "reader-a");
    assert.equal(paused.body.opens, 14);
    assert.equal(paused.body.clicks, 11);
    assert.equal(paused.body.coverage.asOfDay, "2026-10-02");
    assert.equal(paused.body.coverage.lastReportDay, "2026-10-03");
    assert.equal(paused.body.coverage.lastReportStatus, "failed");
    assert.equal(paused.body.currentStreak, 1);
    assert.equal(paused.body.bestStreak, 1);
  });
});

test("invalid calendar days fail cleanly without creating report history", async () => {
  await withServer(async (server) => {
    for (const day of ["2026-02-30", "9999-99-99", "10000-01-01"]) {
      const rejected = await request(server, {
        readerId: "reader-a", day, openTotal: 4, clickTotal: 2, active: true,
      });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.error, "invalid daily report");
    }
    assert.deepEqual((await dailyStats(server, "reader-a")).body.coverage.lastReportDay, null);
    assert.equal((await request(server, {
      readerId: "reader-a", day: "2026-03-01", openTotal: 4, clickTotal: 2, active: true,
    })).body.status, "baseline");
  });
});

test("last-seen growth changes only after an explicit acknowledgement and never moves backward", async () => {
  await withServer(async (server) => {
    assert.deepEqual((await lastSeen(server, "reader-a")).body, { previousVisit: null });
    const firstGrowth = await fetch(server.url + "/api/v2/test/credit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-v2-test-token": token },
      body: JSON.stringify({ readerId: "reader-a", creditKey: "first", points: 59 }),
    });
    assert.equal(firstGrowth.status, 200);
    assert.deepEqual((await lastSeen(server, "reader-a")).body, { previousVisit: null });

    const firstAck = await acknowledge(server, { readerId: "reader-a", points: 59, treeCount: 0 });
    assert.equal(firstAck.status, 200);
    assert.equal(firstAck.body.points, 59);
    assert.equal(firstAck.body.treeCount, 0);
    assert.ok(firstAck.body.seenAt);

    await fetch(server.url + "/api/v2/test/credit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-v2-test-token": token },
      body: JSON.stringify({ readerId: "reader-a", creditKey: "second", points: 251 }),
    });
    assert.equal((await lastSeen(server, "reader-a")).body.previousVisit.points, 59);
    const secondAck = await acknowledge(server, { readerId: "reader-a", points: 310, treeCount: 2 });
    assert.equal(secondAck.body.points, 310);
    assert.equal(secondAck.body.treeCount, 2);
    const staleAck = await acknowledge(server, { readerId: "reader-a", points: 59, treeCount: 0 });
    assert.equal(staleAck.body.points, 310);
    assert.equal((await lastSeen(server, "reader-a")).body.previousVisit.points, 310);
    assert.equal((await acknowledge(server, { readerId: "reader-a", points: 999, treeCount: 2 })).status, 400);
  });
});
