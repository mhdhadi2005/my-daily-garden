# My Daily Garden — Backend

Implements the mechanics from the plan doc: click-driven almond tree growth,
equal-weight clicks with a daily cap, open bonus points, the mini-quiz
mechanic, streaks, reward rolls, beehiiv sync-back, the 3D forest, and the
WordPress plugin (garden on the account page, optional purchase points).

## What's built and working right now

- **Database** (`src/db/schema.sql`) — subscribers, click_log, open_log,
  quiz_response_log, reward_log, reconciliation_log. SQLite for local dev
  (via Node's built-in `node:sqlite`, so no compiler/build tools needed);
  the SQL is plain enough to move to Postgres with no rewrites later.
- **Engine** (`src/engine/`) — scoring rules live in `config.js` so you can
  tune numbers (points per click, daily cap, reward odds, stage thresholds)
  without touching logic code. `index.js` has recordClick / recordOpen /
  recordQuizAnswer, recordPurchase, the streak math, and the beehiiv
  sync-back after every scored click.
- **Webhook routes** (`src/routes/webhooks.js`) — the two endpoints beehiiv's
  automations call: one for Click Triggers, one for Email Opened.
- **WordPress routes** (`src/routes/wp-auth.js`) — what the WordPress plugin
  calls, server to server, after WordPress has checked who's logged in:
  `/api/wp/session` (a short-lived signed pass to the garden linked to that
  WordPress account), `/api/wp/purchase` (points for a linked participant's
  completed order, once per order), `/api/wp/ping` (the plugin's connection
  check) and `/api/wp/tree-status`. Every request carries a fresh request ID
  and is signed and timestamped with `WP_APP_SHARED_SECRET`, so it can't be
  forged or replayed. Passes (`src/engine/pass.js`) are the only way into a
  private garden route.
- **WordPress plugin** (`wordpress-plugin/my-daily-garden/`) — the only code
  on the WordPress site. Adds a "My Garden" tab to the WooCommerce account
  page and a `[my_daily_garden]` shortcode that show the reader's garden in a
  frame, a settings page for the shared secret, and purchase points. Zip the
  folder (or use `wordpress-plugin/my-daily-garden.zip`) and upload it under
  Plugins → Add New.
- **beehiiv client** (`src/integrations/beehiiv.js`) — pushes streak/points/
  stage back to beehiiv as custom fields after each click, and provides the
  click-total lookup the reconciliation job uses.
- **Reconciliation job** (`src/jobs/reconciliation.js`) — nightly check
  against beehiiv's own reported click totals, now wired to the real client
  above instead of a stub.
- **Garden API** (`src/routes/tree.js`) — `GET /api/tree/me` and the forest,
  visit and harvest actions, all with the reader's pass in `X-Garden-Pass`.

## What's proven to work

Ran the smoke test (`npm test`) simulating a subscriber opening an email,
clicking articles, answering the mini-quiz, and firing 6 rapid clicks to
confirm the daily cap holds at 5 — passes cleanly, including with
beehiiv unconfigured (logs a warning and moves on, doesn't
crash — this matters because it means the app keeps working correctly even
before every credential is wired up). Also started the real server and hit
the click webhook and the new `/api/wp/tree-status` endpoint over HTTP to
confirm the full loop, including the "no account linked yet" response.

Run it yourself:
```
npm install
npm test      # logic test, no server needed
npm start     # starts the real server on :3001
```

## What's still needed before this can go live

1. **beehiiv API key + publication ID + webhook secret** — from the beehiiv
   dashboard (Settings → API, plus setting up the actual Click Trigger /
   Email Opened automations pointing at this app's webhook URLs once
   deployed).
2. **No WooCommerce API keys.** The garden doesn't need them: purchases come
   from the plugin, signed.
3. **A shared secret for the WordPress connector** — any long random string,
   set as `WP_APP_SHARED_SECRET` here and pasted into the plugin's settings
   page (Settings → My Daily Garden). Treat it like a password.
4. **Hosting** — this only runs locally right now. Needs a deploy target
   (Railway/Render both work well for an app like this) before beehiiv or
   WordPress can actually reach it.
5. A quick sanity check of the exact beehiiv and WooCommerce API response
   shapes against live data once keys are in — the integration code is
   written against their current documented formats, but it's worth
   confirming nothing's shifted before relying on it in production.

## Access, linking and pilot operations

**Who can open a garden.** The private garden routes (`/api/tree/me…`) accept
only a signed, 12-hour pass in the `X-Garden-Pass` header. A raw subscriber ID
is refused. Passes come from:
- a reader's personal newsletter link, `/#t=<garden_token>` (after the `#`, so
  it isn't sent to servers or written to their logs). Each reader has a
  long random `garden_token`; put the custom field `garden_link` in beehiiv
  (Audience → Custom fields), use `{{garden_link}}` as the garden link in the
  newsletter, and run `node src/scripts/sync-garden-links.js` once to fill it
  for existing readers (new readers get it automatically);
- the WordPress plugin, for accounts linked to a garden. The plugin puts the
  pass after `#` in the frame's address, so it never reaches a server log.

**Linking accounts.** By hand, for verified participants:
`node src/scripts/link-wp-user.js <subscriber-id> <wordpress-user-id>` (add
`--unlink` to undo). Emails are never used to pick a garden; conflicting or
ambiguous links are refused.

**Secrets are required.** Without `WP_APP_SHARED_SECRET` or
`BEEHIIV_WEBHOOK_SECRET`, the matching endpoints refuse every request, locally
too. Passes are signed with their own `GARDEN_PASS_SECRET` (32+ characters),
so the WordPress secret can't be used to make them. The garden has no
WooCommerce API keys and doesn't need any. The old store purchase webhook and admin seed route are gone.

**Changing a secret, and what it affects:**

| Secret | Replacing it affects | Also update |
|---|---|---|
| `BEEHIIV_WEBHOOK_SECRET` | Newsletter open/click webhooks | The `X-MDG-Secret` header in every beehiiv automation |
| `WP_APP_SHARED_SECRET` | WordPress → garden requests (opening the garden, purchases) | Settings → My Daily Garden in WordPress |
| `GARDEN_PASS_SECRET` | Every garden pass already issued stops working once the server restarts with the new key | Nothing else; readers just reopen their garden |
| One reader's garden token (`rotate-garden-token.js`) | Their old personal link stops working; a pass already issued from it lasts until it expires (up to 12 hours) | Run `sync-garden-links.js` so newsletters carry the new link |

**If a reader's link leaks:** `node src/scripts/rotate-garden-token.js
<subscriber-id>` gives them a new one (then run `sync-garden-links.js`).

**Purchase points** are off in the plugin until switched on. Only linked
participants' orders are sent (user ID, order number, total, currency), from a
background job; each order counts once; free orders earn nothing; set
`PURCHASE_CURRENCY` (e.g. `AUD`) to ignore other currencies.

**Checks.** `node src/pilot-checks.js` starts throwaway servers on temporary
databases and checks the access, secret, linking and purchase rules (it
doesn't touch your data). Don't run `npm test` against a database you want to
keep: it deletes `data/garden.db` first.

**Backups.** The live database is SQLite on a Railway volume (`/data`,
`DB_PATH`). To take a copy: pipe a script that runs
`VACUUM INTO '/tmp/garden-backup.db'` and prints the file as base64 through
`railway ssh -- node -`, then decode it locally. To prove a backup restores:
`node src/scripts/restore-check.js <backup.db> <subscriber-id>`.

**Stopping it.** Deactivating the WordPress plugin stops everything it sends
and removes its queued jobs; unticking purchase points pauses only those.

## Environment variables

Copy `.env.example` to `.env` and fill in as each piece comes online — see
that file for the full list with comments on where each one comes from.

## Config you can tune without touching logic

Everything in `src/engine/config.js`:
- `POINTS_PER_CLICK` (currently 10, flat for all clicks per Harry's call)
- `DAILY_CLICK_CAP` (currently 5)
- `OPEN_BONUS_POINTS` (currently 2)
- `QUIZ_CORRECT_BONUS` (currently 15)
- `STAGES` — the 9 almond tree stages and the point thresholds between them
- `REWARD_TABLE` — real odds from the spec (not the boosted demo odds used
  in the front-end prototypes)
