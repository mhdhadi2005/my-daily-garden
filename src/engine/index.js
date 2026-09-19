const { db } = require("../db");
const {
  POINTS_PER_CLICK, DAILY_CLICK_CAP, OPEN_BONUS_POINTS, QUIZ_CORRECT_BONUS,
  stageForPoints, STAGES, rollReward, todayStr, daysBetween,
} = require("./config");
const { linkSubscriberIfPossible } = require("../integrations/woocommerce");
const { syncSubscriberStats } = require("../integrations/beehiiv");

// Both integrations are best-effort side effects, not part of the critical
// path: a subscriber's points/streak/reward are already saved before either
// of these run, so a WooCommerce hiccup or a beehiiv API blip should never
// cause a webhook to fail or a click to go unrecorded. Fire-and-forget with
// its own error handling, on purpose.
function syncInBackground(sub, newStage) {
  linkSubscriberIfPossible(db, sub).catch((err) => {
    console.warn(`WooCommerce link skipped for subscriber ${sub.id}:`, err.message);
  });
  syncSubscriberStats(sub.beehiiv_subscriber_id, {
    streak: sub.streak,
    points: sub.points,
    tree_stage: STAGES[newStage].name,
  }).catch((err) => {
    console.warn(`beehiiv sync skipped for subscriber ${sub.id}:`, err.message);
  });
}

function getOrCreateSubscriber(beehiivSubscriberId, email) {
  let sub = db.prepare("SELECT * FROM subscribers WHERE beehiiv_subscriber_id = ?").get(beehiivSubscriberId);
  if (!sub) {
    const info = db.prepare(
      "INSERT INTO subscribers (beehiiv_subscriber_id, email) VALUES (?, ?)"
    ).run(beehiivSubscriberId, email || "");
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
  db.prepare("INSERT INTO open_log (subscriber_id) VALUES (?)").run(sub.id);
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
  db.prepare(
    "INSERT INTO quiz_response_log (subscriber_id, quiz_id, correct) VALUES (?, ?, ?)"
  ).run(sub.id, quizId, correct ? 1 : 0);

  if (!correct) return { subscriber: sub, pointsAwarded: 0 };

  const newPoints = sub.points + QUIZ_CORRECT_BONUS;
  db.prepare("UPDATE subscribers SET points = ? WHERE id = ?").run(newPoints, sub.id);
  return { subscriber: { ...sub, points: newPoints }, pointsAwarded: QUIZ_CORRECT_BONUS };
}

module.exports = { getOrCreateSubscriber, recordClick, recordOpen, recordQuizAnswer };
