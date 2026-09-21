const { runReferralSweep } = require("./referrals");

// A self-rearming daily timer rather than a cron dependency: the app only
// needs one recurring job, and setTimeout handles a <24h delay fine.
//
// Deliberately in-process. Railway's cron would mean running the service on a
// schedule as a separate job, which for a single always-on web service is more
// moving parts than this is worth.

const SWEEP_HOUR_UTC = Number(process.env.REFERRAL_SWEEP_HOUR_UTC || 3);

function msUntilNextRun(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(SWEEP_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next - now;
}

async function runSweepSafely() {
  // fetchReferralCount throws per subscriber when beehiiv isn't configured,
  // which on a full list would be one error line each. Check once instead.
  if (!process.env.BEEHIIV_API_KEY || !process.env.BEEHIIV_PUBLICATION_ID) {
    console.warn("Referral sweep skipped — BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set.");
    return;
  }
  try {
    await runReferralSweep();
  } catch (err) {
    // Never let a failed sweep take the process down — it retries tomorrow.
    console.error("Referral sweep failed:", err.message);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun();
  setTimeout(async () => {
    await runSweepSafely();
    scheduleNext();
  }, delay).unref?.();

  const at = new Date(Date.now() + delay).toISOString();
  console.log(`Referral sweep scheduled for ${at} (every day at ${SWEEP_HOUR_UTC}:00 UTC)`);
}

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER) {
    console.log("Scheduler disabled via DISABLE_SCHEDULER.");
    return;
  }
  scheduleNext();
}

module.exports = { startScheduler, msUntilNextRun };
