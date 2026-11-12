# Checklist Penerimaan QA (Acceptance Checklist) — Fase 1 (MVP)

Dokumen ini melacak kriteria penerimaan (acceptance criteria) berdasarkan `docs/specs/fase1-prd.md` §7, kepatuhan NFR, dan verifikasi otomatis QA untuk Sprint 1 & Fase 1.

---

## 1. Kriteria Penerimaan Inti (Fase 1 PRD §7)

| ID | Skenario (Given-When-Then) | Status | Bukti / Catatan Verifikasi |
|---|---|---|---|
| **AC-01** | **Given** 3 dompet **WHEN** dashboard dibuka **THEN** total saldo = akumulasi saldo awal + seluruh mutasi terhitung akurat. | **LULUS (Unit)** | Teruji pada `tests/balance.test.ts` (`calculateMultipleWalletBalances` & `calculateWalletBalance`). Integrasi dashboard menunggu implementasi rute Sprint 2. |
| **AC-02** | **Given** transaksi baru **WHEN** dibuat **THEN** cache KV dashboard di-invalidate dan saldo dihitung ulang. | **TERTUNDA** | Menunggu implementasi KV dashboard di Sprint 2 (F3/F8). |
| **AC-03** | **Given** transfer Rp50.000 A→B **WHEN** dieksekusi **THEN** saldo A -50.000, saldo B +50.000, tercatat 1 baris `type='transfer'` dengan `transfer_wallet_id`. | **LULUS (Repo)** | Teruji pada `tests/balance.test.ts` dan `tests/isolation.test.ts` (verifikasi mutasi saldo transfer & kepemilikan dompet). |
| **AC-04** | **Given** export transaksi **WHEN** diunduh **THEN** file CSV valid dengan escaping karakter khusus (koma, tanda kutip, newline). | **TERTUNDA** | Menunggu implementasi streaming export di Sprint 2 (F9). |
| **AC-05** | **Given** mutasi saldo bervariasi (income, expense, transfer) **WHEN** diuji **THEN** seluruh kalkulasi matematika saldo dan arus kas lulus pengujian unit. | **LULUS** | 11 pengujian di `tests/balance.test.ts` lulus tanpa toleransi desimal (IDR integer truncation). |

---

## 2. Kepatuhan Keamanan & Tenant Isolation

| Area | Kriteria Evaluasi | Status | Bukti / Catatan |
|---|---|---|---|
| **Isolasi Dompet** | User A tidak dapat melihat, membaca ID, atau mengubah dompet milik User B. | **LULUS** | `tests/isolation.test.ts` (`isolates wallets between users`). Menggunakan real Cloudflare D1. |
| **Isolasi Kategori** | User A tidak dapat membaca atau mengarsipkan kategori milik User B. | **LULUS** | `tests/isolation.test.ts` (`isolates categories between users`). Menggunakan real Cloudflare D1. |
| **Isolasi Transaksi** | User A tidak dapat melihat, mengubah, atau menghapus transaksi milik User B. | **LULUS** | `tests/isolation.test.ts` (`isolates transactions between users`). Menggunakan real Cloudflare D1. |
| **Proteksi Transfer Silang User** | User dilarang melakukan transfer antar-dompet jika salah satu dompet bukan miliknya. | **LULUS** | `tests/isolation.test.ts` (`prevents cross-user wallet transfers`). `TransactionsRepo.transfer` melempar error. |
| **Parameter Sanitization** | Tidak ada query SQL mentah dari input pengguna; semua lewat parameterized queries Drizzle ORM. | **LULUS** | Diaudit pada repositori `wallets.ts`, `categories.ts`, dan `transactions.ts`. |

---

## 3. Validasi Skema Data (Valibot)

| Skema | Kasus Uji | Status |
|---|---|---|
| `CreateWalletSchema` / `UpdateWalletSchema` | Validasi tipe dompet (`cash`, `bank`, `ewallet`, `other`), trimming nama, default saldo 0, tolak non-integer. | **LULUS** (5 kasus uji) |
| `CreateCategorySchema` / `UpdateCategorySchema` | Validasi tipe (`income`, `expense`), tolak string kosong/spasi, warna hex opsional. | **LULUS** (3 kasus uji) |
| `CreateTransactionSchema` / `UpdateTransactionSchema` | Tolak nominal 0 atau negatif, tolak bilangan pecahan (float), validasi ISO timestamp `occurredAt`. | **LULUS** (4 kasus uji) |
| `TransferSchema` | Validasi dompet asal & tujuan wajib ada, nominal transfer > 0 integer. | **LULUS** (3 kasus uji) |
| `ListTransactionsQuerySchema` | Limit 1–100, filtering dompet, kategori, jenis transaksi, dan rentang tanggal. | **LULUS** (3 kasus uji) |

---

## 4. Kriteria Non-Functional Requirements (NFR)

- [x] **Mata Uang IDR Integer**: Seluruh skema DB dan fungsi kalkulasi memotong pecahan (`Math.trunc`) dan melarang nominal desimal.
- [x] **Typecheck Bebas Error**: `npm run check` menghasilkan `0 errors and 0 warnings`.
- [x] **Ukuran Bundle Worker**: Total build client + server jauh di bawah batas 30 MB (SSR bundle ~371 kB uncompressed, client ~47 kB).
- [x] **Impeccable Design Quality**: Pemindaian `impeccable detect --json src/` menghasilkan `[]` (0 temuan P0/P1).
- [x] **Automated Local Verification**: Skrip `uangku-app/scripts/check.sh` menggabungkan typecheck, build, impeccable, dan vitest dengan status exit non-zero bila ada kegagalan.
- [x] **Continuous Integration**: Workflow GitHub Actions `.github/workflows/ci.yml` siap menguji setiap pull request dan push ke branch utama.
