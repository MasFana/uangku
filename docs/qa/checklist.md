# Checklist Penerimaan QA (Acceptance Checklist) — Fase 1 (MVP) & Sprint 2

Dokumen ini memetakan seluruh kriteria penerimaan berdasarkan `docs/specs/fase1-prd.md` §7, `AGENTS.md`, `DESIGN.md`, dan `docs/DECISIONS.md`. Setiap butir diverifikasi dengan bukti berkas dan baris kode atau nama berkas tes unit/integrasi.

> Catatan: dokumen ini snapshot Sprint 2. Rujukan berkas uji lama (`tests/balance.test.ts`, `tests/cache.test.ts`, `tests/stats.test.ts`, `tests/day-totals.test.ts`, `tests/transactions-query.test.ts`) sudah digantikan oleh suite saat ini; lihat `CONTRIBUTING.md` untuk daftar terbaru.

---

## 1. Kriteria Penerimaan Fungsional (PRD §7 & Sprint 2)

| ID | Skenario (Given-When-Then) | Status | Bukti Verifikasi / Alasan Belum Diuji |
|---|---|---|---|
| **AC-01** | **Given** 3 dompet **WHEN** dashboard dibuka **THEN** total saldo = akumulasi saldo awal + seluruh mutasi terhitung akurat. | **LULUS** | `tests/balance.test.ts:109-170` (`calculateMultipleWalletBalances`), `tests/balance.test.ts:40-108` (`calculateWalletBalance`). |
| **AC-02** | **Given** transaksi baru **WHEN** dibuat **THEN** saldo dan ringkasan dashboard dihitung ulang dari ledger lokal. | **LULUS** | `tests/be/derive-parity.test.ts` (turunan klien cocok dengan agregat SQL D1), `src/lib/client/derive/index.ts` (`deriveDashboard`). |
| **AC-03** | **Given** transfer Rp50.000 A→B **WHEN** dieksekusi **THEN** saldo A -50.000, saldo B +50.000, tercatat 1 baris `type='transfer'` dengan `transfer_wallet_id`. | **LULUS** | `tests/balance.test.ts:86-107`, `src/lib/server/repos/transactions.ts:167-210`, `tests/isolation.test.ts:225-245`. |
| **AC-04** | **Given** export transaksi **WHEN** diunduh **THEN** file CSV valid dengan escaping karakter khusus. | **LULUS** | `tests/csv-export.test.ts`, `src/routes/api/export/+server.ts`. |
| **AC-05** | **Given** mutasi saldo bervariasi **WHEN** diuji **THEN** seluruh kalkulasi matematika saldo dan arus kas integer IDR akurat. | **LULUS** | `tests/balance.test.ts:11-205` (11 test case lulus, pembulatan integer rupiah tanpa toleransi float). |
| **AC-06** | **Given** transaksi difilter (rentang tanggal, dompet, kategori, tipe) **WHEN** query dieksekusi **THEN** data terfilter presisi dan kasus batas ditangani aman. | **LULUS** | `tests/transactions-query.test.ts:89-183` (4 pengujian filtering: dompet, kategori, tipe, rentang tanggal `from > to`). |
| **AC-07** | **Given** pagination transaksi dengan `occurredAt` kembar **WHEN** paginasi bertahap **THEN** urutan `occurred_at DESC, id DESC` stabil, `hasMore`/`nextCursor` valid, tidak ada baris ganda atau terlewat. | **LULUS** | `tests/transactions-query.test.ts:184-297` (membuat 3 baris bertimestamp persis sama `2026-07-01T12:00:00.000Z`, dipaginasi limit 2 dengan cursor komposit tanpa item lompat/duplikat). |
| **AC-08** | **Given** pengguna belum login membuka rute terproteksi **WHEN** rute diakses **THEN** sistem mengalihkan ke `/login?redirectTo=...` dan kembali setelah login. | **LULUS (Guard)** | `tests/guard.test.ts:18-87` (`loginRedirectUrl` & `isPublicRoute`). Integrasi browser belum diuji karena `wrangler dev` crash di host Alpine musl (`kj/async.c++:1429 unimplemented: getcontext`). `SELF` dari `cloudflare:test` tidak tersedia tanpa `cloudflare()` pool di vitest config. |
| **AC-09** | **Given** sesi aktif pengguna **WHEN** tombol logout ditekan **THEN** sesi terhapus dari D1 dan user dialihkan ke `/login`. | **LULUS (mekanisme) / BELUM DIUJI (uji otomatis)** | Mekanisme aktif via `src/routes/settings/+page.svelte:81-89` (`form method="POST" action="?/logout"`) dan `src/routes/settings/+page.server.ts:10-18` (`auth.api.signOut({ headers })` menghapus baris session di D1 lalu `redirect(303, '/login')`). Endpoint Better-Auth client fallback di `POST /api/auth/sign-out` (`src/routes/settings/+page.svelte:8-16`). Uji otomatis full-flow menunggu environment test terintegrasi (`SELF` fetch). |

---

## 2. Kriteria Penerimaan Isolasi Multi-Tenant

