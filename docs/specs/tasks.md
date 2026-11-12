# tasks.md — Fase 1 (MVP)

Format: checklist atomik, urut sesuai dependensi. Agent: kerjakan satu baris = satu commit kecil.

## Sprint 1 — SELESAI (review: `docs/reviews/sprint1.md`)
- [x] S1. `npx sv create uangku-app` + `@sveltejs/adapter-cloudflare`
- [x] S2a. Tailwind v4 (`@tailwindcss/vite`) + token `@theme` di `app.css`
- [ ] S2b. shadcn-svelte init — **dipindah ke Sprint 2** (orchestrator menjalankan init)
- [x] S3. `wrangler.jsonc`: D1 `APP_DB`, R2 `RECEIPTS`, KV `CACHE`, assets, `nodejs_compat`, observability
- [x] S4. Migrasi D1 pertama dari schema Drizzle (`drizzle/0000_useful_black_widow.sql`)
- [x] S5. `hooks.server.ts`: Better-Auth + `locals.user`, `locals.db`, `locals.r2`, `locals.kv`
- [x] D1. Drizzle schema: wallets, categories, transactions + tabel Better-Auth
- [x] D2. Kalkulasi saldo murni (`balance.ts`) + uji
- [ ] D3. KV cache helper dashboard (TTL 60 s) — cache dipanggil langsung di `dashboard.remote.ts`; helper terpisah belum ada
- [x] A1. Halaman login & register (email + password saja)
- [ ] A2. Guard rute: semua rute kecuali `/login`,`/register` butuh sesi — **BELUM ADA**
- [x] X1. Auth `emailAndPassword` (tanpa OAuth/magic link)
- [x] X2. Seed demo lokal idempoten (`db:seed:local`)
- [x] X3. `wrangler.jsonc` siap domain `akularping.my.id` + `BETTER_AUTH_URL`
- [x] X4. Monogram "U" brutalist + favicon
- [x] Q1. Vitest: kalkulasi saldo, validasi Valibot, isolasi tenant (35 test lulus)
- [x] Q2. Detector impeccable: `[]` (nol temuan)
- [x] Q3. `svelte-check` + `build` lulus
- [ ] Q4. `BETTER_AUTH_SECRET` di produksi — menunggu kredensial
- [ ] Q5. Deploy `--remote` — **terblokir**: belum ada API token Cloudflare
- [x] Q6. Workflow CI (`.github/workflows/ci.yml`) + deploy (`.github/workflows/deploy.yml`)

## Sprint 2 — Fungsionalitas inti
- [ ] Y1. shadcn-svelte init + komponen dasar (Button, Input, Sheet, Dialog, Select, Table, Chart)
- [ ] Y2. Guard rute A2 + `redirect` ke `/login` dengan `redirectTo`
- [ ] Y3. Halaman dompet: list + saldo, create, edit, archive (`/wallets`)
- [ ] Y4. Halaman kategori: list, create, edit, archive (`/categories`)
- [ ] Y5. Input transaksi: sheet modal + keypad numerik, validasi Valibot, invalidasi KV
- [ ] Y6. Daftar transaksi: filter (dompet, kategori, tipe, rentang tanggal) + cursor pagination/infinite scroll
- [ ] Y7. Edit/hapus transaksi (404 bila bukan milik user)
- [ ] Y8. Transfer antar dompet
- [ ] Y9. Dashboard nyata dari KV: total saldo, arus kas bulan, breakdown kategori, grafik 6 bulan, 10 transaksi terakhir
- [ ] Y10. Empty state + skeleton loading di semua layar

## Fase 1 lanjutan
- [ ] F6. Upload struk ke R2 (validasi 5 MB, `image/*`) + endpoint lihat struk
- [ ] F9. Export CSV streaming
- [ ] Z1. Budget per kategori
- [ ] Z2. Deploy produksi + smoke test (perlu kredensial)
