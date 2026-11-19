# PRD — Fase 1: Core (MVP)

Status: READY TO BUILD
Repo contract: lihat `../AGENTS.md`, `../PRODUCT.md`

## 1. Perimeter
In-scope: auth, dompet, kategori, transaksi (+foto struk), transfer antar dompet, dashboard, export CSV.
Out-of-scope: budget, tags, AI, multi-currency, PWA (lihat `fase2-prd.md`, `roadmap.md`).

## 2. Data Model (D1 + Drizzle)

```
users        id (text, better-auth), email, name, created_at
sessions     better-auth standar (D1 adapter)
accounts     better-auth standar

wallets      id TEXT PK, user_id FK, name TEXT NOT NULL, type TEXT CHECK IN
             ('cash','bank','ewallet','other'), initial_balance INTEGER DEFAULT 0
             (rupiah integer), icon TEXT, archived INTEGER(BOOL) DEFAULT 0,
             created_at
categories   id TEXT PK, user_id FK, name TEXT NOT NULL, kind TEXT CHECK IN
             ('expense','income'), icon TEXT, color TEXT,
             UNIQUE(user_id, name, kind)
transactions id TEXT PK, user_id FK, wallet_id FK NOT NULL, category_id FK NULL,
             type TEXT CHECK IN ('expense','income','transfer'),
             amount INTEGER NOT NULL CHECK (amount > 0),
             transfer_wallet_id FK NULL (hanya utk type=transfer),
             note TEXT, occurred_at TEXT (ISO date, default now),
             receipt_key TEXT NULL (kunci objek R2),
             created_at, updated_at
             INDEX (user_id, occurred_at DESC), INDEX (wallet_id, occurred_at)
budgets      -- FASE 2
```

Konsistensi saldo: saldo dompet dihitung `initial_balance + SUM(income) - SUM(expense) - SUM(transfer keluar) + SUM(transfer masuk)`. Tidak menyimpan saldo redundan di tabel wallets (menghindari drift). Perhitungan ini sekarang dilakukan di klien dari ledger IndexedDB (`src/lib/client/derive/**`), bukan di-cache di KV.

## 3. User Stories + Kriteria (EARS)

### Auth
- U1: Sebagai user, saya daftar/masuk dengan email+password.
  - WHEN user submit form valid THE SYSTEM SHALL membuat sesi Better-Auth dan redirect ke /dashboard.
  - WHEN kredensial salah THE SYSTEM SHALL menampilkan error inline tanpa membocorkan field mana yang salah.
  - Kriteria: Given user baru WHEN register THEN session cookie SameSite=Lax; Given email terdaftar THEN 409 inline.

### Dompet
- U2: Kelola dompet (create/edit/archive, set saldo awal).
  - WHEN wallet dibuat THE SYSTEM SHALL validasi nama unik per user, type di enum.
  - IF wallet punya transaksi THEN archive, bukan delete.
- U3: Lihat daftar dompet + saldo masing-masing.

### Kategori
- U4: CRUD kategori dengan kind expense/income, ikon+warna dari DESIGN.md tokens.
  - IF kategori dipakai transaksi THEN archive/hide, bukan delete.

### Transaksi
- U5: Tambah transaksi ≤10 detik: jumlah (keypad numerik), dompet, kategori, catatan, tanggal (default hari ini).
  - WHEN submit valid THE SYSTEM SHALL insert dan menerapkan mutasi ke ledger lokal lalu menyinkronkannya lewat `/api/sync`.
  - WHEN amount ≤ 0 atau kosong THE SYSTEM SHALL menolak dengan pesan inline (Valibot).
- U6: Foto struk: pilih gambar → upload presigned URL R2 (max 5 MB, image/*) → simpan receipt_key.
  - WHEN file > 5 MB atau tipe tidak didukung THE SYSTEM SHALL menolak sebelum upload.
- U7: Edit/hapus transaksi miliknya sendiri. WHEN user lain mengakses id transaksi orang lain THEN 404.
- U8: Daftar transaksi: filter dompet/kategori/tanggal, paginasi cursor (occurred_at DESC), infinite scroll.

### Transfer
- U9: Transfer antar dompet → 1 baris transactions type=transfer (wallet_id=sumber, transfer_wallet_id=tujuan).
  - WHEN transfer sukses THE SYSTEM SHALL mengurangi sumber & menambah tujuan dalam 1 transaksi DB batch (drizzle batch D1).

### Dashboard
- U10: Dashboard: total saldo semua dompet, arus kas bulan berjalan (in/out/net), breakdown kategori pengeluaran bulan ini, grafik 6 bulan terakhir, 10 transaksi terakhir.
  - WHEN data dibutuhkan THE SYSTEM SHALL membaca dari ledger IndexedDB lokal, tanpa permintaan jaringan.

### Export
- U11: Export CSV seluruh transaksi (kolom: tanggal, tipe, dompet, kategori, jumlah, catatan). Generate streaming dari D1 → response attachment.

## 4. NFR (dari riset Cloudflare)
- TTFB dashboard < 200 ms; CPU per request < 10 ms (free plan) — query diindeks.
- Bundle worker < 30 MB; Valibot tree-shaken.
- R2: zero egress, file struk private — akses via endpoint auth'd yang fetch dari R2 binding, bukan public bucket.
- Secrets: BETTER_AUTH_SECRET, AI_* (Fase 2) via `wrangler secret put`.
- Observability: enabled. Error → page +page.error.svelte rapi.

## 5. API/Remote Functions kontrak (server)
| Fungsi (.remote.ts) | Tipe | Error |
|---|---|---|
| wallets.list / create / update / archive | query/command | VALIDATION, DUPLICATE |
| categories.list / create / update / archive | query/command | VALIDATION, DUPLICATE |
| transactions.list(filters) | query | UNAUTHENTICATED |
| transactions.create / update / delete | command/form | VALIDATION, NOT_FOUND |
| transfers.create | command | VALIDATION, INSUFFICIENT? (saldo boleh minus → hanya VALIDATION) |
| receipts.uploadUrl(walletId,txId) | query | NOT_FOUND, FILE_TOO_LARGE |
| dashboard.summary() | query | UNAUTHENTICATED |
| export.csv() | query (stream) | UNAUTHENTICATED |

Semua fungsi: cek session di awal; `locals.user` dari Better-Auth (hooks.server.ts). Scope semua query berdasarkan `user_id`.

## 6. UI Screens (shadcn-svelte, mobile-first)
1. /login, /register — card tengah, DESIGN.md colors
2. /dashboard — saldo hero, kartu arus kas, grafik (Chart dari shadcn-svelte), list terakhir, FAB +
3. /transactions — list terfilter + infinite scroll; /transactions/new — sheet modal keypad
4. /wallets — list saldo; /wallets/[id] — detail + riwayat
5. /settings — export CSV, kelola kategori, logout

## 7. Acceptance (Given-When-Then ringkas)
- Given 3 dompet WHEN dashboard THEN total = jumlah saldo + mutasi benar.
- Given transaksi baru WHEN dibuat THEN saldo dan ringkasan dihitung ulang dari ledger lokal (verify: turunan klien cocok dengan agregat SQL D1).
- Given transfer 50rb A→B THEN saldo A -50rb, B +50rb, satu baris type=transfer.
- Given export THEN CSV valid, kolom escape benar (note berisi koma/kutip).
- Given test saldo: unit test kalkulasi saldo (income/expense/transfer mix) lulus di Vitest.
