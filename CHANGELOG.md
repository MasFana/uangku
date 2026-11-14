# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and dates are ISO 8601. This repository has no tagged release yet, so everything below is the build up to the first one. Version numbers are a plan, not a promise.

## 0.1.0 (unreleased, work from 2026-11-11 to 2026-11-13)

### Added

- Email and password accounts through Better-Auth, with sessions stored in D1 and a route guard over every page except `/login` and `/register`.
- Wallets with a type, a starting balance, and a computed balance. No balance column exists, so a balance cannot drift from its transactions.
- Transactions of three types: expense, income, and transfer between two wallets. Amounts are integer rupiah.
- 17 default categories (12 expense, 5 income), inserted when an account is created, plus a backfill migration for accounts created earlier.
- The transaction list groups rows by day, pages with a composite cursor, and shows each day's net total from a server side aggregate.
- Month navigation on the transaction list, with an all option and a custom date range. Invalid input falls back to the current month.
- Analytics page with presets from this week (starting Monday) to all time, daily, weekly, and monthly buckets, breakdowns per category and per wallet, and a comparison against the previous period. Transfers count as neither income nor expense.
- Dashboard with total balance, current month cash flow, category breakdown, a six month bar chart in hand written SVG, and recent transactions. The summary is cached in KV for 60 seconds and invalidated on writes.
- CSV export at `/api/export`, streamed from D1 in pages of 200 rows with a UTF-8 BOM, CRLF line endings, and RFC 4180 quoting.
- Light and dark theme with a system option, plus a head script that prevents a theme flash on load.
- Design system in `DESIGN.md`: neo brutalist tokens in OKLCH, the Instrument Sans and JetBrains Mono pair, hard shadows, and a 44 px minimum touch target.
- Mobile shell with bottom navigation, a center action that starts a transaction from any screen, and a desktop floating action button.
- `scripts/check.sh`, which runs typecheck, build, the design detector, and tests in order.
- Smoke test script for a deployed worker: `/login`, `/api/auth/get-session`, and the redirect on `/`.
- A Cloudflare custom domain, `https://akularping.my.id`. The `workers.dev` hostname serves the same build.
- Repository files for a public release: README with screenshots of the running app, MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and pull request templates, a deploy workflow, app icons, and a social preview image.

### Fixed

- Production bindings: `@sveltejs/adapter-cloudflare` 8 does not pass `platform` to the SvelteKit server, so `event.platform` was `undefined` and every database call failed. Bindings are now read from `cloudflare:workers` into `event.locals.env`.
- Empty select values on foreign key columns now become `NULL` in validation instead of causing a foreign key failure.
- Transfer and transaction form field names are mapped explicitly in the action, so a picked date is no longer ignored.
- The route guard treated any request with `image/` in its `Accept` header as public. Chrome and Safari send that on page navigation, which showed the dashboard to signed out visitors.
- A screen reader only table kept a fixed width and pushed the mobile layout sideways, which let the fixed bottom navigation extend past the viewport.
- Hero text contrast on the dashboard was 3.35:1 and now passes AA in both themes.
- Dashboard cache keys are per user, so one account can never read another account's summary.
- Modals moved to Bits UI Dialog for focus trapping, escape to close, and correct labelling.

### Changed

- Analytics moved out of the dashboard into `/analytics`, because filter controls on the same page as a user keyed cache mixed data from different filters.
- Page titles moved into the header from a single route map that also feeds both navigations.
- The floating action button now means "record a transaction" everywhere. Wallet and category forms use labelled buttons in the page header instead.
- The seeder inserts categories in chunks of 5 rows, because one statement with 17 rows and 8 columns exceeds the 100 bound parameter limit in D1.
- SvelteKit remote functions stay off. The earlier `*.remote.ts` files were moved into `src/lib/server/services/`.
- The app package is named `uangku`, and `scripts/check.sh` finds the design detector on `PATH` instead of a fixed location.

### Known gaps

- Receipt photos to R2 are not implemented. The `RECEIPTS` binding is absent from `wrangler.jsonc`, because R2 is turned off on the deployment account.
- AI insight and receipt scanning are not implemented. `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` are reserved secret names with no reader in the code.
- Budgets, tags with D1 FTS5 search, savings goals, recurring entries, multi currency, and offline support are planned in `docs/specs/roadmap.md`.
