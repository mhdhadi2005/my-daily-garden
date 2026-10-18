const { db } = require("../db");
const { creditGarden, readGarden } = require("../v2/garden");

// Controlled count reports only: Beehiiv's exact counter contract is not yet proven.

function initDailyReports() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS v2_daily_reports (
      reader_id TEXT NOT NULL,
      report_day TEXT NOT NULL,
      status TEXT NOT NULL,
      open_total INTEGER,
      click_total INTEGER,
      opens_credited INTEGER NOT NULL DEFAULT 0,
      clicks_credited INTEGER NOT NULL DEFAULT 0,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      click_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (reader_id, report_day)
    );
    CREATE TABLE IF NOT EXISTS v2_last_seen (
      reader_id TEXT PRIMARY KEY,
      points INTEGER NOT NULL CHECK (points >= 0),
      tree_count INTEGER NOT NULL CHECK (tree_count >= 0),
      seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function saveFailed(readerId, day, prior) {
  db.prepare(`INSERT OR REPLACE INTO v2_daily_reports
    (reader_id, report_day, status, click_streak, best_streak)
    VALUES (?, ?, 'failed', ?, ?)`).run(readerId, day, prior?.click_streak || 0, prior?.best_streak || 0);
  return toResult(db.prepare(`SELECT * FROM v2_daily_reports
    WHERE reader_id = ? AND report_day = ?`).get(readerId, day));
}

function applyDailyReport({ readerId, day, openTotal, clickTotal, active, readFailed }) {
  const parsedDay = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? Date.parse(`${day}T00:00:00Z`) : NaN;
  if (typeof readerId !== "string" || !readerId.trim() || readerId.length > 255 ||
      !Number.isFinite(parsedDay) || new Date(parsedDay).toISOString().slice(0, 10) !== day ||
      (readFailed !== undefined && typeof readFailed !== "boolean")) {
    throw new TypeError("invalid daily report");
  }
  const previous = db.prepare(`SELECT report_day FROM v2_daily_reports
    WHERE reader_id = ? ORDER BY report_day DESC LIMIT 1`).get(readerId);
  if (previous && day < previous.report_day) throw new RangeError("out-of-order daily report");
  const existing = db.prepare(`SELECT * FROM v2_daily_reports
    WHERE reader_id = ? AND report_day = ?`).get(readerId, day);
  if (existing && (existing.status !== "failed" || readFailed)) return toResult(existing);
  const prior = db.prepare(`SELECT * FROM v2_daily_reports
    WHERE reader_id = ? AND status != 'failed' ORDER BY report_day DESC LIMIT 1`).get(readerId);
  if (readFailed) return saveFailed(readerId, day, prior);
  if (typeof active !== "boolean") {
    throw new TypeError("invalid daily report");
  }
  if (!Number.isSafeInteger(openTotal) || openTotal < 0 ||
      !Number.isSafeInteger(clickTotal) || clickTotal < 0) {
    return saveFailed(readerId, day, prior);
  }
  const openDelta = prior ? openTotal - prior.open_total : 0;
  const clickDelta = prior ? clickTotal - prior.click_total : 0;
  if (openDelta < 0 || clickDelta < 0) return saveFailed(readerId, day, prior);
  const opensCredited = active ? openDelta : 0;
  const clicksCredited = active ? Math.min(clickDelta, 5) : 0;
  const gap = prior ? Math.round((Date.parse(`${day}T00:00:00Z`) -
    Date.parse(`${prior.report_day}T00:00:00Z`)) / 86400000) - 1 : 0;
  const failedDays = gap > 0 ? db.prepare(`SELECT COUNT(*) AS count FROM v2_daily_reports
    WHERE reader_id = ? AND status = 'failed' AND report_day > ? AND report_day < ?`)
    .get(readerId, prior.report_day, day).count : 0;
  const continued = prior && gap === failedDays;
  const clickStreak = clicksCredited > 0 ? (continued ? prior.click_streak : 0) + 1 : 0;
  const pointsAwarded = opensCredited * 2 + clicksCredited * 10 +
    (clickStreak > 0 && clickStreak % 7 === 0 ? 5 : 0);
  if (!Number.isSafeInteger(pointsAwarded)) throw new RangeError("daily points exceed safe integer range");
  const result = {
    readerId, day,
    status: !active ? "inactive" : !prior ? "baseline" : pointsAwarded > 0 ? "credited" : "quiet",
    openTotal, clickTotal,
    opensCredited, clicksCredited, pointsAwarded, clickStreak,
    bestStreak: Math.max(prior?.best_streak || 0, clickStreak),
  };
  if (pointsAwarded > 0) creditGarden(readerId, `daily:${day}`, pointsAwarded);
  db.prepare(`INSERT OR REPLACE INTO v2_daily_reports
    (reader_id, report_day, status, open_total, click_total,
      opens_credited, clicks_credited, points_awarded, click_streak, best_streak)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    readerId, day, result.status, openTotal, clickTotal,
    opensCredited, clicksCredited, pointsAwarded, clickStreak, result.bestStreak
  );
  return result;
}

function toResult(row) {
  return {
    readerId: row.reader_id, day: row.report_day, status: row.status,
    openTotal: row.open_total, clickTotal: row.click_total,
    opensCredited: row.opens_credited, clicksCredited: row.clicks_credited,
    pointsAwarded: row.points_awarded, clickStreak: row.click_streak,
    bestStreak: row.best_streak,
  };
}

function readDailyStats(readerId) {
  if (typeof readerId !== "string" || !readerId.trim() || readerId.length > 255) {
    throw new TypeError("invalid reader");
  }
  const latest = db.prepare(`SELECT report_day, status FROM v2_daily_reports
    WHERE reader_id = ? ORDER BY report_day DESC LIMIT 1`).get(readerId);
  const observed = db.prepare(`SELECT report_day, open_total, click_total, click_streak, best_streak
    FROM v2_daily_reports WHERE reader_id = ? AND status != 'failed'
    ORDER BY report_day DESC LIMIT 1`).get(readerId);
  const first = observed && db.prepare(`SELECT MIN(report_day) AS day FROM v2_daily_reports
    WHERE reader_id = ? AND status != 'failed'`).get(readerId);
  return {
    available: !!observed,
    opens: observed?.open_total ?? null,
    clicks: observed?.click_total ?? null,
    currentStreak: observed?.click_streak ?? null,
    bestStreak: observed?.best_streak ?? null,
    coverage: {
      firstObservedDay: first?.day ?? null,
      asOfDay: observed?.report_day ?? null,
      lastReportDay: latest?.report_day ?? null,
      lastReportStatus: latest?.status ?? null,
      historyStartKnown: false,
    },
  };
}

function readLastSeen(readerId) {
  if (typeof readerId !== "string" || !readerId.trim() || readerId.length > 255) {
    throw new TypeError("invalid reader");
  }
  const row = db.prepare(`SELECT points, tree_count AS treeCount, seen_at AS seenAt
    FROM v2_last_seen WHERE reader_id = ?`).get(readerId);
  return row || null;
}

function ackLastSeen(readerId, { points, treeCount } = {}) {
  if (typeof readerId !== "string" || !readerId.trim() || readerId.length > 255 ||
      !Number.isSafeInteger(points) || points < 0 ||
      !Number.isSafeInteger(treeCount) || treeCount < 0) {
    throw new TypeError("invalid viewed garden");
  }
  const garden = readGarden(readerId);
  if (!garden || points > garden.points ||
      treeCount !== garden.trees.filter((tree) => tree.threshold <= points).length) {
    throw new RangeError("viewed garden exceeds earned growth");
  }
  db.prepare(`INSERT INTO v2_last_seen (reader_id, points, tree_count) VALUES (?, ?, ?)
    ON CONFLICT (reader_id) DO UPDATE SET
      points = excluded.points, tree_count = excluded.tree_count, seen_at = datetime('now')
    WHERE excluded.points > v2_last_seen.points`).run(readerId, points, treeCount);
  return readLastSeen(readerId);
}

module.exports = { initDailyReports, applyDailyReport, readDailyStats, readLastSeen, ackLastSeen };
