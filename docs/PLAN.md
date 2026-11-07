# Build plan and decisions

The brief is in the first message of the build session; this file records what was decided.

## Decisions (confirmed with Robin, 2026-11-06)

| Topic | Decision |
| --- | --- |
| Hosting | Fly.io app `mdigital-meals`, one machine in `syd`, SQLite on a volume (`/data`); domain foodz.dogstar.nz |
| Deploy | GitHub Actions (`.github/workflows/deploy.yml`) using the `FLY_API_TOKEN` repo secret |
| Email | AWS SES (v2 API) for magic links; logs links to the console when SES is not configured (dev) |
| Library | **One shared household library in v1**: both users see and edit all meals and foods. `created_by` is recorded. No "copy to other user" (not needed). Targets, day plans, shopping lists and pantry staples stay per user. |
| PWA | Basic: manifest, icons, minimal service worker (static asset cache, offline page). No offline data. |
| Stack | TypeScript, Hono with server-rendered JSX, small vanilla JS for interactivity, better-sqlite3 + Drizzle, Zod, Vitest, Playwright |
| AI | Anthropic API, model `claude-sonnet-5-5`, server-side only, structured JSON output validated with Zod, server-side refusal fallback on |
| Backups | Fly volume snapshots (14 days) + nightly compressed DB copy on the volume, emailed to the owner; download from Settings; staged restore via `dist/cli.js` |

## Phases

1. Skeleton and deploy
2. Auth (allowlist, magic link, sessions, rate limits, CSRF, sign out)
3. Data and CRUD (schema, migrations, meals and foods, seed)
4. Browse (cards, filters, sort, search, meal page)
5. AI import (paste, parse, review, save, daily cap)
6. Day builder (slots, servings, totals vs targets, save, duplicate)
7. Shopping list (selection, scaling, merging, categories, pantry, checkboxes, copy)
8. Polish and safety (backups and restore test, errors, loading, a11y, mobile, README)

## Status

All eight phases are built. See the README for setup, deploy, backups and restore.
