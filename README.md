# Meals

A small, phone-first web app for two people to keep a shared library of favourite meals, see kcal, protein and fibre per serve, build days against their targets, and turn days or meals into a combined shopping list. New meals can be pasted as a recipe; AI estimates the ingredients and nutrition for review. Metric units only.

Live: https://foodz.dogstar.nz (also reachable at https://mdigital-meals.fly.dev, which redirects once `APP_URL` is the custom domain).

## What it does

- **Meals:** one shared household library. Cards with slot, kcal, protein and fibre; filter by slot and tag, sort by protein, fibre or kcal, search names, tags and ingredients.
- **Add a meal:** paste a recipe and the server asks Claude (`claude-sonnet-5-5`) for structured data: ingredients with quantities, units and shopping categories, nutrition per line, per-serve totals and assumptions. Nothing is saved until you review it. Totals that don't match the ingredient lines are flagged. Or enter a meal by hand. Foods (single items with nutrition per 100 g or ml) cover simple snacks.
- **Days:** per person. Add meals and foods to slots, change servings, and watch running totals against your daily targets. Rename, date, duplicate and delete.
- **Shopping:** pick days and meals and a number of people. Ingredients are scaled, merged across meals (g/kg and ml/L converted, spoons kept for spices), rounded up to sensible amounts and grouped by category, with checkboxes and copy/share as plain text. Pantry staples are hidden unless you ask to see them.
- **Settings:** daily targets (default 1,500 kcal, 120 g protein, 28 g fibre), pantry staples, backup download, sign out.
- Installable on a phone home screen (basic PWA). Works in light and dark mode.

## Stack

