// Pushes updated stats back to beehiiv as custom fields, so future email
// sends can reference her actual progress (e.g. "Your tree is blooming!").
// Requires a beehiiv API key + publication ID, generated from the beehiiv
// dashboard (Settings → API).

const API_KEY = process.env.BEEHIIV_API_KEY;
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;

function assertConfigured() {
  if (!API_KEY || !PUBLICATION_ID) {
    throw new Error(
      "beehiiv is not configured — set BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID in .env"
    );
  }
}

/**
 * Updates a subscriber's custom fields in beehiiv.
 * `fields` is a plain object, e.g. { streak: 5, tree_stage: "Blossom" }.
 *
 * IMPORTANT (confirmed against a real API call): beehiiv returns 200 OK
 * even when a named custom field hasn't been created in the dashboard yet —
 * it just silently drops that field and returns a `warnings` array instead
 * of failing. A 200 status alone does NOT mean the data actually saved.
 * This function checks `warnings` and throws if any field was rejected, so
 * a silent no-op can't masquerade as success upstream.
 *
 * Before this works for real: streak, points, and tree_stage must each be
 * created as custom fields in the beehiiv dashboard (Audience → Custom
 * Fields) — streak/points as Number, tree_stage as Text. One-time setup.
 */
async function syncSubscriberStats(beehiivSubscriberId, fields) {
  assertConfigured();
  const url = `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions/${beehiivSubscriberId}`;

  const custom_fields = Object.entries(fields).map(([name, value]) => ({ name, value }));

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ custom_fields }),
  });

  if (!res.ok) {
    throw new Error(`beehiiv sync failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  if (data.warnings && data.warnings.length > 0) {
    const messages = data.warnings.map((w) => w.message).join("; ");
    throw new Error(`beehiiv sync partially rejected: ${messages}`);
  }

  return data;
}

/**
 * Pulls a subscriber's aggregate click total from beehiiv — used by the
 * nightly reconciliation job.
 *
 * Confirmed field name against a real API response: `total_clicked` on the
 * subscription's `stats` object (counts every click, not just unique links —
 * matches how our own click_log counts every click event too).
 */
async function fetchClickTotal(beehiivSubscriberId) {
  assertConfigured();
  const url = `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions/${beehiivSubscriberId}?expand=stats`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!res.ok) {
    throw new Error(`beehiiv stats fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data?.data?.stats?.total_clicked ?? null;
}

/**
 * Counts how many people this subscriber has referred via their own beehiiv
 * referral link.
 *
 * beehiiv has no "subscriber A referred subscriber B" webhook, and a new
 * subscription's payload only carries its OWN referral_code (the one it can
 * refer others with) — not who brought it in. The only way to attribute a
 * referral is this reverse lookup: ask a subscription who IT referred. That's
 * why crediting runs as a sweep (src/jobs/referrals.js) rather than a webhook.
 *
 * Only `active` referrals count. Pending double-opt-ins and invalid addresses
 * are excluded on purpose, so points can't be farmed with throwaway emails.
 */
async function fetchReferralCount(beehiivSubscriberId) {
  assertConfigured();
  const url = `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions/${beehiivSubscriberId}?expand[]=referrals`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!res.ok) {
    throw new Error(`beehiiv referral fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const referrals = data?.data?.referrals;

  // Distinguish "no referrals yet" (0) from "the API didn't return the field
  // at all", which would silently look like zero and quietly credit nobody.
  if (!Array.isArray(referrals)) {
    throw new Error(
      "beehiiv response had no `referrals` array — check that the expand[]=referrals " +
      "parameter is still supported and the API key has referral access"
    );
  }
  return referrals.filter((r) => r.status === "active").length;
}

module.exports = { syncSubscriberStats, fetchClickTotal, fetchReferralCount };
