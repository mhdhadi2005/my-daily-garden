# My Daily Garden: changes and evidence for the pilot assessment

Response to "My Daily Garden: proportionate risk assessment for 10almonds.com" (20 November 2026), which reviewed commit `8f09f9b` and plugin ZIP 1.0.0.

- Branch: `pilot-security-fixes` (not deployed; nothing on the live site has changed).
- Plugin: `wordpress-plugin/my-daily-garden.zip`, version 1.1.0, SHA-256 `77486d494e2502b20efbd4c1fc6a0c6b07083bfd45a04b45f8e9d054ed3fa9a7`.
- Re-run the checks: `node src/pilot-checks.js` (50 checks; starts throwaway servers on temporary databases, touches nothing else).

## The six requirements

| Requirement | What changed | Evidence |
|---|---|---|
| 1. Private garden access | Private routes take only a signed 12-hour pass, in the `X-Garden-Pass` header; the path says `me`. Raw subscriber IDs are refused everywhere, newsletter links included: each reader now has a long random `garden_token`, and newsletters link to `/?t=<token>` (beehiiv custom field `garden_link`), which is swapped for a pass. Old `?subscriber=` links show "use the link in your latest newsletter". | pilot-checks section 1: two readers; a raw ID, an unsigned request, a modified pass, a made-up pass and an expired pass are all refused; Bob's ID with Alice's pass still only shows Alice's garden; visit, move, water and harvest refuse raw IDs. Browser: personal link opens the garden; old link and made-up link show a message. |
| 2. Authentication stays on | Every "secret missing → allow in development" path removed: WordPress, beehiiv and store webhooks, and the admin seed route refuse all requests when their secret isn't set, locally too. | pilot-checks section 2: a server with no secrets refuses 8 kinds of request; with secrets, unsigned and wrongly signed requests are refused. Live: `WP_APP_SHARED_SECRET` and `BEEHIIV_WEBHOOK_SECRET` are set. |
| 3. Safe account linking | Email is never used to pick a garden, and the plugin no longer sends it. Accounts are linked by hand for verified participants (`src/scripts/link-wp-user.js`), which refuses conflicts and ambiguity. The WooCommerce email-lookup linking is off unless `WP_LINK_BY_EMAIL=1`. | pilot-checks section 3: an unlinked account with a matching email gets no garden; a second garden on one account, moving a linked garden, and an email shared by two gardens are all refused. |
| 4. Order completion protected | Purchase points are off until switched on in the plugin settings. When on, order completion only queues a background job (Action Scheduler if present, else WP-Cron); the job sends with up to 5 attempts, spaced further apart, checks the reply, and uses `wc_<order id>` so a retry can't count twice. | pilot-checks sections 4 and 5: an order counts once; retries, guests, unlinked customers, free orders and other currencies earn nothing; the plugin source queues instead of sending, limits retries, and never queues guests or unlinked customers. **Not yet run inside WordPress** (see below). |
| 5. Data and access | Opening the garden sends only the WordPress user ID. A purchase sends user ID, order number, total and currency, and only for linked participants (no email, address, products or payment data). The garden has no WooCommerce API keys (`WC_CONSUMER_*` unset on the live server). Data record below. | pilot-checks section 5 reads the exact payloads from the plugin source. |
| 6. Recoverable progress | SQLite on a persistent Railway volume (`/data`, `DB_PATH`). Backups: manual (Railway's plan has no volume backups), procedure in README. `src/scripts/restore-check.js` restores a backup into an isolated server and opens a garden through the new link flow. | A live backup (22 Nov 2026, 94,208 bytes, checksum verified) restored in isolation: test reader `harry_test_reader` came back with 520 points, Ripening Almonds, a 4-day streak and 5 trees, matching the live data. |

## Small fixes

- Garden address must be `https://`; requests use `wp_safe_remote_post`.
- Public demo caps the forest at 12 trees (the slider goes to 9).
- Deactivation removes all queued jobs (`as_unschedule_all_actions`, `wp_unschedule_hook`), whatever order they were for.
- The database files under `mdg-zip/data/` held one made-up reader (`test@example.com`, from the smoke test). Removed from the repository, and `*.db` files are now ignored.
- Every response sends `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: frame-ancestors 'self' https://10almonds.com https://*.10almonds.com`. The plugin's frame is sandboxed (`allow-scripts allow-same-origin`) and sends no referrer. The pass travels after `#`, so it never reaches a server log, and the page removes it from its own address once read.

## Data record (pilot)

- **Shared with the garden server:** newsletter opens and clicks (from beehiiv: subscriber ID, email, link); from WordPress, the user ID of linked participants and, if purchase points are on, their order number, total and currency.
- **Stored:** the subscriber ID, email, points, streak, forest layout, and logs of opens, clicks and purchases. The click log keeps link URLs, which can hint at a reader's interests: treat it with care.
- **Where:** Railway (US West, San Francisco region), one server with a persistent volume. For Australian privacy law, this is a cross-border disclosure to be covered in the privacy notice.
- **Who can access it:** the Railway project and GitHub repository owner (Hadi), plus the WordPress administrator for the plugin settings and secret. The secret lives only in Railway's variables and the plugin settings.
- **Kept:** for as long as the reader takes part. Deletion requests are handled by hand: `node src/scripts/delete-reader.js <subscriber-id> --yes` removes the reader and every record tied to them (tested on a copy of the live database). Backups taken earlier still hold the data until they're deleted.
- **Purchases before joining** don't earn points later ("points start when you join").

## Stopping and rolling back

Deactivate the plugin: it stops sending and clears its queued jobs, and the account tab disappears. To pause only purchase points, untick them in Settings → My Daily Garden. If the secret may have leaked, set a new `WP_APP_SHARED_SECRET` on Railway and in the plugin settings: every existing pass stops working at once. Data already sent stays on the garden server until deleted.

## Not yet verified

- **The PHP has not been run.** This machine has no PHP and no WordPress, so activation, the settings page, the account tab, Action Scheduler queuing, and "order completes while the garden is down" still need a short staging check, as the assessment suggests. Look for the older WPCode connector snippet too: it was never installed, but confirm it.
- **Newsletter links:** the `garden_link` custom field must be created in beehiiv, the newsletter template must use `{{garden_link}}`, and `src/scripts/sync-garden-links.js` must run once after deploying.
- **Currency:** set `PURCHASE_CURRENCY` to the shop's currency before switching purchase points on.
- **Backups:** no automatic schedule; agree who takes them and how often (or upgrade the Railway plan for volume backups).
