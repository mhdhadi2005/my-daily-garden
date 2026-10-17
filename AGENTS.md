# My Daily Garden

This workspace is for https://github.com/mhdhadi2005/my-daily-garden.
`origin` points to that repository; its default branch is `master`.

## Project

10almonds newsletter gamification: engagement grows an almond tree, earns
points and streaks, and unlocks harvests, cosmetics, and a forest.

- Backend: Node.js, CommonJS, Express 5, built-in `node:sqlite`.
- Frontend: static HTML, CSS, and JavaScript; no build step or framework.
- Integrations: beehiiv, WooCommerce, and a WordPress PHP connector.
- Hosting configuration: Railway/Nixpacks and a Procfile. These files do
  not prove that a live deployment exists.

## Commands

Use Node 22.5 or newer for `node:sqlite` (verified locally with 22.17.0).

```sh
npm ci
npm start                  # http://localhost:3001; GET /health
npm test                   # existing engine smoke check; see warning below
npm run verify:wp -- EMAIL APP_URL
npm run verify:beehiiv
```

`npm test` deletes `data/garden.db` before running. Run only in a disposable
checkout with no valuable local database. Setting `DB_PATH` does not prevent
that deletion. The smoke check has limited assertions; a passing run does
not establish full coverage.

The integration verification commands require configured credentials.
`verify:beehiiv` writes custom fields to the first subscriber it finds;
use a test publication and subscriber within the authorized scope.

Copy `.env.example` to ignored `.env` only when configuration is needed.
Keep credentials out of source, output, and commits. Production SQLite needs
`DB_PATH` on persistent storage. Do not modify or delete existing databases,
including the tracked SQLite files under `mdg-zip/data/`, as setup work.

## Where to work

- `src/server.js`: schema initialization, middleware, routes, static files,
  and scheduler startup.
- `src/engine/index.js`: engagement scoring and streak updates.
- `src/engine/config.js`: point values, stage thresholds, reward odds,
  cosmetics, and UTC day calculations. Read this rather than relying on
  older numbers in README.md.
- `src/db/index.js`, `src/db/schema.sql`: SQLite access, schema, boot migrations.
- `src/routes/`: webhooks, tree reads, harvests, WordPress auth, demo, admin jobs.
- `src/integrations/`, `src/jobs/`: external clients, reconciliation, referrals.
- `public/`: UI; `app.js` uses demo data by default and real data with
  `?subscriber=ID`. Artwork and tree stages have separate JavaScript files.
- `wordpress-snippet/my-daily-garden-connector.php`: WordPress REST bridge
  and shortcode. Keep its signed request contract aligned with wp-auth.js.

## Working rules

- KISS and YAGNI. Reuse existing code, stdlib, and native browser features.
  Keep changes small; do not add speculative abstractions or dependencies.
- Trace callers and the full affected flow before fixing a bug.
- Preserve signature checks, input validation, data, and accessibility.
- Follow existing CommonJS and plain JavaScript conventions.
- Verify the changed behavior with the smallest meaningful check. UI changes
  need a browser check; logic changes need a runnable regression check.
- Use `rg` for exact text or known paths. For unfamiliar repository concepts,
  use `/Users/harryheyworth/Tools/typesafe-experiments/blink/blink` before
  broad searching; verify its leads and never send secrets or private contents.
- Delegate independent bounded subtasks when useful for complex work.
- Keep communication short and direct. Never use em dashes.
- New branches use `codex/`. New chats or CLI tasks use Full Access with
  approvals disabled; verify effective settings where available.
- Do not infer live integration or deployment success from local tests.

## Agent skills

### Issue tracker

Specs and tickets live in GitHub Issues for `mhdhadi2005/my-daily-garden`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default Matt Pocock triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo. Read the root glossary and relevant ADRs when they exist. See `docs/agents/domain.md`.
