const { db } = require("../db");
const { fetchReferralCount } = require("../integrations/beehiiv");
const { creditReferrals } = require("../engine");

/**
 * Referral sweep: awards points for referrals made through each subscriber's
 * own beehiiv referral link.
 *
 * This is a sweep rather than a webhook because beehiiv doesn't expose "who
 * referred whom" in any event — see fetchReferralCount() for the detail. We
 * ask each subscription how many active referrals it has, and credit whatever
 * we haven't credited before.
 *
 * Costs one API call per subscriber, so it's meant to run on a schedule
 * (nightly is plenty — referral rewards aren't time-sensitive), not per
 * request. Nothing in this app schedules it yet; trigger it via
 * POST /api/jobs/referrals.
 */
async function sweepSubscriber(sub) {
  const totalReferrals = await fetchReferralCount(sub.beehiiv_subscriber_id);
  const result = creditReferrals({ subscriber: sub, totalReferrals });
  return {
    subscriberId: sub.id,
    totalReferrals,
    newReferrals: result.newReferrals,
    pointsAwarded: result.pointsAwarded,
  };
}

// Two sweeps running at once would both read the same referrals_credited
// value and credit the same referrals twice, so only one runs at a time.
let sweepInProgress = false;

async function runReferralSweep() {
  if (sweepInProgress) {
    throw new Error("referral sweep already running");
  }
  sweepInProgress = true;
  try {
    return await sweep();
  } finally {
    sweepInProgress = false;
  }
}

async function sweep() {
  const subs = db.prepare("SELECT * FROM subscribers").all();
  const results = [];
  let failed = 0;

  for (const sub of subs) {
    try {
      results.push(await sweepSubscriber(sub));
    } catch (err) {
      failed++;
      console.error(`Referral sweep failed for subscriber ${sub.id}:`, err.message);
    }
  }

  const credited = results.filter((r) => r.newReferrals > 0);
  const pointsTotal = credited.reduce((sum, r) => sum + r.pointsAwarded, 0);
  console.log(
    `Referral sweep complete: ${results.length} checked, ${credited.length} credited ` +
    `(${pointsTotal} points), ${failed} failed.`
  );

  return { checked: results.length, credited: credited.length, pointsTotal, failed, results };
}

module.exports = { runReferralSweep, sweepSubscriber };
