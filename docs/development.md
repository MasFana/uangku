# Development

Everything below runs inside `uangku-app/` unless a path says otherwise.

## Requirements

- Node 22 or newer (`node -v`)
- npm 10 or newer
- A Cloudflare account for `wrangler login`, `d1 create`, `kv namespace create`, and `deploy`. Local development needs no account: `platformProxy` runs D1 and KV on your machine.

## First run

```bash
cd uangku-app
npm ci
cp .dev.vars.example .dev.vars
```

`BETTER_AUTH_SECRET` must be 32 or more characters. Any random string works locally:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

Then create your own resources and put the printed ids into `wrangler.jsonc`:

```bash
npx wrangler d1 create APP_DB
npx wrangler kv namespace create CACHE
```

Apply migrations to the local database and start the dev server:

```bash
npm run db:migrate:local
npm run db:seed:local   # optional: demo account with sample wallets and transactions
npm run dev             # http://localhost:5173
```

## Migrations

The schema in `src/lib/server/db/schema.ts` is the source of truth.

```bash
npm run db:generate                 # drizzle-kit generate, writes drizzle/000N_*.sql
npm run db:migrate:local            # apply to the local D1
npx wrangler d1 migrations apply APP_DB --remote   # apply to production
```

For a hand written migration (a backfill, for example), generate an empty file and fill it in:

```bash
npx drizzle-kit generate --custom --name=backfill_something
```

Two rules, both learned the hard way:

- `npx drizzle-kit push` is never used. It changes a deployed database without a reviewable file, and D1 migrations then disagree with the schema.
- A migration must be safe to run twice. `drizzle/0001_backfill_default_categories.sql` inserts categories only when a matching `(user_id, name, kind)` row does not exist.

## Tests

```bash
npm test                    # vitest run
npx vitest run tests/balance.test.ts
```

Suites run under plain Vitest (`pool: 'forks'`); those that need a database open a real one through `getPlatformProxy` from `wrangler`. Concurrency is off (`fileParallelism: false`) and the timeout is 90 seconds per test, so a small machine can still finish the run.

Balance math, period resolution, tenant isolation, CSV escaping, and the route guard are covered. If you change a calculation, extend the suite that owns it; a bug fix without a regression test was not fixed.

## Quality gate

```bash
bash ../scripts/check.sh
```

The script runs `svelte-check`, `npm run build`, the design detector over `src/`, and `npm test`, in that order and one at a time. `IMPECCABLE_BIN` can point at a different detector binary.

Run `npm run check`, `npm run build`, and `npm test` sequentially, not together. They each need most of a small machine's memory.

## Deploy

```bash
npm run build
npm run deploy
```

Before the first deploy, set the secrets and apply migrations:

```bash
npx wrangler d1 migrations apply APP_DB --remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL      # your deployed url, no trailing slash
npx wrangler secret put BETTER_AUTH_TRUSTED_ORIGINS   # optional: extra origins, comma separated
```

`BETTER_AUTH_URL` must match the deployed origin, or the session cookie is issued for the wrong host. Sign-in from any other hostname needs that hostname in `BETTER_AUTH_TRUSTED_ORIGINS`; without it Better-Auth answers `403 INVALID_ORIGIN`. List every hostname that serves the app, for example a `workers.dev` name and a custom domain. `.github/workflows/deploy.yml` runs migrations and deploys when you start it by hand and the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set.

Verify a deployment:

```bash
sh scripts/smoke.sh https://your-worker-url
```

The script checks that `/login` returns 200, `/api/auth/get-session` returns 200, and `/` redirects (303) for a signed out request. A dead database binding shows up as a 500 on the session endpoint, which a plain page load hides behind the redirect.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Database binding APP_DB is missing from platform environment` | The D1 id in `wrangler.jsonc` does not exist on the account you are logged in to, or `platformProxy` is off. Run `npx wrangler d1 create APP_DB` and copy the id. |
| Pages redirect to `/login` in a loop | `BETTER_AUTH_URL` does not match the origin you opened. It must include `http://localhost:5173` in dev. |
| Sign-in answers `403 INVALID_ORIGIN` | The origin you opened is not in `BETTER_AUTH_URL` or `BETTER_AUTH_TRUSTED_ORIGINS`. |
| `D1_ERROR: too many SQL variables` | A statement binds more than 100 parameters. Insert in chunks, as `seedDefaultsForUser` does with 5 rows per statement. |
| `FOREIGN KEY constraint failed` when saving a transaction | An optional select sent `''` instead of `null`. `optionalId` in `src/lib/server/validation.ts` handles this; keep it on new optional id fields. |
| `ENOSPC: System limit for number of file watchers reached` | The host has a low `fs.inotify.max_user_watches` and a read only sysctl. Raise the limit, or verify against a deployed worker instead of the dev server. |
| `wrangler` fails with a DNS or resolver error on musl hosts | Some Alpine images need `LD_PRELOAD=/usr/local/lib/libresinit.so` prefixed to every `wrangler` command. |
| Theme flashes on load | The theme script must stay in `src/app.html` before `%sveltekit.head%`. |

## Code rules

- Rupiah amounts are integers. Display formatting happens in the component, never in the database.
- All D1 access goes through Drizzle and the repositories in `src/lib/server/repos/`. No string concatenated SQL.
- Bindings are read from `event.locals.env` inside a request. Never at module scope.
- Server logs are single line JSON via `console.log`, for example `{ event: 'seed_default_categories_failed', userId, message }`.
- UI code follows `DESIGN.md`: tokens from `@theme`, touch targets of at least 44 px, contrast of at least 4.5:1, and `prefers-reduced-motion` respected.
