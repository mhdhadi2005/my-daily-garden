const { db } = require("../db");
const { creditGarden } = require("../v2/garden");

function initPurchases() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS v2_purchase_orders (
      order_id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('pending', 'held', 'credited')),
      reason TEXT,
      reader_id TEXT,
      merchandise_cents INTEGER,
      points INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function cents(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.test(value)) return null;
  const [dollars, fraction = ""] = value.split(".");
  const result = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

function paidMerchandiseCents(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const amount = cents(item?.total);
    if (amount === null || !Number.isSafeInteger(total + amount)) return null;
    total += amount;
  }
  return total;
}

function creditCompletedPurchase(order) {
  if (!Number.isSafeInteger(order?.id) || order.id <= 0) {
    return { status: "invalid_order", pointsAwarded: 0 };
  }
  const orderId = String(order.id);
  const existing = db.prepare("SELECT * FROM v2_purchase_orders WHERE order_id = ?").get(orderId);
  if (existing?.state === "credited") return { status: "already_credited", pointsAwarded: 0 };
  if (existing?.state === "held") return { status: "held", pointsAwarded: 0 };

  const paidAt = order.date_paid_gmt || order.date_paid;
  if (order.status !== "completed" || typeof paidAt !== "string" || !Number.isFinite(Date.parse(paidAt))) {
    return { status: "ignored", pointsAwarded: 0 };
  }
  const merchandiseCents = paidMerchandiseCents(order.line_items);
  if (merchandiseCents === null || merchandiseCents === 0) {
    return { status: "invalid_amount", pointsAwarded: 0 };
  }
  // Points are whole numbers: $24.99 earns floor(24.99 × 2) = 49.
  const points = Math.floor(merchandiseCents / 50);
  if (points === 0) return { status: "below_one_point", pointsAwarded: 0 };

  if (!existing) {
    if (order.currency !== "USD") {
      db.prepare(`
        INSERT OR IGNORE INTO v2_purchase_orders (order_id, state, reason, merchandise_cents, points)
        VALUES (?, 'held', 'currency', ?, ?)
      `).run(orderId, merchandiseCents, points);
      return { status: "held", pointsAwarded: 0 };
    }
    const email = order.billing?.email;
    const matches = typeof email === "string" && email.trim()
      ? db.prepare("SELECT beehiiv_subscriber_id FROM subscribers WHERE lower(trim(email)) = ? LIMIT 2")
        .all(email.trim().toLowerCase())
      : [];
    if (matches.length !== 1) {
      db.prepare(`
        INSERT OR IGNORE INTO v2_purchase_orders (order_id, state, reason, merchandise_cents, points)
        VALUES (?, 'held', 'subscriber', ?, ?)
      `).run(orderId, merchandiseCents, points);
      return { status: "held", pointsAwarded: 0 };
    }
    db.prepare(`
      INSERT OR IGNORE INTO v2_purchase_orders
        (order_id, state, reader_id, merchandise_cents, points)
      VALUES (?, 'pending', ?, ?, ?)
    `).run(orderId, matches[0].beehiiv_subscriber_id, merchandiseCents, points);
  }

  const pending = db.prepare("SELECT * FROM v2_purchase_orders WHERE order_id = ?").get(orderId);
  if (pending.state !== "pending") return { status: pending.state, pointsAwarded: 0 };
  creditGarden(pending.reader_id, `purchase:${orderId}`, pending.points);
  db.prepare("UPDATE v2_purchase_orders SET state = 'credited', updated_at = datetime('now') WHERE order_id = ?")
    .run(orderId);
  return { status: "credited", pointsAwarded: pending.points };
}

module.exports = { initPurchases, creditCompletedPurchase };
