// Thin client around WooCommerce's own REST API — no plugin required on the
// WordPress side for this part; WooCommerce already exposes this.
// Keys come from WooCommerce → Settings → Advanced → REST API.

const BASE_URL = process.env.WC_BASE_URL;         // e.g. https://devotedgrandma.com
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

function assertConfigured() {
  if (!BASE_URL || !CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error(
      "WooCommerce is not configured — set WC_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET in .env"
    );
  }
}

function authHeader() {
  const token = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

/**
 * Looks up a WooCommerce customer by email. Returns the customer object
 * (which includes their WordPress user ID) or null if no account exists yet.
 * A subscriber engaging with emails but with no account yet is expected and
 * fine — see recordAndLinkIfPossible() below and the "Edge Cases" section
 * of the architecture doc.
 */
async function findCustomerByEmail(email) {
  assertConfigured();
  const url = `${BASE_URL}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) {
    throw new Error(`WooCommerce customer lookup failed: ${res.status} ${res.statusText}`);
  }
  const customers = await res.json();
  return customers.length > 0 ? customers[0] : null;
}

/**
 * Called whenever we get a chance (a click event, or a periodic sweep) to
 * check if a subscriber who didn't have a WordPress account yet has since
 * created one, and link them if so. Safe to call repeatedly — no-ops if
 * already linked or still no account exists.
 */
async function linkSubscriberIfPossible(db, subscriber) {
  if (subscriber.wp_user_id) return subscriber; // already linked

  const customer = await findCustomerByEmail(subscriber.email);
  if (!customer) return subscriber; // no account yet — fine, try again later

  db.prepare("UPDATE subscribers SET wp_user_id = ? WHERE id = ?")
    .run(customer.id, subscriber.id);

  return { ...subscriber, wp_user_id: customer.id };
}

module.exports = { findCustomerByEmail, linkSubscriberIfPossible };
