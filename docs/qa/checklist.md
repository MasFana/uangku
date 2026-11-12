# Checklist Penerimaan QA (Acceptance Checklist) — Fase 1 (MVP)

Dokumen ini melacak kriteria penerimaan (acceptance criteria) berdasarkan `docs/specs/fase1-prd.md` §7, kepatuhan NFR, keputusan desain `docs/DECISIONS.md`, dan verifikasi otomatis QA untuk Sprint 1 & Sprint 2.

---

## 1. Kriteria Penerimaan Inti (Fase 1 PRD §7 & Sprint 2)

| ID | Skenario (Given-When-Then) | Status | Bukti / Catatan Verifikasi |
|---|---|---|---|
| **AC-01** | **Given** 3 dompet **WHEN** dashboard dibuka **THEN** total saldo = akumulasi saldo awal + seluruh mutasi terhitung akurat. | **LULUS (Unit)** | Teruji pada `tests/balance.test.ts` (`calculateMultipleWalletBalances` & `calculateWalletBalance`). |
| **AC-02** | **Given** transaksi baru **WHEN** dibuat **THEN** cache KV dashboard di-invalidate dan saldo dihitung ulang. | **LULUS (KV Unit)** | Teruji pada `tests/cache.test.ts` via Miniflare KV (TTL 60s & invalidasi mutasi). |
| **AC-03** | **Given** transfer Rp50.000 A→B **WHEN** dieksekusi **THEN** saldo A -50.000, saldo B +50.000, tercatat 1 baris `type='transfer'` dengan `transfer_wallet_id`. | **LULUS (Repo)** | Teruji pada `tests/balance.test.ts` dan `tests/isolation.test.ts`. |
| **AC-04** | **Given** export transaksi **WHEN** diunduh **THEN** file CSV valid dengan escaping karakter khusus (koma, tanda kutip, newline). | **TERTUNDA** | Menunggu implementasi streaming export (F9). |
| **AC-05** | **Given** mutasi saldo bervariasi (income, expense, transfer) **WHEN** diuji **THEN** seluruh kalkulasi matematika saldo dan arus kas lulus pengujian unit. | **LULUS** | 11 pengujian di `tests/balance.test.ts` lulus tanpa toleransi desimal (IDR integer truncation). |
| **AC-06** | **Given** transaksi difilter (rentang tanggal, dompet, kategori, tipe) **WHEN** query dieksekusi **THEN** data terfilter presisi dan kasus batas (tanggal sama, from > to, kosong) ditangani aman. | **LULUS (D1)** | Teruji pada `tests/transactions-query.test.ts`. |
| **AC-07** | **Given** pagination transaksi dengan `occurredAt` kembar **WHEN** paginasi bertahap **THEN** urutan `occurred_at DESC, id DESC` stabil, `hasMore`/`nextCursor` valid, tidak ada baris ganda atau terlewat. | **LULUS (D1)** | Teruji pada `tests/transactions-query.test.ts` (kursor komposit `occurredAt\|id`). |
| **AC-08** | **Given** pengguna belum login membuka rute terproteksi **WHEN** rute diakses **THEN** sistem mengalihkan ke `/login?redirectTo=...` dan kembali ke halaman asal setelah berhasil login. | **LULUS (Guard Unit)** | Teruji pada `tests/guard.test.ts` (`loginRedirectUrl` & `isPublicRoute`). Integrasi flow login menunggu E2E/CI. |
| **AC-09** | **Given** sesi aktif pengguna **WHEN** tombol logout ditekan **THEN** sesi terhapus dari D1 dan user dialihkan ke `/login`. | **TERTUNDA** | Menunggu aksi logout di shell / settings UI. |

---

## 2. Kepatuhan UI, Aksesibilitas & NFR (DESIGN.md & DECISIONS.md)

| Area | Kriteria Evaluasi | Status | Bukti / Catatan |
|---|---|---|---|
| **Format Mata Uang Rupiah** | Semua nominal uang di UI wajib tampil dalam format `Rp` tanpa desimal (misal `Rp12.500`, bukan `Rp12.500,00` atau `12500.00`). | **DIVERIFIKASI** | Skema DB dan model mewajibkan integer rupiah. Ditampilkan dengan `tabular-nums`. |
| **Aksesibilitas Grafik Tren** | Komponen grafik 6 bulan wajib memiliki teks alternatif atau `aria-label`/`aria-describedby` informatif untuk pembaca layar. | **TERTUNDA** | Komponen `CashflowChart.svelte` diverifikasi saat `ui-design` selesai. |
| **Peredaman Animasi (Reduced Motion)** | Bila browser/OS mengaktifkan `prefers-reduced-motion: reduce`, semua transform spring, scale, dan translate dinonaktifkan (hanya opacity). | **DIVERIFIKASI** | Tertera pada aturan `DESIGN.md` dan `@theme inline` di `src/app.css`. |
| **Aksesibilitas Kontras & Sentuhan** | Target sentuh tombol/interaktif ≥ 44px, kontras rasio minimal WCAG AA (4.5:1), border tebal 2–3px neo-brutalist. | **DIVERIFIKASI** | Dipindai otomatis via `impeccable detect`. |
| **Isolasi Multi-Tenant** | Data dompet, kategori, transaksi tidak bocor antar-user, transfer silang akun diblokir. | **LULUS** | Terverifikasi pada `tests/isolation.test.ts` dengan Cloudflare D1. |
| **Bundle Size Worker** | Ukuran build SSR worker di bawah 30 MB. | **LULUS** | Ukuran bundle SSR ~371 kB uncompressed. |

---

## 3. Validasi Skema Data (Valibot)

| Skema | Kasus Uji | Status |
|---|---|---|
| `CreateWalletSchema` / `UpdateWalletSchema` | Validasi tipe dompet, trimming nama, default saldo 0, tolak float. | **LULUS** (5 kasus uji) |
| `CreateCategorySchema` / `UpdateCategorySchema` | Validasi tipe, tolak nama kosong/spasi, warna hex opsional. | **LULUS** (3 kasus uji) |
| `CreateTransactionSchema` / `UpdateTransactionSchema` | Tolak nominal 0/negatif/float, validasi format ISO date. | **LULUS** (4 kasus uji) |
| `TransferSchema` | Validasi dompet asal & tujuan wajib ada dan berbeda, nominal transfer integer > 0. | **LULUS** (3 kasus uji) |
| `ListTransactionsQuerySchema` | Limit 1–100, filtering dompet, kategori, jenis transaksi, cursor pagination. | **LULUS** (3 kasus uji) |
