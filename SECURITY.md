# Security Policy

## Supported versions

Only the `main` branch is maintained. There are no release branches and no backports.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and use **Report a vulnerability**. That starts a private advisory that only the maintainer can read.

If private reporting is not available to you, open a normal issue that says only that you have a security report and how to reach you. Do not put the details in the issue.

Please include:

- The path or endpoint involved
- What an attacker can do, and what access they need first
- Steps to reproduce, or a request that shows the problem
- The affected commit

What to expect: an acknowledgement within a week, and either a fix or a written explanation of why the behavior is intended. Please give time for a fix before writing about it in public.

## In scope

- Session handling, cookie attributes, and the route guard in `src/lib/server/guard.ts`
- Reading or writing another user's rows (cross tenant access)
- SQL injection, or any D1 query built from user input
- Authorization on `/api/export`
- Secret exposure in the client bundle or in server rendered HTML

## Out of scope

- The test deployment at `workers.dev`. It is a public machine used for smoke tests, and anyone can register. Do not put real financial data in it.
- Missing headers or TLS settings on the app's own Cloudflare zone; Cloudflare handles those.
- Denial of service by volume. The app runs on Cloudflare, which absorbs that.
- Findings from an automated scanner with no demonstrated impact.

## Handling secrets

`BETTER_AUTH_SECRET`, `AI_API_KEY`, and any Cloudflare API token live in `wrangler secret put` or in `.dev.vars`, which is ignored by git. If you find one of them committed, report it as a vulnerability; the secret needs rotation, not just removal, because git history keeps it.

## How this app stores data

Passwords are hashed by Better-Auth, not by application code. Sessions live in the D1 `session` table and are read on every request. All list and detail queries are scoped by `user_id`, and `tests/isolation.test.ts` covers that rule. Amounts are plain integers, and the database holds no bank credentials, because the app never connects to a bank.
