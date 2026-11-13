# Architecture

One SvelteKit app deployed to Cloudflare Workers. Static assets are served by the assets binding, every `/api/*` request goes to the worker first, and all data lives in D1 with a KV cache in front of the dashboard summary.

```
browser
  │
  ├── GET /            ──► worker: hooks.server.ts
  │                          ├─ read bindings, build D1 client
  │                          ├─ Better-Auth getSession(headers)
  │                          ├─ guard: no session and not a public route? 303 /login?redirectTo=...
  │                          └─ route load ──► services ──► repos ──► Drizzle ──► D1
  │                                                                  └─► KV (dashboard summary, 60 s)
  └── POST /?/create   ──► form action ──► Valibot ──► services ──► repos ──► D1, then clear the KV key
```

## Layers

| Layer | Location | Rule |
|---|---|---|
| Routes | `src/routes/**/+page.server.ts`, `+server.ts` | Read query params and form data, call a service, return data. Never build SQL here. |
| Services | `src/lib/server/services/*` | Use case per file: transactions, wallets, categories, stats, export. Owns validation and cache invalidation. |
| Repositories | `src/lib/server/repos/*` | Drizzle queries, always scoped by `user_id`. |
| Pure logic | `src/lib/server/balance.ts`, `stats.ts`, `period.ts`, `csv.ts`, `guard.ts` | No bindings, no `event`, so tests can call them directly. |
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

Bindings: `APP_DB` (D1) and `CACHE` (KV). A `RECEIPTS` (R2) binding was removed from `wrangler.jsonc` while R2 is disabled on the original account; it comes back with the receipt upload feature.

## Data model

D1 is SQLite, so ids are text and columns are conservative.

| Table | Key columns | Notes |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better-Auth defaults | `session.token` is unique, `session.userId` is indexed |
| `wallets` | `id`, `user_id`, `name`, `type`, `initial_balance`, `archived` | `type` is one of `cash`, `bank`, `ewallet`, `other`. `initial_balance` is integer rupiah. |
| `categories` | `id`, `user_id`, `name`, `kind`, `icon`, `color`, `archived` | Unique on `(user_id, name, kind)`. `kind` is `expense` or `income`. |
| `transactions` | `id`, `user_id`, `wallet_id`, `category_id`, `type`, `amount`, `transfer_wallet_id`, `note`, `occurred_at`, `receipt_key` | Indexed on `(user_id, occurred_at desc)` and `(wallet_id, occurred_at)`. Foreign keys are `restrict` on delete. |

Drizzle generates the SQL files in `drizzle/`. `0001_backfill_default_categories.sql` inserts the 17 default categories for accounts created before the seeding hook existed, and it is written so that running it twice changes nothing.

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

`calculateWalletBalance` and `calculateMultipleWalletBalances` in `src/lib/server/balance.ts` implement this as pure functions. `calculateMultipleWalletBalances` scans the mutation list once instead of looping per wallet.

Transfers are one row with `type = 'transfer'`, `wallet_id` as the source and `transfer_wallet_id` as the destination. They are excluded from `income`, `expense`, and `net` in analytics and in the dashboard cash flow, and they are counted in `count`.

## Dates and periods

- `occurred_at` is an ISO UTC string. A date picked in the UI (for example `2026-11-12`) becomes `2026-11-12T00:00:00.000Z`, and range filters compare against `T00:00:00.000Z` to `T23:59:59.999Z` so both ends are inclusive.
- Month buckets, week buckets, and grouping all use UTC, and weeks start on Monday.
- `/transactions` takes `period=YYYY-MM`, `all`, or `custom` with `startDate` and `endDate`. An invalid value falls back to the current month instead of failing. `periodNav.next` is `null` for the current or a future month, so the UI cannot open an empty month.
- `/analytics` uses different names on purpose: `range=week|month|year|all|custom` with `from`, `to`, `granularity`, `walletId`, `categoryId`, `type`. Every filter travels in the URL, so a view can be bookmarked and the server does one load per URL.

Bucket series are filled with zeroes for periods without transactions. A chart with missing points would suggest money moved when nothing happened.

## Aggregates and pagination

The transaction list pages by a composite cursor `(occurred_at, id)` and loads 20 rows at a time. One day can therefore span two pages, and summing the loaded rows would show a wrong day total. The server instead runs one `GROUP BY` day query for the days on the page and returns `dayTotals`, and the UI shows "memuat X dari Y" when it holds fewer rows than the day's `count`.

## Cache

The dashboard summary is cached in KV under `dashboard:<userId>` for 60 seconds. `setDashboard` swallows KV errors on purpose: a cache failure must not fail a read or a write. Every mutation that changes balances or totals calls `invalidateDashboard`, which deletes the key. Analytics is not cached, because each filter combination would need its own key.

## Auth and the route guard

Better-Auth runs inside `hooks.server.ts` with `svelteKitHandler`, and the session is read from the request headers on every request. `isPublicRoute` allows `/login`, `/register`, `/api/auth/*`, `/_app/*`, `/assets/*`, `/favicon*`, `/robots.txt`, and files with a static extension. Everything else redirects to `/login?redirectTo=<path>`.

One production detail worth keeping: `isPublicRequest` treats image requests as public only when the `Accept` header contains `image/` **and** not `text/html`. Chrome and Safari send `image/avif, image/webp` on page navigation too, and the earlier rule made every browser request public, which showed the dashboard to signed out visitors. `tests/guard.test.ts` holds a regression case with a real Chrome `Accept` header.

## Export

`GET /api/export` streams CSV out of D1 in pages of 200 rows using a stable `(occurred_at, id)` cursor, so nothing accumulates in memory. The response starts with a UTF-8 BOM and uses CRLF line endings because Excel needs both to open accented text and the row breaks correctly. Quoting follows RFC 4180. Transfer rows put the destination wallet name in the category column as `-> Wallet name`.

## D1 limits that shaped the code

A D1 statement accepts at most 100 bound parameters. Inserting 17 categories as one statement would need 17 x 8 = 136 parameters, so the seeder inserts in chunks of 5. This limit applies in Miniflare as well as in production, so a test catches a chunk size change that would break the insert.

## Tests

`vitest.config.ts` uses `@cloudflare/vitest-pool-workers`, so every suite runs inside workerd with real D1 and KV bindings from `wrangler.jsonc`. Suites live in `uangku-app/tests/`. Files run one at a time (`fileParallelism: false`) and each test has a 90 second timeout, because the host used for development is small and the worker pool needs the memory.

## Build and deploy

`npm run build` produces `build/client` (static assets) and `build/_worker.js`. `wrangler.jsonc` points the assets binding at `build/client`, runs the worker first for `/api/*`, and enables observability. `npm run deploy` publishes the worker, and `.github/workflows/deploy.yml` applies remote migrations before deploying when the workflow runs on `main`.
