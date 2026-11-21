const { db, newGardenToken } = require("../db");
const {
  POINTS_PER_CLICK, DAILY_CLICK_CAP, OPEN_BONUS_POINTS, QUIZ_CORRECT_BONUS,
  REFERRAL_BONUS_POINTS,
  stageForPoints, pointsForPurchase, STAGES, rollReward, todayStr, daysBetween,
} = require("./config");

const { syncSubscriberStats } = require("../integrations/beehiiv");

// Both integrations are best-effort side effects, not part of the critical
// path: a subscriber's points/streak/reward are already saved before either
// of these run, so a WooCommerce hiccup or a beehiiv API blip should never
// cause a webhook to fail or a click to go unrecorded. Fire-and-forget with
// its own error handling, on purpose.
function syncInBackground(sub, newStage) {
  // (Readers are never linked to shop accounts by email: an address nobody
  // has verified isn't proof of who someone is. Linking is done by hand.)
  const fields = { streak: sub.streak, points: sub.points, tree_stage: STAGES[newStage].name };
  const link = gardenLink(sub);
  if (link) fields.garden_link = link; // newsletters link to the garden with {{garden_link}}
  syncSubscriberStats(sub.beehiiv_subscriber_id, fields).catch((err) => {
    console.warn(`beehiiv sync skipped for subscriber ${sub.id}:`, err.message);
  });
}

