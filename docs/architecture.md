# Architecture

One SvelteKit app deployed to Cloudflare Workers. Static assets are served by the assets binding, every `/api/*` request goes to the worker first, and all data lives in D1. The data routes render on the client from an on-device IndexedDB ledger, so a page navigation makes no data request, and `/api/sync` is the only mutation endpoint.

```
browser
  │
  ├── GET /            ──► worker: hooks.server.ts
  │                          ├─ read bindings, build D1 client
  │                          ├─ Better-Auth getSession(headers)
  │                          ├─ guard: no session and not a public route? 303 /login?redirectTo=...
  │                          └─ deliver the app shell ──► client renders from IndexedDB (no data request)
  │
  ├── client read      ──► IndexedDB ledger ──► src/lib/client/derive/** (balances, totals, analytics)
  └── client write     ──► IndexedDB (optimistic) + outbox ──► POST /api/sync ──► Valibot ──► repos ──► D1
```

## Layers

| Layer | Location | Rule |
|---|---|---|
| Client pages | `src/routes/**/+page.svelte`, `+page.ts` | Render from an IndexedDB ledger through reactive Svelte 5 state. Every data route sets `export const ssr = false` and has no `load`, so no `/__data.json` request is made per navigation. |
| Client derivation | `src/lib/client/derive/*` | Balances, totals, and analytics computed from the local transaction log. Guarded against drift by `tests/be/derive-parity.test.ts`, which compares them against real D1 SQL. |
| Client storage and sync | `src/lib/client/db/*`, `src/lib/client/sync/*` | The IndexedDB ledger and its outbox, plus the single flight engine that pushes writes to `/api/sync`. |
| Server routes | `src/routes/**/+server.ts` (only under `/api/*`) | Auth, sync, export, and receipt upload. Read query params and the request body, call a service, return data. Never build SQL here. |
| Services | `src/lib/server/services/*` | Use case per file: categories, export. |
| Repositories | `src/lib/server/repos/*` | Drizzle queries, always scoped by `user_id`. |
| Pure logic | `src/lib/server/stats.ts`, `period.ts`, `csv.ts`, `guard.ts` | No bindings, no `event`, so tests can call them directly. |
| Data | `src/lib/server/db/schema.ts` | Drizzle schema, the source of truth for migrations. |

SvelteKit remote functions are deliberately off (`experimental.remoteFunctions` stays false). The earlier `*.remote.ts` files were moved into `services/` because the file name suggested a feature that was not in use.

## Bindings

Bindings are read per request, never at module scope, because a worker module can be evaluated before the environment exists.

`hooks.server.ts` does this once per request:

```ts
const env = building ? undefined : ((event.platform?.env ?? workerEnv) as Env);
event.locals.env = env;
```

`workerEnv` is `import { env } from 'cloudflare:workers'`, which `@sveltejs/adapter-cloudflare` 8 provides in dev and production. `event.platform.env` is kept as the first choice because the dev server fills it through `platformProxy`, but on this adapter it is `undefined` in production (see `docs/DECISIONS.md`, "Akses binding di produksi"). Route handlers that need a binding read `event.locals.env`.

Bindings: `APP_DB` (D1). The `CACHE` (KV) binding was removed from `wrangler.jsonc` together with the dashboard cache it served; re-add the binding if a future server-side cache needs it. A `RECEIPTS` (R2) binding was removed while R2 is disabled on the original account; it comes back with the receipt upload feature.

## Data model

D1 is SQLite, so ids are text and columns are conservative.

| Table | Key columns | Notes |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better-Auth defaults | `session.token` is unique, `session.userId` is indexed |
| `wallets` | `id`, `user_id`, `name`, `type`, `initial_balance`, `archived` | `type` is one of `cash`, `bank`, `ewallet`, `other`. `initial_balance` is integer rupiah. |
| `categories` | `id`, `user_id`, `name`, `kind`, `icon`, `color`, `archived` | Unique on `(user_id, name, kind)`. `kind` is `expense` or `income`. |
| `transactions` | `id`, `user_id`, `wallet_id`, `category_id`, `type`, `amount`, `transfer_wallet_id`, `note`, `occurred_at`, `receipt_key` | Indexed on `(user_id, occurred_at desc)` and `(wallet_id, occurred_at)`. Foreign keys are `restrict` on delete. |

Drizzle generates the SQL files in `drizzle/`. `0001_backfill_default_categories.sql` inserts the 17 default categories for accounts created before the seeding hook existed, and it is written so that running it twice changes nothing. `0002_hlc_sync_rollups_triggers.sql` and `0003_category_watermark_scoped_triggers.sql` are hand written SQL for the sync triggers, and the journal and snapshot chain was repaired so `drizzle-kit generate` reports "No schema changes".

## Money

Amounts are integer rupiah. No float ever touches an amount, and no rounding step exists because the smallest unit is the rupiah. Display uses `Rp12.500` with `tabular-nums` in JetBrains Mono, so digits line up in columns.

Balances are computed, never stored:

