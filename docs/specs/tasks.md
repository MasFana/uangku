# tasks.md — Fase 1 (MVP)

Format: checklist atomik, urut sesuai dependensi. Agent: kerjakan satu baris = satu commit kecil.

## Sprint 1 — SELESAI (review: `docs/reviews/sprint1.md`)
- [x] S1. `npx sv create uangku-app` + `@sveltejs/adapter-cloudflare`
- [x] S2a. Tailwind v4 (`@tailwindcss/vite`) + token `@theme` di `app.css`
- [x] S2b. shadcn-svelte init (preset `nova`, alias `$lib`) — orchestrator
- [x] S3. `wrangler.jsonc`: D1 `APP_DB`, R2 `RECEIPTS`, KV `CACHE`, assets, `nodejs_compat`, observability
- [x] S4. Migrasi D1 pertama dari schema Drizzle (`drizzle/0000_useful_black_widow.sql`)
- [x] S5. `hooks.server.ts`: Better-Auth + `locals.user`, `locals.db`, `locals.r2`, `locals.kv`
- [x] D1. Drizzle schema: wallets, categories, transactions + tabel Better-Auth
- [x] D2. Kalkulasi saldo murni (`balance.ts`) + uji
- [x] D3. KV cache helper dashboard (`src/lib/server/cache.ts`, TTL 60 s) + invalidasi saat mutasi
- [x] A1. Halaman login & register (email + password saja)
- [x] A2. Guard rute (`guard.ts` + `hooks.server.ts`): publik hanya `/login`, `/register`, static, dan `/api/auth/`; sisanya butuh sesi
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
- [x] Y1. shadcn-svelte init + komponen dasar (dialog, sheet, select, table) di-restyle ke DESIGN.md
- [x] Y2. Guard rute A2 + `redirectTo` aman di `/login` (tolak URL non-lokal)
- [x] Y3. Halaman dompet: list + saldo, create, edit, archive (`/wallets`)
- [x] Y4. Halaman kategori: list, create, edit, archive (`/categories`)
- [x] Y5. Input transaksi: sheet modal + `NumericInput` (input numerik biasa, format `Rp` langsung — keputusan pemilik, **bukan** keypad buatan), validasi Valibot, invalidasi KV
- [x] Y6. Daftar transaksi: filter (dompet, kategori, tipe, rentang tanggal) + pagination kursor gabungan `(occurredAt, id)` dengan tombol "Muat Lebih Banyak"
- [x] Y7. Edit/hapus transaksi (kepemilikan diperiksa di repo/layanan)
- [x] Y8. Transfer antar dompet
- [x] Y9. Dashboard nyata dari KV: total saldo, arus kas bulan, breakdown kategori, grafik 6 bulan (SVG buatan sendiri), transaksi terakhir
- [x] Y10a. Empty state di `/`, `/wallets`, `/categories`, `/transactions` (`EmptyState.svelte`)
- [x] Y10b. Skeleton loading — dihapus (YAGNI/dead code); SSR SvelteKit menyajikan data lengkap tanpa streaming deferred

## Fase 1 lanjutan
- [ ] F6. Upload struk ke R2 (validasi 5 MB, `image/*`) + endpoint lihat struk
- [x] F9. Export CSV streaming (`/api/export`, BOM + CRLF + escape RFC 4180)
- [ ] Z1. Budget per kategori
- [x] Z2. Deploy produksi + smoke test (workers.dev; custom domain tertunda karena izin DNS OAuth)

## Sprint 3 — Analisis & tema
Rencana (disetujui pemilik 2026-11-12): halaman analisis dengan filter + toggle tema gelap.