TypeScript throughout. [Hono](https://hono.dev) renders pages on the server with JSX; a small `public/app.js` adds progressive enhancements (every form works without it). SQLite via better-sqlite3 and Drizzle, on a Fly.io volume. Zod validates forms and the AI output. Email through AWS SES. Vitest for unit and route tests, Playwright for end-to-end, accessibility and mobile layout checks.

```
src/
  app.tsx            routes, security headers, error pages
  server.ts          entry point (seed, restore, backup schedule)
  cli.ts             maintenance commands: backup, list, verify, restore
  config.ts          environment variables
  auth/              magic-link tokens, sessions, CSRF, rate limits
  ai/parser.ts       recipe parsing with the Anthropic API
  db/                schema and connection (migrations in drizzle/)
  lib/               nutrition maths, shopping list merging, forms, mailer
  services/          meals, days, shopping lists, staples
  routes/            pages
  views/             shared JSX components
  backup.ts, jobs.ts backups and the nightly job
tests/               Vitest (unit and route tests), fixtures/recipes.ts
e2e/                 Playwright (sign in, import, day, shopping, a11y, mobile)
```

## Run it locally

Needs Node 22.

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`, at least `ALLOWED_EMAILS`. Then:

```bash
npm run dev
```

Open http://localhost:3000 and sign in with an allowlisted email. Without SES configured, the sign-in link is printed in the terminal. The seed meals and foods load on first start. AI import needs `ANTHROPIC_API_KEY`; without it, the import page points to manual entry.

## Tests

```bash
npm test
```

Unit and route tests: unit conversion, merging, scaling, token expiry, AI schema validation, the import flow with a fake parser, backups and the restore round trip.

```bash
npm run e2e
```

Browser tests (Playwright, Chromium): sign in, import a recipe, build a day, make a shopping list, two-tap high-protein dinner, axe accessibility scan of every main page (light and dark), and no sideways scrolling at 320 px. They run against a local stub of the Anthropic API, so they cost nothing. The first time on a new machine, run `npx playwright install chromium`.

```bash
RUN_AI_TESTS=1 ANTHROPIC_API_KEY=... npx vitest run tests/ai-live.test.ts
```

Optional live check: sends the five fixture recipes in `tests/fixtures/recipes.ts` to the real API and checks each lands in its expected kcal, protein and fibre range. Costs a few cents.

## Configuration

Set these as Fly secrets in production (`fly secrets set NAME=value -a mdigital-meals`). None of them ever reach the browser.

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_URL` | yes | Public address, used in sign-in links, e.g. `https://foodz.dogstar.nz` |
| `ALLOWED_EMAILS` | yes | Who can sign in: `email:Name,email:Name` |
| `SES_REGION` | yes | AWS region of your SES setup, e.g. `ap-southeast-2` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | yes | IAM user allowed `ses:SendEmail` and `ses:SendRawEmail` |
| `EMAIL_FROM` | yes | Verified sender, e.g. `Meals <meals@dogstar.nz>` |
| `ANTHROPIC_API_KEY` | for AI import | Server-side only |
| `AI_DAILY_CAP` | no | AI imports per person per 24 hours (default 20) |
| `BACKUP_EMAIL` | no | Where the nightly backup goes (default: first allowlisted email; `off` to disable) |
| `DATABASE_PATH` | no | Set in `fly.toml` to `/data/meals.db` |

Also set a **monthly spending limit** on the Anthropic API key in the Anthropic Console.

## Deploy

Every push to `main` or a `claude/**` branch runs typecheck, unit tests and browser tests in GitHub Actions, then deploys to Fly with `flyctl deploy --remote-only` (`.github/workflows/deploy.yml`). It needs a `FLY_API_TOKEN` repository secret (`fly tokens create org`) and, if your Fly organisation isn't `personal`, a `FLY_ORG` repository variable. The first run creates the app and the 1 GB volume.

The app runs on **one machine** in Sydney (`syd`). Keep it that way: SQLite on a volume doesn't work across machines. The machine stops when idle and starts on the next request.

To deploy by hand from a machine with flyctl:

```bash
fly deploy -a mdigital-meals
```

### Custom domain

```bash
fly certs add foodz.dogstar.nz -a mdigital-meals
```

In Route 53, add a CNAME from `foodz.dogstar.nz` to `mdigital-meals.fly.dev` (or the records `fly certs add` prints). Then wait until this shows the certificate as issued:

```bash
fly certs check foodz.dogstar.nz -a mdigital-meals
```

Finally point sign-in links at the new address:

```bash
fly secrets set APP_URL=https://foodz.dogstar.nz -a mdigital-meals
```

### Email (SES)

Verify the sending domain (or the `EMAIL_FROM` address) in SES in `SES_REGION`. A new SES account is in the sandbox and can only send to verified addresses, which is fine for two people: verify both. Request production access if you'd rather not.

## Backups and restore

There are three layers:

1. **Fly volume snapshots**, daily, kept 14 days (`snapshot_retention` in `fly.toml`).
2. **Nightly database backup** at about 3am NZ time: a consistent, compressed copy written to `/data/backups` (newest 14 kept), checked by opening it and running an integrity check, then emailed to `BACKUP_EMAIL`.
3. **Download on demand** from Settings → Download backup.

Maintenance commands, run on the machine:

```bash
fly ssh console -a mdigital-meals -C "node dist/cli.js backup"
```

```bash
fly ssh console -a mdigital-meals -C "node dist/cli.js list"
```

### Restore from a backup file

A restore is staged first, then swapped in when the app restarts, so the live database is never overwritten while it's open. The previous database is kept beside it as `meals.db.before-restore-<time>`.

1. To restore a file from your computer (an emailed or downloaded backup), upload it first. In `fly ssh sftp shell -a mdigital-meals`, run `put meals-2026-11-07T14-00-00-000Z.db.gz /data/backups/restore.db.gz`. To restore one already on the volume, find it with `list` above.
2. Verify and stage it. This refuses a corrupt file:
   ```bash
   fly ssh console -a mdigital-meals -C "node dist/cli.js restore /data/backups/restore.db.gz"
   ```
3. Restart to swap it in:
   ```bash
   fly apps restart mdigital-meals
   ```

Locally, the same commands work with `npx tsx src/cli.ts restore <file>`, then restart `npm run dev`.

The round trip (back up, delete everything, restore, data is back) is covered by `tests/backup.test.ts` and runs on every push.

### Restore a whole volume snapshot

For a bigger accident, list the volume's snapshots and create a new volume from one:

```bash
fly volumes list -a mdigital-meals
```

```bash
fly volumes snapshots list <volume-id> -a mdigital-meals
```

```bash
fly volumes create meals_data --snapshot-id <snapshot-id> -r syd -a mdigital-meals
```

Then destroy the old machine's volume, or the old machine, so the app's single machine attaches the restored volume on the next deploy. Fly's docs cover the details: https://fly.io/docs/volumes/snapshots/

## Security notes

- Magic-link sign-in only. Unknown emails get the same response and no email. Tokens are 32 random bytes, stored hashed, valid for 15 minutes and usable once; the link opens a confirm page, so email scanners can't use it up.
- Sessions: HTTP-only, Secure, SameSite=Lax cookie for 30 days, stored hashed.
- Rate limits on sign-in requests per email and per IP.
- CSRF: double-submit token on every form, plus an Origin and Sec-Fetch-Site check.
- Strict Content Security Policy (no inline scripts or styles), HSTS in production.
- The AI only ever receives the pasted recipe text.

## Decisions

See `docs/PLAN.md`.
