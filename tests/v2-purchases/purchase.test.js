const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const secret = "disposable-purchase-secret";
const gardenToken = "disposable-garden-token";

async function withServer(run, withoutWebhookSecret = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mdg-v2-purchase-"));
  const env = {
    ...process.env,
    DB_PATH: path.join(dir, "garden.db"),
    NODE_ENV: "test",
    WC_WEBHOOK_SECRET: secret,
    V2_TEST_TOKEN: gardenToken,
  };
  if (withoutWebhookSecret) delete env.WC_WEBHOOK_SECRET;
  const child = spawn(process.execPath, [path.join(__dirname, "fixture-server.js")], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/PURCHASE_PORT=(\d+)\n/);
        if (match) resolve(Number(match[1]));
      });
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`purchase fixture exited ${code}`)));
    });
    await run(`http://127.0.0.1:${port}`);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function sendOrder(base, order, signed = true) {
  const body = JSON.stringify(order);
  const headers = { "content-type": "application/json" };
  if (signed) {
    headers["x-wc-webhook-signature"] = crypto.createHmac("sha256", secret).update(body).digest("base64");
  }
  const response = await fetch(base + "/webhooks/purchase", { method: "POST", headers, body });
  return { status: response.status, body: await response.json() };
}

async function readGarden(base, readerId = "reader-a") {
  const response = await fetch(base + `/api/v2/test/garden/${readerId}`, {
    headers: { "x-v2-test-token": gardenToken },
  });
  return { status: response.status, body: await response.json() };
}

function sampleOrder(overrides = {}) {
  return {
    id: 712,
    status: "completed",
    date_paid_gmt: "2026-10-16T04:00:00",
    currency: "USD",
    billing: { email: "reader@example.test" },
    line_items: [{ total: "20.00" }],
    ...overrides,
  };
}

test("a signed completed purchase credits only paid merchandise after discounts", async () => {
  await withServer(async (base) => {
    const response = await sendOrder(base, {
      id: 711,
      status: "completed",
      date_paid_gmt: "2026-10-16T04:00:00",
      currency: "USD",
      billing: { email: "Reader@Example.Test" },
      line_items: [{ total: "20.49" }, { total: "4.50" }],
      shipping_total: "10.00",
      total_tax: "2.00",
      total: "36.99",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, result: { status: "credited", pointsAwarded: 49 } });
    const garden = await readGarden(base);
    assert.equal(garden.status, 200);
    assert.equal(garden.body.points, 49);
  });
});

test("a repeated order never adds points twice, even if its later payload changes", async () => {
  await withServer(async (base) => {
    assert.deepEqual((await sendOrder(base, sampleOrder())).body.result,
      { status: "credited", pointsAwarded: 40 });
    assert.deepEqual((await sendOrder(base, sampleOrder({
      billing: { email: "other@example.test" },
      line_items: [{ total: "900.00" }],
    }))).body.result, { status: "already_credited", pointsAwarded: 0 });
    assert.equal((await readGarden(base)).body.points, 40);
  });
});

test("an unmatched order is held without awarding a garden", async () => {
  await withServer(async (base) => {
    const response = await sendOrder(base, sampleOrder({
      billing: { email: "not-a-subscriber@example.test" },
    }));
    assert.deepEqual(response.body.result, { status: "held", pointsAwarded: 0 });
    assert.equal((await readGarden(base)).status, 404);
    assert.deepEqual((await sendOrder(base, sampleOrder())).body.result,
      { status: "held", pointsAwarded: 0 });
  });
});

test("unsigned, unpaid, invalid-amount, and unsupported-currency orders never award points", async () => {
  await withServer(async (base) => {
    assert.equal((await sendOrder(base, sampleOrder({ id: 713 }), false)).status, 401);
    assert.deepEqual((await sendOrder(base, sampleOrder({ id: 714, status: "processing" }))).body.result,
      { status: "ignored", pointsAwarded: 0 });
    assert.deepEqual((await sendOrder(base, sampleOrder({ id: 715, date_paid_gmt: null }))).body.result,
      { status: "ignored", pointsAwarded: 0 });
    assert.deepEqual((await sendOrder(base, sampleOrder({
      id: 716, line_items: [{ total: "not-an-amount" }],
    }))).body.result, { status: "invalid_amount", pointsAwarded: 0 });
    assert.deepEqual((await sendOrder(base, sampleOrder({ id: 717, currency: "EUR" }))).body.result,
      { status: "held", pointsAwarded: 0 });
    assert.equal((await readGarden(base)).status, 404);
  });
});

test("a later refunded order does not remove earned growth", async () => {
  await withServer(async (base) => {
    await sendOrder(base, sampleOrder());
    const refund = await sendOrder(base, sampleOrder({ status: "refunded" }));
    assert.deepEqual(refund.body.result, { status: "already_credited", pointsAwarded: 0 });
    assert.equal((await readGarden(base)).body.points, 40);
  });
});

test("purchase credit fails closed when the webhook secret is not configured", async () => {
  await withServer(async (base) => {
    assert.equal((await sendOrder(base, sampleOrder())).status, 401);
    assert.equal((await readGarden(base)).status, 404);
  }, true);
});
