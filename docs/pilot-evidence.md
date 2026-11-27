# My Daily Garden: changes and evidence for the pilot assessment

Response to "My Daily Garden: proportionate risk assessment for 10almonds.com" (20 November 2026), which reviewed commit `8f09f9b` and plugin ZIP 1.0.0.

- Branch: `pilot-security-fixes` (not deployed; nothing on the live site has changed).
- Plugin: `wordpress-plugin/my-daily-garden.zip`, version 1.1.2, SHA-256 `c4c9ad7bfe763c9d54dcce42a9abb5b76ef122fea82837db5cc4134a8f94837f`.
- Re-run the checks: `node src/pilot-checks.js` (71 checks; starts throwaway servers on temporary databases, from a temp folder so they never read the real `.env`).
- **What the checks prove, and what they don't.** The server checks run the real backend: authentication, garden selection, linking, duplicates, scoring limits and replies, with signed requests built exactly like the plugin builds them (fresh `request_id`). The plugin checks only read its PHP source for the right patterns: they don't run WordPress, activate the plugin, fire its hooks or prove Action Scheduler behaviour. Secret rotation and routine backups can't be proved by checks at all. Those need the WordPress staging check and the operator steps below.
- A second, independent audit was run on these fixes (22 Nov 2026); its findings and what was done about each are at the end.

## The six requirements

