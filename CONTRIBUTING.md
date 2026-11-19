# Contributing

Thanks for looking. This is a small app with a narrow scope, so the fastest path to a merged change is a small pull request that solves one real problem.

## Scope

In scope: Indonesian rupiah, personal use, single user accounts, offline capable (an on-device IndexedDB ledger with background sync), mobile screens come first.

Out of scope for now: multi currency, recurring transactions, family sharing, email notifications, and any feature that needs a paid service other than Cloudflare.

## Before you start

For anything larger than a bug fix, open an issue first and describe the problem and the smallest change that fixes it. This keeps a large pull request from being turned down for reasons you could have heard in a comment.

## Setup

See `docs/development.md`. The short version:

```bash
cd uangku-app
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

## Conventions

- SvelteKit 3 with Svelte 5 runes, TypeScript in strict mode.
- Commit messages: `type(scope): description` in Indonesian, for example `fix(transactions): koreksi total harian saat halaman terbagi dua`. Code identifiers and code comments stay in English.
- UI text is Indonesian. Documentation aimed at contributors is English, except `docs/DECISIONS.md` and `docs/specs/`, which are Indonesian.
- Amounts are integer rupiah. A float amount is a bug, not a rounding detail.
- All D1 access goes through the repositories in `src/lib/server/repos/` with Drizzle. Do not concatenate SQL strings.
- Bindings are read inside a request from `event.locals.env`. Do not import a binding at module scope.
- New dependencies need a reason in the pull request. Valibot is used instead of Zod to keep the worker bundle small, and charts are hand written SVG instead of a chart library for the same reason.
- UI follows `DESIGN.md`: tokens from `@theme`, contrast of at least 4.5:1, touch targets of at least 44 px, and `prefers-reduced-motion` respected.

## Migrations

- `npm run db:generate` writes a new SQL file. `npx drizzle-kit push` is not allowed, because it changes a deployed database with nothing to review.
- A migration must be safe to run twice. Use `WHERE NOT EXISTS` or an equivalent guard.
- Schema changes and the code that reads the changed columns belong in the same pull request.

## Tests

Add a test when you change a calculation, a query, or a guard. Existing suites:

| File | Covers |
|---|---|
| `tests/fe/derive-balance.test.ts` | Balance arithmetic, transfers, empty and archived wallets |
| `tests/be/derive-parity.test.ts` | Client derivation against real D1 SQL |
| `tests/period.test.ts`, `tests/trend.test.ts` | Buckets, ranges, boundaries, daily aggregates |
| `tests/isolation.test.ts` | Per user isolation |
| `tests/csv-export.test.ts` | BOM, CRLF, quoting, transfer rows |
| `tests/categories-*.test.ts`, `tests/be/categories-watermark.test.ts` | Default category list, chunked insert, idempotent seeding |
| `tests/guard.test.ts` | Public routes, browser `Accept` headers, redirect target |
| `tests/valibot-schemas.test.ts`, `tests/sync/valibot-sync-schemas.test.ts` | Input and sync payload schemas |
| `tests/sync/*.test.ts` | Sync engine resilience, multi device merge, the `/api/sync` endpoint |
| `tests/fe/*.test.ts` | Local ledger writes, outbox squashing, service worker cache policy, sync diagnostics |

## Pull request checklist

1. `bash scripts/check.sh` passes (typecheck, build, design detector, tests). Run the steps one at a time; they need the machine's memory.
2. The change is described in a sentence or two: what was wrong, what you changed, how you verified it.
3. UI changes include a screenshot at 390 px wide, light and dark.
4. Migrations are included and idempotent.
5. No secrets, no personal data, and no real financial records in the diff.

## Reporting bugs

Use the issue templates. Include the URL path, what you expected, what happened, and the response status if you have it. Do not paste session cookies or real transaction data.