// A reader's personal garden link: the garden's address plus their secret token.
const APP_URL = (process.env.PUBLIC_APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3001")).replace(/\/$/, "");
function gardenLink(sub) {
  return sub && sub.garden_token ? `${APP_URL}/?t=${sub.garden_token}` : null;
}

function getOrCreateSubscriber(beehiivSubscriberId, email) {
  let sub = db.prepare("SELECT * FROM subscribers WHERE beehiiv_subscriber_id = ?").get(beehiivSubscriberId);
  if (!sub) {
    const info = db.prepare(
      "INSERT INTO subscribers (beehiiv_subscriber_id, email, garden_token) VALUES (?, ?, ?)"
    ).run(beehiivSubscriberId, email || "", newGardenToken());
    sub = db.prepare("SELECT * FROM subscribers WHERE id = ?").get(info.lastInsertRowid);
  }
  return sub;
}

function clicksToday(subscriberId) {
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM click_log
     WHERE subscriber_id = ? AND counted = 1 AND date(clicked_at) = date('now')`
  ).get(subscriberId);
  return row.n;
}

function updateStreak(sub) {
  const today = todayStr();
  if (sub.last_engaged_date === today) {
    // already engaged today, streak unchanged
    return { streak: sub.streak, longest_streak: sub.longest_streak };
  }
  let newStreak;
  if (!sub.last_engaged_date) {
    newStreak = 1;
  } else {
    const gap = daysBetween(sub.last_engaged_date, today);
    newStreak = gap === 1 ? sub.streak + 1 : 1; // consecutive day continues streak, any gap resets it
  }
  const longest = Math.max(sub.longest_streak, newStreak);
  return { streak: newStreak, longest_streak: longest };
}

/**
 * Called from the beehiiv Click Trigger webhook whenever a subscriber
 * clicks a real article link (not the quiz links — see recordQuizAnswer).
 */
function recordClick({ beehiivSubscriberId, email, linkUrl, linkId }) {
  const sub = getOrCreateSubscriber(beehiivSubscriberId, email);
  const alreadyToday = clicksToday(sub.id);
  const counted = alreadyToday < DAILY_CLICK_CAP ? 1 : 0;

  db.prepare(
    "INSERT INTO click_log (subscriber_id, link_url, link_id, counted) VALUES (?, ?, ?, ?)"
  ).run(sub.id, linkUrl || null, linkId || null, counted);

  if (!counted) {
    return { subscriber: sub, pointsAwarded: 0, cappedForToday: true, stageChanged: false, reward: null };
  }

  const prevStage = stageForPoints(sub.points);
  const newPoints = sub.points + POINTS_PER_CLICK;
  const newStage = stageForPoints(newPoints);
  const { streak, longest_streak } = updateStreak(sub);
  const today = todayStr();
  const wasNewEngagedDay = sub.last_engaged_date !== today;

  const reward = rollReward();
  if (reward) {
    db.prepare("INSERT INTO reward_log (subscriber_id, reward_type) VALUES (?, ?)").run(sub.id, reward);
  }

  db.prepare(
    `UPDATE subscribers SET
      points = ?, streak = ?, longest_streak = ?, last_engaged_date = ?,
      total_engaged_days = total_engaged_days + ?
     WHERE id = ?`
  ).run(newPoints, streak, longest_streak, today, wasNewEngagedDay ? 1 : 0, sub.id);

  const updatedSub = { ...sub, points: newPoints, streak, longest_streak };
  syncInBackground(updatedSub, newStage);

  return {
    subscriber: updatedSub,
    pointsAwarded: POINTS_PER_CLICK,
    cappedForToday: false,
    stageChanged: newStage > prevStage,
    newStage,
    reward,
  };
}

/**
 * Called from the beehiiv "Email Opened" webhook.
 * Deliberately does NOT touch streak or tree growth — see the plan doc
 * for why (Apple Mail Privacy Protection inflates opens).
 */
function recordOpen({ beehiivSubscriberId, email }) {
  const sub = getOrCreateSubscriber(beehiivSubscriberId, email);
  // Only the first open of the day earns points: beehiiv can fire the same
  // automation more than once, and opens shouldn't be farmable.
  const openedToday = db.prepare("SELECT 1 FROM open_log WHERE subscriber_id = ? AND date(opened_at) = date('now')").get(sub.id);
  db.prepare("INSERT INTO open_log (subscriber_id) VALUES (?)").run(sub.id);
  if (openedToday) return { subscriber: sub, pointsAwarded: 0, counted: false };
  const newPoints = sub.points + OPEN_BONUS_POINTS;
  db.prepare("UPDATE subscribers SET points = ? WHERE id = ?").run(newPoints, sub.id);
  return { subscriber: { ...sub, points: newPoints }, pointsAwarded: OPEN_BONUS_POINTS };
}

/**
 * Called when a subscriber clicks one of the two "which one is real?"
 * mini-quiz links. Only the correct-answer link should invoke this with
 * correct=true; the incorrect link can just redirect without calling this,
 * or call it with correct=false purely for response-rate logging.
 */
function recordQuizAnswer({ beehiivSubscriberId, email, quizId, correct }) {
  const sub = getOrCreateSubscriber(beehiivSubscriberId, email);
  // One answer per quiz counts; repeats (or a second try) earn nothing.
  if (db.prepare("SELECT 1 FROM quiz_response_log WHERE subscriber_id = ? AND quiz_id = ?").get(sub.id, String(quizId))) {
    return { subscriber: sub, pointsAwarded: 0, counted: false };
  }
  db.prepare(
    "INSERT INTO quiz_response_log (subscriber_id, quiz_id, correct) VALUES (?, ?, ?)"
  ).run(sub.id, quizId, correct ? 1 : 0);

  if (!correct) return { subscriber: sub, pointsAwarded: 0 };

  const newPoints = sub.points + QUIZ_CORRECT_BONUS;
  db.prepare("UPDATE subscribers SET points = ? WHERE id = ?").run(newPoints, sub.id);
  return { subscriber: { ...sub, points: newPoints }, pointsAwarded: QUIZ_CORRECT_BONUS };
}

/**
 * Called when a subscriber purchases a product (via store / WooCommerce webhook).
 */
function recordPurchase({ beehiivSubscriberId, email, orderId, amount }) {
  const sub = getOrCreateSubscriber(beehiivSubscriberId, email);
  try {
    db.prepare("INSERT INTO purchase_log (subscriber_id, order_id, amount) VALUES (?, ?, ?)")
      .run(sub.id, orderId || null, amount ? Number(amount) : null);
  } catch (err) {
    // The order is already in the log (the unique index): never credit it twice.
    return { subscriber: sub, pointsAwarded: 0, stageChanged: false, newStage: stageForPoints(sub.points), duplicate: true };
  }

  const pointsAwarded = pointsForPurchase(amount);
  const prevStage = stageForPoints(sub.points);
  const newPoints = sub.points + pointsAwarded;
  const newStage = stageForPoints(newPoints);

  db.prepare("UPDATE subscribers SET points = ? WHERE id = ?").run(newPoints, sub.id);

  const updatedSub = { ...sub, points: newPoints };
  syncInBackground(updatedSub, newStage);

  return {
    subscriber: updatedSub,
    pointsAwarded,
    stageChanged: newStage > prevStage,
    newStage,
  };
}

/**
 * Credits any referrals this subscriber has made that we haven't paid for yet.
 *
 * `totalReferrals` is the live count from beehiiv. We store how many we've
 * already credited, so only the difference earns points — this is safe to run
 * as often as you like, and re-running it right away is a no-op.
 *
 * Referrals never decrease someone's points: if the count drops (an unsubscribe
 * turning a referral inactive), already-awarded points stay awarded.
 */
function creditReferrals({ subscriber, totalReferrals }) {
  const alreadyCredited = subscriber.referrals_credited || 0;
  const newReferrals = totalReferrals - alreadyCredited;

  if (newReferrals <= 0) {
    return { subscriber, pointsAwarded: 0, newReferrals: 0, stageChanged: false };
  }

  const prevStage = stageForPoints(subscriber.points);
  const pointsAwarded = newReferrals * REFERRAL_BONUS_POINTS;
  const newPoints = subscriber.points + pointsAwarded;
  const newStage = stageForPoints(newPoints);

  for (let n = alreadyCredited + 1; n <= totalReferrals; n++) {
    db.prepare(
      "INSERT INTO referral_log (subscriber_id, referral_number, points_awarded) VALUES (?, ?, ?)"
    ).run(subscriber.id, n, REFERRAL_BONUS_POINTS);
  }

  db.prepare("UPDATE subscribers SET points = ?, referrals_credited = ? WHERE id = ?")
    .run(newPoints, totalReferrals, subscriber.id);

  const updatedSub = { ...subscriber, points: newPoints, referrals_credited: totalReferrals };
  syncInBackground(updatedSub, newStage);

  return {
    subscriber: updatedSub,
    pointsAwarded,
    newReferrals,
    stageChanged: newStage > prevStage,
    newStage,
  };
}

module.exports = {
  gardenLink,
  getOrCreateSubscriber,
  recordClick,
  recordOpen,
  recordQuizAnswer,
  recordPurchase,
  creditReferrals,
};

