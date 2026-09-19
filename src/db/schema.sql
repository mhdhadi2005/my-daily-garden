-- My Daily Garden — schema
-- SQLite for local dev; column types translate directly to Postgres for production
-- (INTEGER PRIMARY KEY -> SERIAL, TEXT -> TEXT/VARCHAR, no other changes needed)

CREATE TABLE IF NOT EXISTS subscribers (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  beehiiv_subscriber_id TEXT UNIQUE NOT NULL,
  email               TEXT NOT NULL,
  wp_user_id          INTEGER,              -- NULL until linked to a WordPress account
  points              INTEGER NOT NULL DEFAULT 0,
  streak              INTEGER NOT NULL DEFAULT 0,
  longest_streak      INTEGER NOT NULL DEFAULT 0,
  last_engaged_date   TEXT,                 -- 'YYYY-MM-DD', last day with >=1 qualifying click
  total_engaged_days   INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS click_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  link_url       TEXT,
  link_id        TEXT,                      -- beehiiv's link identifier, if provided
  counted        INTEGER NOT NULL DEFAULT 1, -- 0 if it hit the daily cap and didn't earn points
  clicked_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS open_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  opened_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_response_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  quiz_id        TEXT NOT NULL,
  correct        INTEGER NOT NULL,          -- 1 or 0
  answered_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reward_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  reward_type    TEXT NOT NULL,             -- butterfly | bird | rare_seed | golden_can | rainbow | legendary
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reconciliation_log (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at                TEXT NOT NULL DEFAULT (datetime('now')),
  subscriber_id         INTEGER NOT NULL REFERENCES subscribers(id),
  beehiiv_reported_clicks INTEGER,
  our_recorded_clicks   INTEGER,
  discrepancy           INTEGER,
  corrected             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_click_log_subscriber_date ON click_log(subscriber_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_open_log_subscriber_date ON open_log(subscriber_id, opened_at);

CREATE TABLE IF NOT EXISTS purchase_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id  INTEGER NOT NULL REFERENCES subscribers(id),
  order_id       TEXT,
  amount         REAL,
  purchased_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchase_log_subscriber ON purchase_log(subscriber_id);


-- ── Forest / Prestige System ──────────────────────────────────────────────────
-- Each row = one completed tree harvest (prestige cycle)
CREATE TABLE IF NOT EXISTS harvests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id       INTEGER NOT NULL REFERENCES subscribers(id),
  harvest_number      INTEGER NOT NULL,           -- 1st, 2nd, 3rd tree, etc.
  points_at_harvest   INTEGER NOT NULL,
  cosmetic_earned     TEXT,                        -- e.g. 'fox', 'gnome_house'
  harvested_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cosmetic items the subscriber has earned across all harvests
CREATE TABLE IF NOT EXISTS forest_cosmetics (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id       INTEGER NOT NULL REFERENCES subscribers(id),
  cosmetic_type       TEXT NOT NULL,              -- e.g. 'fox', 'gnome_house'
  earned_from_harvest INTEGER,                    -- harvest_number it came from
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_harvests_subscriber ON harvests(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_forest_cosmetics_subscriber ON forest_cosmetics(subscriber_id);
