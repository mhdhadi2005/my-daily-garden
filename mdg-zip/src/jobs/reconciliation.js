const { db } = require("../db");
const { fetchClickTotal } = require("../integrations/beehiiv");

/**
 * Nightly job: pulls each subscriber's aggregate click total FROM BEEHIIV
 * and compares it against what we recorded ourselves via webhooks.
 * Catches any Click Trigger webhooks that failed to fire or got dropped,
 * so a subscriber's progress never silently falls behind what she actually did.
 */
async function fetchBeehiivClickTotal(beehiivSubscriberId) {
  return fetchClickTotal(beehiivSubscriberId);
}

async function reconcileSubscriber(sub) {
  // Compare against ALL logged clicks, not just the ones that earned points —
  // beehiiv's total_clicked (confirmed via a real API call) counts every
  // click regardless of our daily cap, so this needs to match that, or
  // every subscriber who ever hit the cap would show a false discrepancy.
  const ourCount = db.prepare(
    "SELECT COUNT(*) AS n FROM click_log WHERE subscriber_id = ?"
  ).get(sub.id).n;

  const beehiivCount = await fetchBeehiivClickTotal(sub.beehiiv_subscriber_id);
  const discrepancy = beehiivCount - ourCount;

  db.prepare(
    `INSERT INTO reconciliation_log
      (subscriber_id, beehiiv_reported_clicks, our_recorded_clicks, discrepancy, corrected)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sub.id, beehiivCount, ourCount, discrepancy, 0);

  // Deliberately NOT auto-correcting points here — a discrepancy could also
  // mean a webhook double-fired on our side, not just a missed one. Flag it
  // in reconciliation_log and review before adjusting anyone's points/streak.
  return { subscriberId: sub.id, beehiivCount, ourCount, discrepancy };
}

async function runNightlyReconciliation() {
  const subs = db.prepare("SELECT * FROM subscribers").all();
  const results = [];
  for (const sub of subs) {
    try {
      results.push(await reconcileSubscriber(sub));
    } catch (err) {
      console.error(`Reconciliation failed for subscriber ${sub.id}:`, err.message);
    }
  }
  const flagged = results.filter(r => r.discrepancy !== 0);
  console.log(`Reconciliation complete: ${results.length} checked, ${flagged.length} with discrepancies.`);
  return results;
}

module.exports = { runNightlyReconciliation, reconcileSubscriber };