- [ ] A1. Tema gelap: kelas `dark` di `<html>` (kelas ini tidak pernah dipasang sebelumnya, jadi tema gelap mati), tombol siklus sistem/terang/gelap di kanan header, tersimpan di `localStorage['uangku-theme']`, skrip anti-kedip di `<head>`. Pemilik: ui-design.
- [ ] A2. `src/lib/server/stats.ts`: preset rentang (minggu ini Senin–sekarang, bulan ini, tahun ini, semua, kustom), pembuatan bucket harian/mingguan/bulanan (UTC, minggu mulai Senin), celah terisi 0. Pemilik: domain-backend.
- [ ] A3. `repos/stats.ts` + `services/stats.ts` + `src/routes/analytics/+page.server.ts`: ringkasan rentang, seri masuk/keluar, per kategori, per dompet, perbandingan periode sebelumnya, filter dompet/kategori/jenis. Transfer dikecualikan dari masuk/keluar/net. Pemilik: domain-backend.
- [ ] A4. `/analytics` UI: kontrol filter gaya GET (URL bisa dibagikan), kartu ringkasan, grafik batang pakai ulang `CashflowChart.svelte`, daftar kategori dengan persentase, tabel dompet, baris perbandingan, empty state, tautan masuk dari nav desktop + beranda. Pemilik: ui-design.
- [ ] A5. Uji: preset rentang, batas inklusif, bucket + celah, agregasi, transfer dikecualikan, filter, scope user, `previous`. Pemilik: qa-review.
- [ ] A6. Gerbang `scripts/check.sh` di HEAD + verifikasi produksi via curl (sesi nyata) + deploy. Pemilik: orchestrator.

Catatan lingkup: tab harian/mingguan/bulanan TIDAK dipasang di beranda; beranda tetap grafik 6 bulan + tautan ke `/analytics`, supaya kontrol chart hanya ada di satu tempat dan cache KV dashboard (kunci: user) tidak perlu berubah.

## Sprint 3 tambahan (permintaan pemilik)
- [ ] A7. Perbaikan FAB `+`: tombol di nav bawah dan tombol "+ Transaksi" di header saat ini hanya `<a href="/transactions">` padahal labelnya "Tambah Transaksi Baru". Diarahkan ke `/transactions?new=1`; halaman transaksi membuka modal dari parameter `new` dan membersihkan parameter saat menutup. Pemilik: ui-design.
- [ ] A8. Kategori bawaan: `DEFAULT_CATEGORIES` (12 pengeluaran + 5 pemasukan, kolom `icon` dibiarkan NULL) + `seedDefaultCategories(event)` yang idempotent per (kind, nama) + action `seedDefaults` + tombol "Isi kategori bawaan" pada keadaan kosong `/categories`. Tidak ada seed otomatis saat daftar. Pemilik: domain-backend (+ tombol oleh ui-design).

## Sprint 4 — Halaman transaksi: periode, pengelompokan harian, filter ringkas
Keputusan pemilik (2026-11-12), keempatnya opsi yang diusulkan:
1. Rentang: **bulan + panah** `‹ November 2026 ›` sebagai satuan utama, tombol Kustom membuka date picker, ada opsi Semua. Default bulan berjalan.
2. Total harian: **net saja** (satu angka per hari).
3. Hari yang terbelah pagination: **total penuh dari query agregat**, jadi angka tetap benar walau barisnya belum termuat semua.
4. Filter: **ringkas di ponsel + sheet**, inline di desktop.

- [ ] B1. Kontrak URL `/transactions`: `period=YYYY-MM|all|custom` (+ `startDate`/`endDate` bila custom). Param lama `walletId`, `categoryId`, `type`, `limit`, `cursor`, `new` tetap. Pemilik: domain-backend.
- [ ] B2. `load` mengembalikan `filters.period`, `filters.label`, `periodNav { prev, next, isCurrent }`, `dayTotals [{ date, income, expense, net, count }]` (hanya hari yang muncul di halaman), `hasAnyTransaction`. Pemilik: domain-backend.
- [ ] B3. Query agregat harian di repo (Drizzle, parameterized): transfer dikecualikan dari income/expense/net, tetapi dihitung di `count`. Batas rentang inklusif memakai `from`/`to` (`T00:00:00.000Z` s/d `T23:59:59.999Z`) yang sudah ada di repo. Pemilik: domain-backend.
- [ ] B4. UI: baris periode ringkas + chip filter aktif + sheet filter; daftar dikelompokkan per hari dengan divider (nama hari + total net, teks sr-only lengkap); baris transaksi padat tanpa kartu per transaksi. Pemilik: ui-design.
- [ ] B5. Uji: resolusi periode (batas bulan, Februari, pergantian tahun, `all`, custom inklusif, period tak valid), agregat harian (transfer dikecualikan, `count` termasuk transfer), total hari terbelah = total hari penuh, kontrak pagination kursor tidak berubah. Pemilik: qa-review.

Catatan lingkup: pengelompokan dilakukan di klien dari daftar yang sudah urut `occurredAt` desc; server hanya memasok angka total per hari supaya tidak ada total yang salah saat satu hari terbelah dua halaman.