| ID | Skenario | Status | Bukti Verifikasi |
|---|---|---|---|
| **ISO-01** | User B membaca daftar atau detail dompet User A | **LULUS** | `tests/isolation.test.ts:80-109` (`walletsRepo.list` terfilter, `walletsRepo.getById` menghasilkan `null`). |
| **ISO-02** | User B mencoba update dompet User A | **LULUS** | `tests/isolation.test.ts:173-193` (menghasilkan `null`, nama dompet Alice tetap utuh `Alice Vault`). |
| **ISO-03** | User B mencoba archive dompet User A | **LULUS** | `tests/isolation.test.ts:186-193` (menghasilkan `false`, status dompet Alice tetap `archived: false`). |
| **ISO-04** | User B membaca daftar atau detail kategori User A | **LULUS** | `tests/isolation.test.ts:111-137` (`categoriesRepo.list` terfilter, `categoriesRepo.getById` menghasilkan `null`). |
| **ISO-05** | User B mencoba update kategori User A | **LULUS** | `tests/isolation.test.ts:195-217` (menghasilkan `null`, nama kategori Alice tetap utuh `Alice Investment`). |
| **ISO-06** | User B mencoba archive/unarchive kategori User A | **LULUS** | `tests/isolation.test.ts:206-217` (menghasilkan `false`, kategori Alice tetap `archived: false`). |
| **ISO-07** | User B membaca daftar atau detail transaksi User A | **LULUS** | `tests/isolation.test.ts:139-160` (`transactionsRepo.list` terfilter, `transactionsRepo.getById` menghasilkan `null`). |
| **ISO-08** | User B mencoba update transaksi User A | **LULUS** | `tests/isolation.test.ts:161-171` (menghasilkan `null`, data `amount` dan `note` Alice tetap utuh). |
| **ISO-09** | User B mencoba delete transaksi User A | **LULUS** | `tests/isolation.test.ts:165-171` (menghasilkan `false`, transaksi Alice tetap ada di database). |
| **ISO-10** | User A mencoba transfer ke dompet milik User B | **LULUS** | `tests/isolation.test.ts:225-245` (`transactionsRepo.transfer` menolak dengan error `Target wallet not found`). |

---

## 3. Kriteria Arsitektur & Batasan Kode (AGENTS.md)

| Aturan Arsitektur | Status | Bukti / Catatan |
|---|---|---|
| **Mata Uang Integer Rupiah** | **LULUS** | `src/lib/utils.ts:16-23` (`formatRupiah`), `src/lib/server/db/schema.ts:18,52` (`integer('amount')`, `integer('initial_balance')`). Seluruh mutasi parsed via `parseInt(..., 10)`. |
| **Larangan Akses Binding Module-Scope** | **LULUS** | `src/lib/server/env.ts:9-52`, `src/hooks.server.ts:12-16`. Binding `APP_DB`, `RECEIPTS`, `CACHE` hanya diakses via `event.platform.env` / `event.locals`. |
| **Larangan Query DB Langsung di Rute** | **LULUS** | `src/routes/**` memanggil service/repo dari `$lib/server/services/*` dan `$lib/server/repos/*`, tidak mengimpor Drizzle langsung. |
| **Keamanan SQL (Parameterized Query)** | **LULUS** | Drizzle ORM digunakan untuk seluruh query. Satu-satunya fragmen `sql` ada di `src/lib/server/repos/wallets.ts:73` menggunakan tagged template parameterized. |
| **Larangan Modul `fs` di Edge Runtime** | **LULUS** | Modul `node:fs` hanya diimpor di `src/lib/server/db/seed.ts:2` (skrip migrasi/seed CLI lokal). Kode runtime app bersih dari `fs`. |

---

## 4. Aksesibilitas, UI & Catatan Keterbatasan Sistem

| Area | Status | Catatan / Bukti |
|---|---|---|
| **Aksesibilitas Modal / Dialog** | **LULUS** | Tiga modal manual diganti komponen `Dialog` Bits UI pada commit `7ad0c1d` (`focus trap`, `escape key`, ARIA title/desc terpasang). |
| **State Dialog Pasca Validasi Gagal** | **CATATAN DESAIN** | Karena form memakai POST halaman penuh, kembalian `fail(400, { error })` me-reset state open dialog ke `false`. Pesan galat Valibot muncul pada alert banner halaman, bukan di dalam dialog. |
| **Aksesibilitas Kontras & Sentuhan** | **LULUS** | Kontras warna OKLCH dan target sentuh ≥ 44px diperbaiki di commit `3f4facd`. |
| **Grafik Tren 6 Bulan Text Alternative** | **LULUS** | Atribut `role="img"` dan `aria-label` naratif ditambahkan ke `CashflowChart.svelte` di commit `3f4facd`. |
| **Peredaman Animasi (Reduced Motion)** | **LULUS** | Konfigurasi `@theme` dan aturan CSS neo-brutalist diatur di `src/app.css` & `DESIGN.md`. |
| **Keterbatasan Test Harness Cloudflare** | **TERCATAT** | Modul virtual `cloudflare:test` / `SELF` tidak dipakai pada setup vitest saat ini (tanpa cloudflare pool worker). `wrangler dev` crash di host Alpine musl (`kj/async.c++:1429 unimplemented: getcontext`). Verifikasi D1 dijalankan lewat `getPlatformProxy` dari `wrangler` di suite Vitest. |