| Requirement | What changed | Evidence |
|---|---|---|
| 1. Private garden access | Private routes take only a signed 12-hour pass, in the `X-Garden-Pass` header; the path says `me`. Raw subscriber IDs are refused everywhere, newsletter links included: each reader now has a long random `garden_token`, and newsletters link to `/#t=<token>` (beehiiv custom field `garden_link`), which is swapped for a pass. Old `?subscriber=` links show "use the link in your latest newsletter". | pilot-checks section 1: two readers; a raw ID, an unsigned request, a modified pass, a made-up pass and an expired pass are all refused; Bob's ID with Alice's pass still only shows Alice's garden; visit, move, water and harvest refuse raw IDs. Browser: personal link opens the garden; old link and made-up link show a message. |
| 2. Authentication stays on | Every "secret missing → allow in development" path removed: the WordPress routes and beehiiv webhooks refuse all requests when their secret isn't set, locally too. The old store webhook and admin seed route are deleted. | pilot-checks section 2: a server with no secrets refuses the WordPress and webhook requests; with secrets, unsigned and wrongly signed requests are refused. Live: `WP_APP_SHARED_SECRET` and `BEEHIIV_WEBHOOK_SECRET` are set. |
| 3. Safe account linking | Email is never used to pick a garden, and the plugin no longer sends it. Accounts are linked by hand for verified participants (`src/scripts/link-wp-user.js`), which refuses conflicts and ambiguity. The WooCommerce email-lookup client has been deleted. Checking a participant's identity before linking is the operator's job. | pilot-checks section 3: an unlinked account with a matching email gets no garden; a second garden on one account, moving a linked garden, and an email shared by two gardens are all refused. |
| 4. Order completion protected | Purchase points are off until switched on in the plugin settings. When on, order completion only queues a background job (Action Scheduler if present, else WP-Cron); the job sends with up to 5 attempts, spaced further apart, checks the reply, and uses `wc_<order id>` so a retry can't count twice. | pilot-checks sections 4 and 5: an order counts once; retries, guests, unlinked customers, free orders and other currencies earn nothing; the plugin source queues instead of sending, limits retries, and never queues guests or unlinked customers. **Not yet run inside WordPress** (see below). |
| 5. Data and access | Opening the garden sends only the WordPress user ID (plus a random request ID). A purchase sends user ID, order number, total and currency, and only for linked participants (no email, address, products or payment data). The garden has no WooCommerce API keys and no code that would use them. Data record below. | pilot-checks section 5 reads the exact payloads from the plugin source. |
| 6. Recoverable progress | SQLite on a persistent Railway volume (`/data`, `DB_PATH`). Backups: manual (Railway's plan has no volume backups), procedure in README. `src/scripts/restore-check.js` restores a backup into an isolated server and opens a garden through the new link flow. | A live backup (22 Nov 2026, 94,208 bytes, checksum verified) restored in isolation: test reader `harry_test_reader` came back with 520 points, Ripening Almonds, a 4-day streak and 5 trees, matching the live data. |

## Small fixes

- Garden address must be `https://`; requests use `wp_safe_remote_post`.
- Public demo caps the forest at 12 trees (the slider goes to 9).
- Deactivation removes all queued jobs (`as_unschedule_all_actions`, `wp_unschedule_hook`), whatever order they were for.
- The database files under `mdg-zip/data/` held one made-up reader (`test@example.com`, from the smoke test). Removed from the repository, and `*.db` files are now ignored.
- Every response sends `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: frame-ancestors 'self' https://10almonds.com https://www.10almonds.com https://staging.10almonds.com`. The plugin's frame is sandboxed (`allow-scripts allow-same-origin`) and sends no referrer. The pass travels after `#`, so it never reaches a server log, and the page removes it from its own address once read.

## Data record (pilot)

- **Shared with the garden server:** newsletter opens and clicks (from beehiiv: subscriber ID, email, link); from WordPress, the user ID of linked participants and, if purchase points are on, their order number, total and currency.
- **Stored:** the subscriber ID, email, points, streak, forest layout, and logs of opens, clicks and purchases. The click log keeps link URLs, which can hint at a reader's interests: treat it with care.
- **Where:** Railway (US West, San Francisco region), one server with a persistent volume. For Australian privacy law, this is a cross-border disclosure to be covered in the privacy notice.
- **Who can access it:** the Railway project and GitHub repository owner (Hadi), plus the WordPress administrator for the plugin settings and secret. The secret lives only in Railway's variables and the plugin settings.
- **Kept:** for as long as the reader takes part. Deletion requests are handled by hand: `node src/scripts/delete-reader.js <subscriber-id> --yes` removes the reader and every record tied to them (tested on a copy of the live database). Backups taken earlier still hold the data until they're deleted.
- **Purchases before joining** don't earn points later ("points start when you join").

## Stopping and rolling back

Deactivate the plugin: it stops sending and clears its queued jobs, and the account tab disappears. To pause only purchase points, untick them in Settings → My Daily Garden. Data already sent stays on the garden server until deleted.

If a secret may have leaked, replace the one involved:

| Secret | Replacing it affects | Also update |
|---|---|---|
| `BEEHIIV_WEBHOOK_SECRET` | Newsletter open/click webhooks | The `X-MDG-Secret` header in every beehiiv automation |
| `WP_APP_SHARED_SECRET` | WordPress → garden requests | Settings → My Daily Garden |
| `GARDEN_PASS_SECRET` | Every garden pass already issued stops working once the server restarts with the new key | Nothing; readers reopen their garden |
| One reader's garden token | Their old link stops working; a pass already issued from it lasts until it expires (up to 12 hours) | Run `sync-garden-links.js` |

Individual passes can't be revoked one by one; for a small cosmetic pilot that limit is accepted.

## Not yet verified

- **The PHP has not been run.** This machine has no PHP and no WordPress, so activation, the settings page, the account tab, Action Scheduler queuing, and "order completes while the garden is down" still need a short staging check, as the assessment suggests. Look for the older WPCode connector snippet too: it was never installed, but confirm it.
- **Newsletter links:** the `garden_link` custom field must be created in beehiiv, the newsletter template must use `{{garden_link}}`, and `src/scripts/sync-garden-links.js` must run once after deploying.
- **Currency:** set `PURCHASE_CURRENCY` to the shop's currency before switching purchase points on.
- **Backups:** no automatic schedule; agree who takes them and how often (or upgrade the Railway plan for volume backups).

## Independent audit of these fixes (22 Nov 2026)

A separate reviewer audited this branch from scratch. What it found, and what was done:

| # | Finding | Done |
|---|---|---|
| 1 | **The beehiiv webhook secret was hard-coded in `seed-harry.js`**, committed to the public repository, with a real subscriber's email and ID. Confirmed: it equals the live `BEEHIIV_WEBHOOK_SECRET`. | File deleted. **The secret must be rotated** (Railway variable plus the `X-MDG-Secret` header in each beehiiv automation); until then anyone can send fake click webhooks. The old value stays in git history, harmless once rotated. |
| 2 | Webhook replies returned the whole subscriber record, including the new garden token. | Replies now say only `{ok, pointsAwarded, counted}`. |
| 3 | The old store purchase webhook matched by email and could credit an order three times. | Route deleted; the plugin's signed route is the only purchase path. |
| 4 | Opens and quiz answers could be repeated for points. | One counted open per reader per day; one answer per quiz. |
| 5 | Passes were signed with the WordPress shared secret, which WordPress admins can read. | Passes use their own `GARDEN_PASS_SECRET` (32+ characters). |
| 6 | Newsletter tokens never change. | `src/scripts/rotate-garden-token.js` replaces a leaked link. |
| 7 | A signed WordPress request could be replayed within 60 seconds. | Each signature is accepted once. |
| 8 | The check script loaded the real `.env`. | Servers now run from a temp folder with no `.env`. |
| 9 | Webhook subscriber IDs weren't validated and went unescaped into beehiiv API paths. | Only `sub_<uuid>` is accepted, and IDs are URL-encoded. |
| 10 | The admin seed route reused the beehiiv secret; admin checks weren't constant-time. | Seed route deleted; the jobs route uses a constant-time comparison. |
| 11 | Thin headers; stack traces on bad JSON. | `X-Powered-By` off, HSTS on, `frame-ancestors` limited to 10almonds.com, www and staging, `object-src 'none'`; errors reply in one short line. A full script CSP is left for later (the page uses inline scripts). |
| 12 | One order could credit twice through two gardens; no database constraint. | A unique index on `order_id`, and the duplicate check covers every garden. Refunds don't remove points (pilot rule: correct by hand). |
| 13 | Plugin: no uninstall cleanup; deactivation might leave queued jobs. | `uninstall.php` removes settings, secret and account marks; jobs are cancelled by hook. A participant counts as linked for purchase points once they've opened My Garden. |
| 14 | `?pass=` accepted in the query string; email linking could still be switched on; tree-status bypassed the linking rule. | Pass only after `#`; email-based shop linking removed entirely; tree-status uses the same rule. |

All 64 checks pass, and the backup restore was repeated with the final code. Not checked by either audit: the PHP has never been run (no WordPress here), and `npm audit` was not run.

## Second assessment (23 Nov 2026): what was done

| # | Finding | Done |
|---|---|---|
| F1 | Exposed webhook secret: rotation unconfirmed | **Still to do, needs the operator.** Replace `BEEHIIV_WEBHOOK_SECRET` on Railway and in every beehiiv automation's `X-MDG-Secret` header, then confirm the old value is refused and the new one works (a request with no subscriber ID gets 401 with a wrong secret and 400 with the right one, without changing anything). |
| F2 | The replay guard refused genuine requests in the same second | The plugin (1.1.2) adds a fresh `request_id` to every signed request; exact copies are still refused. The checks now build requests exactly like the plugin and include a same-second regression test. |
| F3 | A storage error could be recorded as "already credited" and skip the points for good | The purchase record and points are written in one transaction. Only the duplicate-order constraint counts as "already credited"; any other error makes the request fail (503), so WordPress retries. Tested with injected failures, both before logging and between logging and adding points. |
| F4 | The rollback instructions named the wrong secret | Replaced with the table above, in this document and the README. |
| Other | Newsletter token in the query string; outdated WooCommerce and email-linking references | Personal links are now `/#t=…` (older `?t=` links still work). The unused WooCommerce client and its settings are removed, and the README and this document match the code. |

Still not verified, as both reviews note: the plugin has not run in WordPress, the new backend is not deployed, and no routine backup owner has been named.