```
balance(wallet) = initial_balance
                + sum(income where wallet_id = wallet)
                - sum(expense where wallet_id = wallet)
                - sum(transfer where wallet_id = wallet)
                + sum(transfer where transfer_wallet_id = wallet)
```

`deriveWalletBalances` in `src/lib/client/derive/balances.ts` implements this on the client, matching the D1 triggers in `drizzle/0002_hlc_sync_rollups_triggers.sql`. It scans the mutation list once instead of looping per wallet.

Transfers are one row with `type = 'transfer'`, `wallet_id` as the source and `transfer_wallet_id` as the destination. They are excluded from `income`, `expense`, and `net` in analytics and in the dashboard cash flow, and they are counted in `count`.

## Dates and periods

- `occurred_at` is an ISO UTC string. A date picked in the UI (for example `2026-11-12`) becomes `2026-11-12T00:00:00.000Z`, and range filters compare against `T00:00:00.000Z` to `T23:59:59.999Z` so both ends are inclusive.
- Month buckets, week buckets, and grouping all use UTC, and weeks start on Monday.
- `/transactions` takes `period=YYYY-MM`, `all`, or `custom` with `startDate` and `endDate`. An invalid value falls back to the current month instead of failing. `periodNav.next` is `null` for the current or a future month, so the UI cannot open an empty month.
- `/analytics` uses different names on purpose: `range=week|month|year|all|custom` with `from`, `to`, `granularity`, `walletId`, `categoryId`, `type`. Every filter travels in the URL, so a view can be bookmarked; the client resolves the same filter from the URL on each render.

Bucket series are filled with zeroes for periods without transactions. A chart with missing points would suggest money moved when nothing happened.

## Aggregates

The transaction list reads the local transaction log from IndexedDB and filters and groups it on the client (`src/lib/client/derive/filters.ts`), so a day never spans a page boundary and its net total comes from the same rows the list shows. Analytics is derived the same way (`src/lib/client/derive/aggregates.ts`), and both are checked against real D1 SQL by `tests/be/derive-parity.test.ts`.

## Sync

Writes are optimistic. Every user mutation is applied to IndexedDB immediately and queued in an outbox; `src/lib/client/sync/engine.svelte.ts` pushes it in the background. The engine is single flight, bounds each cycle at 15 s, and backs off with jittered exponential delay. It triggers on `online`, `visibilitychange`, and `focus`, on a 30 s interval while the tab is visible, and on a service worker message. `/api/sync` is the only mutation endpoint: it validates payloads with Valibot, verifies ownership of referenced rows, rejects stale writes under HLC last-write-wins and reports the rejection, and advances the client cursor to `max(serverNow, max(delta watermark), clientCursor)`. A rejected write converges to the server's version: the rejected entity id is persisted in `sync_meta.forceServerIds` (so an app restart between push and pull still converges), force-adopted from the next delta regardless of `hlc`, and the user is shown a visible conflict notice instead of a silent rollback. The service worker precaches an app shell so a hard reload works offline; it never caches `private` or `no-store` responses such as `__data.json`.

## Auth and the route guard

Better-Auth runs inside `hooks.server.ts` with `svelteKitHandler`, and the session is read from the request headers on every request. `isPublicRoute` allows `/login`, `/register`, `/api/auth/*`, `/_app/*`, `/assets/*`, `/favicon*`, `/robots.txt`, and files with a static extension. Everything else redirects to `/login?redirectTo=<path>`.

One production detail worth keeping: `isPublicRequest` treats image requests as public only when the `Accept` header contains `image/` **and** not `text/html`. Chrome and Safari send `image/avif, image/webp` on page navigation too, and the earlier rule made every browser request public, which showed the dashboard to signed out visitors. `tests/guard.test.ts` holds a regression case with a real Chrome `Accept` header.

## Export

`GET /api/export` streams CSV out of D1 in pages of 200 rows using a stable `(occurred_at, id)` cursor, so nothing accumulates in memory. The response starts with a UTF-8 BOM and uses CRLF line endings because Excel needs both to open accented text and the row breaks correctly. Quoting follows RFC 4180. Transfer rows put the destination wallet name in the category column as `-> Wallet name`.

## D1 limits that shaped the code

A D1 statement accepts at most 100 bound parameters. Inserting 17 categories as one statement would need 17 x 8 = 136 parameters, so the seeder inserts in chunks of 5. This limit applies in the local test database as well as in production, so a test catches a chunk size change that would break the insert.

## Tests

`vitest.config.ts` runs plain Vitest (`pool: 'forks'`); suites that need a database open a real one through `getPlatformProxy` from `wrangler`. Suites live in `uangku-app/tests/`. Files run one at a time (`fileParallelism: false`) and each test has a 90 second timeout, because the host used for development is small. `npx vitest run` reports 20 files and 185 tests.

## Build and deploy

`npm run build` produces `build/client` (static assets) and `build/_worker.js`. `wrangler.jsonc` points the assets binding at `build/client`, runs the worker first for `/api/*`, and enables observability. `npm run deploy` publishes the worker, and `.github/workflows/deploy.yml` applies remote migrations before deploying when the workflow runs on `main`.
