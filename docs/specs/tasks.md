# tasks.md — Fase 1 (MVP)

Format: checklist atomik, urut sesuai dependensi. Agent: kerjakan satu baris = satu commit kecil.

## Setup
- [ ] S1. `npx sv create uangku-app` (template minimal, TS, tanpa add-on) + `@sveltejs/adapter-cloudflare`
- [ ] S2. Tailwind v4 (`@tailwindcss/vite`) + shadcn-svelte init; buat DESIGN.md tokens → `@theme` di app.css
- [ ] S3. wrangler.jsonc: D1 `APP_DB`, R2 `RECEIPTS`, assets binding, `nodejs_compat`, observability
- [ ] S4. `wrangler d1 migrations apply APP_DB --local` pertama dari schema Drizzle
- [ ] S5. hooks.server.ts: Better-Auth + inject `locals.user`, `locals.db` (Drizzle D1), `locals.r2`

## Domain
- [ ] D1. Drizzle schema: wallets, categories, transactions (lihat fase1-prd.md §2) + generate migrasi
- [ ] D2. Repository layer: kalkulasi saldo dompet (initial + mutasi) — pure function + unit test
- [ ] D3. KV cache helper: get/invalidate dashboard summary (TTL 60s)

## Auth
- [ ] A1. Halaman login & register (shadcn form + Valibot)
- [ ] A2. Guard: semua route kecuali /login,/register butuh sesi (hooks)

## Fitur
- [ ] F1. Wallets CRUD + archive + list saldo
- [ ] F2. Categories CRUD + archive
- [ ] F3. Transaksi create (sheet modal + keypad numerik) — invalidate cache KV
- [ ] F4. Transaksi list: filter + cursor pagination + infinite scroll
- [ ] F5. Transaksi edit/delete (404 jika bukan miliknya)
- [ ] F6. R2 presigned upload struk (validasi 5 MB, image/*) + endpoint lihat struk (auth'd)
- [ ] F7. Transfer antar dompet (drizzle batch, 1 baris type=transfer)
- [ ] F8. Dashboard: total saldo, arus kas bulan, breakdown kategori, grafik 6 bulan (shadcn Chart), 10 terakhir — baca dari KV
- [ ] F9. Export CSV streaming

## QA & Deploy
- [ ] Q1. vitest-pool-workers: kalkulasi saldo, transfer, filter list
- [ ] Q2. `npx impeccable detect src/` — nol P0/P1
- [ ] Q3. svelte-check + build lulus; cek bundle < 30 MB
- [ ] Q4. Secrets: BETTER_AUTH_SECRET via wrangler secret put
- [ ] Q5. Deploy: migrasi --remote → wrangler deploy → smoke test login+input transaksi
- [ ] Q6. GitHub Actions CI (test → build → deploy dari main) — template di research/05 §5.3
