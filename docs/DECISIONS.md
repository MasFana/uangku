# DECISIONS.md — Keputusan Tetap Proyek Uangku

Semua role **wajib** mengikuti berkas ini. Bila keputusan di sini bertentangan dengan preferensi pribadimu, lapor ke orchestrator — jangan ubah sendiri.

## Desain (diputuskan pemilik proyek)
| Aspek | Keputusan |
|---|---|
| Arah visual | **Neo-brutalism ringan** — border tebal 2–3px, shadow keras tanpa blur, blok warna sebagai aksen; palet tenang, bukan neon |
| Referensi | Gumroad + [neobrutalism.dev](https://neobrutalism.dev) — ambil pola border, shadow keras, aksen blok warna |
| Font | **Instrument Sans** (UI) + **JetBrains Mono** (angka, kode, kolom angka). Angka rupiah selalu `font-variant-numeric: tabular-nums` |
| Mode warna | **Terang dulu**; token gelap tetap ditulis lengkap di `@theme` supaya bisa diaktifkan tanpa menulis ulang |
| Motion | **Hidup/expressive** — 120–250 ms, spring untuk sheet/modal, angka counter di dashboard. **Wajib** hormati `prefers-reduced-motion: reduce` (matikan transform & spring, sisakan opacity) |
| Ikon | **Lucide** (`lucide-svelte`), tanpa emoji di UI |
| Library komponen | **shadcn-svelte** (Bits UI v1) — di-restyle mengikuti token DESIGN.md, bukan warna bawaan |

Larangan visual (dari skill antislop, tetap berlaku): gradien ungu-biru, kartu bersarang, font default tanpa alasan, teks pemasaran generik, kontras di bawah WCAG AA, target sentuh < 44px.

## Produk & operasi
| Aspek | Keputusan |
|---|---|
| Login | **Email + password saja** (Better-Auth `emailAndPassword`). Tanpa OAuth, tanpa magic link, tanpa verifikasi email |
| Branding | Nama **Uangku** + **monogram huruf** bergaya brutalist (SVG sendiri). Tanpa ikon bawaan Lucide untuk logo |
| Domain produksi | **`https://akularping.my.id`** — custom domain Cloudflare, dipindah oleh pemilik. Hostname `workers.dev` tetap hidup dan menyajikan build yang sama. `routes` sengaja TIDAK ditulis di `wrangler.jsonc`: repo ini template publik, dan domain dipasang di dashboard |
| Data awal | **Seed demo lokal** (`--local`). Di produksi, 17 kategori bawaan disisipkan otomatis saat akun dibuat (lihat bagian "Kategori bawaan") |

## Kode
| Aspek | Keputusan |
|---|---|
| Pola arsitektur | **Client-first untuk data**: halaman merender dari ledger IndexedDB (`src/lib/client/**`, `ssr = false`, tanpa `load`); mutasi hanya lewat `/api/sync` → layanan `src/lib/server/services/*` → repository `src/lib/server/repos/*` → Drizzle → D1. Endpoint `/api/*` tidak boleh memanggil Drizzle langsung |
| Remote functions SvelteKit | **TIDAK dipakai.** Flag `experimental.remoteFunctions` tetap mati. Berkas `*.remote.ts` lama sudah dipindah ke `src/lib/server/services/*.ts` karena namanya menyesatkan |
| Validasi | Valibot di semua batas input (`/api/sync`, route auth, query param) |
| Uang | Integer rupiah, tanpa float; tampil `Rp12.500` |
| Auth | Better-Auth + adapter Drizzle D1, sesi di D1 |
| Binding | `event.platform.env`; tidak pernah di module scope |
| Bahasa | Teks UI + commit message Indonesia; identifier & komentar kode Inggris |
| Test | Vitest (`pool: forks`); suite D1 memakai `getPlatformProxy` dari `wrangler`; logika saldo wajib fungsi murni |
| Deploy | Lokal saja sampai kredensial Cloudflare tersedia; `--remote`/`deploy` hanya dengan izin orchestrator |

## Konsekuensi yang sudah diterima
- Neo-brutalism ringan berarti shadow keras pada kartu/Sheet; ini disengaja, bukan bug render.
- Motion expressive menambah ~5 KB JS pada bundle; masih jauh di bawah batas 30 MB.

## shadcn-svelte (sudah di-init)
- `uangku-app/components.json` dibuat **orchestrator** dengan preset gaya `nova`, base color `neutral`, alias: components `$lib/components`, ui `$lib/components/ui`, utils `$lib/utils`, lib `$lib`, hooks `$lib/hooks`.
- Dependency shadcn (`clsx`, `tailwind-merge`, `tailwind-variants`, `bits-ui`, `@lucide/svelte`, `tw-animate-css`) sudah dipasang role infra. Jalankan `add` dengan `--no-deps-install` agar `package.json` tidak berubah.
- **`src/app.css` dan `src/lib/utils.ts` milik `ui-design` TIDAK BOLEH ditimpa CLI.** Sebelum `add`, salin dulu berkas itu; setelah `add`, rekonsiliasi manual. Token warna/radius/style dari shadcn wajib diganti token DESIGN.md, bukan dipakai apa adanya.
- Preset `nova` hanya menentukan bentuk awal komponen; identitas visual tetap dari `DESIGN.md`.

## Aturan host (Alpine musl)
- Setiap perintah `wrangler` butuh `LD_PRELOAD=/usr/local/lib/libresinit.so`.
- **`wrangler dev` tidak dapat dipakai**: setiap permintaan HTTP membuat workerd crash (`unimplemented: getcontext(context)`). Yang jalan: perintah `wrangler d1 ...` dan Miniflare di dalam tes vitest. Uji end-to-end harus lewat CI atau setelah deploy.
- Detector desain: `impeccable detect --json src/` (dipasang terpisah; gate melewatinya bila tidak ada di `PATH`).

## Insiden kehilangan pekerjaan (pohon kerja bersama)
- Kejadian: tiga berkas uji QA (`tests/cache.test.ts`, `tests/guard.test.ts`, `tests/transactions-query.test.ts`), tambahan `docs/qa/checklist.md`, perubahan `vitest.config.ts`, koreksi `/api/auth/` di `guard.ts`, dan alias `$lib` di `vite.config.ts` hilang dari disk. `git reflog` tidak menunjukkan `reset`; polanya cocok dengan `git checkout -- .` dan/atau `git clean -fd`.
- Akar masalah: pekerjaan yang sudah berfungsi dibiarkan **belum ter-commit** di satu pohon kerja bersama, lalu dihapus oleh perintah pembersihan role lain.
- Aturan: commit segera setelah pekerjaan berfungsi; dilarang `git clean`/`git reset`/`git checkout`/`git restore`/`git stash` di pohon kerja bersama (lihat `TEAM.md`).
- Akibat yang harus diingat: setiap laporan "uji lulus" tidak sah lagi setelah berkas ujinya hilang — verifikasi harus diulang setelah berkas ditulis ulang dan di-commit.

## Alias `$lib` di SvelteKit 3
- SvelteKit 3 mencabut `$lib` bawaan (`module_removed_lib`). Alias dipasang di tingkat Vite: `resolve.alias` `$lib: fileURLToPath(new URL('./src/lib', import.meta.url))` pada `vite.config.ts`.
- Opsi `alias` milik SvelteKit **tidak** dipakai: sudah deprecated (`config_option_deprecated_alias`). Alias Vite juga menyelesaikan pemeriksaan `module_removed_lib` karena plugin berhenti lebih dulu bila `this.resolve()` berhasil.
- Dipilih alias, bukan migrasi ke `#lib`, karena keluaran `shadcn-svelte add` memakai `$lib/...` dan `components.json` memakai alias itu.

## Perintah berat di host ini
- `npm run check` (~3 mnt), `npm run build` (~3 mnt), dan `npx vitest run` (~1,5–3 mnt) harus dijalankan **berurutan**, tidak bersamaan antar-role. RAM host 1,9 GB; perintah berat serentak menyebabkan timeout (kejadian: `npm run check` timeout 2×).

## Deploy produksi (Sprint 2)
- Akun Cloudflare: satu akun kerja; nama dan id akun tidak ditulis di repo.
- Resource dibuat 2026-11-12: D1 `APP_DB` (region APAC) dan KV `CACHE`. Id D1 ada di `uangku-app/wrangler.jsonc`; siapa pun yang memakai repo ini menggantinya dengan miliknya sendiri (`docs/development.md`). KV `CACHE` dihapus dari konfigurasi saat cache dasbor server dihapus (dasbor dihitung di klien).
- **R2 dinonaktifkan sementara** di `wrangler.jsonc`: `wrangler r2 bucket create` gagal dengan `code 10042 Please enable R2 through the Cloudflare Dashboard`. Binding `RECEIPTS` dan bucket `uangku-receipts` dinyalakan kembali saat F6 (upload struk) dikerjakan. Pemilik harus mengaktifkan R2 di dashboard dulu.
- Secret wajib di produksi: `BETTER_AUTH_SECRET` (acak, ≥32 karakter), `BETTER_AUTH_URL=https://akularping.my.id`. Hostname `workers.dev` tetap bisa login karena `BETTER_AUTH_TRUSTED_ORIGINS` memuatnya. Secret `AI_*` belum diisi karena `.dev.vars` masih berisi placeholder dan fitur AI belum diimplementasikan.

## Akses binding di produksi: `cloudflare:workers`, bukan `event.platform`
- SvelteKit 3 membaca `event.platform` dari opsi `server.respond({ platform })`. `@sveltejs/adapter-cloudflare@8.0.2` hanya mengirim `env` ke `server.init` dan **tidak** mengirim `platform` (lihat `node_modules/@sveltejs/adapter-cloudflare/files/worker.js`).
- Akibat di produksi: `event.platform` selalu `undefined` (di dev terisi lewat `platformProxy`), semua akses D1 mati, `/api/auth/*` balas 500 `{"error":"Database binding APP_DB missing"}`, dan guard menolak semua halaman karena cabang `env?.APP_DB` gagal.
- Perbaikan: `hooks.server.ts` membaca `import { env } from 'cloudflare:workers'` (modul yang disediakan adapter untuk dev dan produksi) dan menyimpannya di `event.locals.env`; `event.platform?.env` tetap dipakai lebih dulu sebagai cadangan. Route auth membaca `event.locals.env`.
- Akses `cloudflare:workers` ditunda sampai request dan dijaga `building` — proxy-nya melempar bila disentuh saat build.

## Kolom FK dari form: `''` harus menjadi `null`
- Input opsional mengirim string kosong. Kolom FK (`category_id`, `transfer_wallet_id`, `receipt_key`) menolak `''` dengan `FOREIGN KEY constraint failed (SQLITE_CONSTRAINT_FOREIGNKEY)`, sehingga simpan transaksi gagal 400 di produksi.
- Perbaikan: `optionalId` di `src/lib/server/validation.ts` mengubah `''` menjadi `null` pada `CreateTransactionSchema` dan `UpdateTransactionSchema`; uji regresi di `tests/valibot-schemas.test.ts`.

## Nama field form harus dipetakan di action
- Form mengirim `fromWalletId`/`toWalletId` dan `date`, sedangkan `TransferSchema` memakai `sourceWalletId`/`targetWalletId` dan skema transaksi memakai `occurredAt`. Akibatnya transfer gagal 400 (`Invalid key: Expected "sourceWalletId"`) dan tanggal pilihan pengguna diabaikan (selalu `now`).
- Perbaikan di `src/routes/transactions/+page.server.ts`: pemetaan nama field eksplisit dan `occurredAtFrom()` yang mengubah `YYYY-MM-DD` menjadi ISO UTC tengah malam, konsisten dengan perbandingan filter di `src/lib/server/repos/transactions.ts`.

## Verifikasi produksi
- `uangku-app/scripts/smoke.sh` memeriksa `/login` 200, `/api/auth/get-session` 200, dan `/` 303 — cukup untuk menangkap "binding mati" yang di UI tampak seperti redirect biasa.
- Urutan hapus data bila perlu mengosongkan DB: `transactions` → `wallets` → `categories` → `session`/`account` → `"user"`. Menghapus `"user"` langsung gagal karena FK `transactions.wallet_id` memakai `onDelete: restrict`.

## Guard: `Accept: image/*` tidak boleh membuat halaman publik (perbaikan produksi)
- `isPublicRequest` mengembalikan `true` bila header `Accept` memuat substring `image/`. Chrome dan Safari mengirim `image/avif, image/webp` pada navigasi halaman, jadi SETIAP request browser dianggap publik: pengguna tanpa sesi melihat beranda, bukan `/login`. `curl` tanpa header tidak menunjukkan gejala, sehingga bug hanya tampak di browser.
- Perbaikan di `src/lib/server/guard.ts`: request gambar diakui publik hanya bila `Accept` memuat `image/` **dan** tidak memuat `text/html`. `tests/guard.test.ts` menambah regresi dengan header `Accept` versi Chrome.
- Bukti produksi: `curl -H 'Accept: text/html,...,image/avif,image/webp,...' /` → 303 `/login?redirectTo=%2F` (sebelumnya 200).

## `sr-only` pada `<table>` tidak memotong lebar (geser horizontal di ponsel)
- `sr-only` memakai `overflow: hidden` + `width: 1px`, tetapi `overflow` tidak berlaku untuk `display: table`. Tabel ringkasan grafik (`CashflowChart.svelte`) tetap 812 px dan melebarkan dokumen menjadi 745 px, jadi nav bawah `fixed` dapat kotak selebar dokumen dan item di luar viewport 390 px. Gejalanya terbaca seperti "nav tidak responsif".
- Perbaikan: bungkus `<table>` dengan `<div class="sr-only">`, tanpa kelas pada tabelnya. Ponsel 320/390 px: `documentElement.scrollWidth == clientWidth` (dulu 744/745).

## Kontras hero beranda
- Teks hero memakai `text-neutral-900` di atas `bg-brand` (teal-500 `oklch(0.5 0.14 165)`, luminansi 0.146): rasio 3.35:1, gagal WCAG AA 4.5:1. Nilai dihitung dari warna hasil render.
- Perbaikan: token `text-brand-foreground` (putih di terang, hitam di gelap) pada `src/routes/+page.svelte`. Rasio terukur 5.35:1 (terang) dan 11.77:1 (gelap).

## Bottom navigation
- Label nav naik dari 10 px ke `text-xs` (12 px, skala yang sudah dipakai aplikasi) supaya tetap terbaca; tiap item punya `aria-current="page"` saat aktif dan umpan balik tekan `active:bg-surface-subtle` (sebelumnya hanya `hover`, tidak ada reaksi pada sentuh).
- Item nav terukur di dalam viewport: 320 px → x 4/66/191/254, lebar 62 px; 390 px → x 4/80/233/310, lebar 76 px. Semua ≥ 44×44 px.

## F9 Ekspor CSV (`/api/export`)
- Kolom: `tanggal,tipe,dompet,kategori,jumlah,catatan`; pemisah baris CRLF; BOM UTF-8 (`EF BB BF`) supaya Excel membaca aksen dengan benar; escape RFC 4180 (kutip ganda menjadi `""`).
- Baris transfer memakai nama dompet tujuan pada kolom kategori sebagai `-> Nama Dompet`. Jumlah selalu integer rupiah tanpa desimal.
- Repositori membaca per 200 baris lewat `TransactionsRepo.iterateAll` (kursor stabil `occurred_at, id`), respons di-stream, tidak ada penampung seluruh data di memori. Tanpa R2.
- Bukti produksi (3 transaksi uji): `200`, `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="uangku-transaksi-YYYY-MM-DD.csv"`, 3 byte pertama `ef bb bf`, catatan `Makan, "sate" ayam` tersimpan sebagai `"Makan, ""sate"" ayam"`, `0` nilai berdesimal, kategori kosong tetap kosong, transfer `-> Dompet Uji 2`.
- Uji unit: `tests/csv-export.test.ts` (6 uji; decoder uji memakai `ignoreBOM: true`, karena `TextDecoder` bawaan membuang BOM).

## Analitik dipisah ke `/analytics`
- Beranda hanya menyimpan grafik 6 bulan; menambahkan tab granularitas dan filter di beranda akan menampilkan kontrol grafik dua kali. Karena itu kontrol analitik hanya ada di `/analytics`, dan beranda menautkan ke sana.
- Semua filter lewat URL (`?range=month&granularity=day&walletId=...`): bisa di-bookmark, dan grafik dihitung dari ledger lokal yang sama dengan daftar, tanpa state klien yang bisa berbeda dari data.
- Transfer dikecualikan dari `income`/`expense`/`net` (konsisten dengan `calculateCashflow`), tetapi tetap dihitung di `count` — memindahkan uang antar dompet bukan pemasukan atau pengeluaran.
- Bucket dihitung UTC, minggu mulai Senin, dan rangkaian bucket selalu kontinu (hari tanpa transaksi tetap muncul bernilai 0) supaya grafik tidak menipu dengan celah waktu.
- Grafik memakai ulang `CashflowChart.svelte` tanpa perubahan; tidak ada pustaka chart.

## Kategori bawaan: 17 kategori, otomatis saat daftar, idempotent
- `DEFAULT_CATEGORIES` di `src/lib/server/defaults.ts`: 12 pengeluaran + 5 pemasukan, `icon` NULL (UI tidak merender ikon, jadi mengisinya hanya menambah data yang tidak terpakai).
- **Awalnya** penyisipan hanya lewat tombol "Isi kategori bawaan" (`POST ?/seedDefaults`), atas alasan pengguna tetap wajib membuat dompet lebih dulu dan seed otomatis bisa mengisi kategori yang tidak diinginkan.
- **Diubah** (2026-11-13): hook `databaseHooks.user.create.after` memanggil `seedDefaultsForUser(db, userId)`, jadi akun baru langsung punya kategori. Pengguna yang mendaftar lalu membatalkan tetap lebih paham aplikasinya saat melihat kategori yang sudah ada; kegagalan hook ditelan dan dicatat sebagai `console.log` JSON `{event: 'seed_default_categories_failed'}`, supaya kegagalan seed tidak menggagalkan pendaftaran. Tombol "Isi kategori bawaan" tetap ada untuk akun lama dan akun yang menghapus kategorinya.
- Akun yang sudah ada ditutup migrasi backfill `0001` (idempotent, `INSERT ... WHERE NOT EXISTS`).
- Idempotent per `(kind, nama huruf kecil)`: aman dipanggil berulang.
- `src/lib/server/services/categories.ts` menyisipkan per potongan 5 baris. Satu statement berisi 17 baris x 8 kolom = 136 parameter melebihi batas 100 parameter D1 (`D1_ERROR: too many SQL variables`). Batas ini terjawab di Miniflare maupun produksi, jadi jumlah kolom pada record wajib dihitung ulang bila ditambah.

## `/transactions`: periode bulanan dan divider harian
- Satuan rentang utama adalah **bulan** (`period=YYYY-MM`), dengan panah ‹ › dan opsi "Semua" serta "Kustom" (date picker). Alasan: pemakaian nyata hampir selalu "rekap bulan ini", sementara dua `<input type="date">` di ponsel menyulitkan.
- Total per hari **tidak** dihitung dari baris yang termuat. Pagination kursor 20 baris dapat membelah satu hari, dan menjumlahkan baris yang termuat menghasilkan total separuh yang tampak seperti angka benar. Karena itu server mengirim `dayTotals` hasil `GROUP BY` hari untuk hari-hari yang muncul di halaman; UI menandai bila baris termuat lebih sedikit daripada `count` hari itu ("memuat X dari Y").
- Batas rentang inklusif memakai bentuk yang sudah ada di repo: `T00:00:00.000Z` sampai `T23:59:59.999Z`, karena `occurred_at` disimpan sebagai ISO UTC tengah malam dari picker.
- `period` tidak valid ("2026-13", "abc") jatuh ke bulan berjalan, bukan 500. `periodNav.next` bernilai null pada bulan berjalan atau lebih baru, sehingga aplikasi tidak bisa membuka bulan kosong di masa depan.
- `dayTotals` hanya memuat hari yang ada di halaman (maksimum sebesar `limit`), jadi biayanya satu query agregat, bukan satu query per baris.

## Kerangka: judul header dan FAB
- Nama halaman di header diambil dari satu `routeMap` di `src/routes/+layout.svelte` yang juga dipakai nav desktop dan nav bawah. Dua daftar nama terpisah pasti akan berbeda suatu saat; satu peta tidak bisa.
- `"Uangku"` hanya tampil di beranda; di halaman lain monogramnya tetap ada sebagai tautan ke beranda dengan `aria-label="Uangku, beranda"` supaya nama aplikasi tidak hilang untuk pembaca layar.
- `<h1>` tiap sub-halaman menjadi `sr-only` karena judul sudah tampil di header. Struktur dokumen dan pembaca layar tetap mendapat satu `h1`, tetapi judul tidak tampil dua kali di layar ponsel.
- FAB berarti **catat transaksi** dan tersedia di semua halaman: tombol `+` di nav tengah (ponsel, `aria-label="Catat transaksi"`) dan FAB mengambang `hidden md:flex fixed bottom-6 right-6` di desktop yang sebelumnya tidak punya jalan pintas sama sekali. Tombol "+ Transaksi" di header dan "+ Catat Transaksi" di halaman transaksi dihapus karena menjadi duplikat.
- Dompet dan kategori **tidak** memakai FAB: aksinya jarang (sekali di awal), sementara FAB permanen menutupi konten setiap hari. Keduanya memakai tombol bertext lengkap di baris header halaman, sehingga pada layar dompet tombol `+` di nav (catat transaksi) dan "+ Tambah Dompet" tidak tampak identik.
- `main` memakai `md:pb-28` supaya FAB mengambang tidak menutupi baris terakhir atau tombol "Muat Lebih Banyak".

## Jam perangkat dan LWW

- Pemenang konflik per baris ditentukan HLC, dan HLC dibangun dari jam perangkat. Perangkat yang jamnya maju (atau diset bertahun-tahun ke depan) menang selamanya; perangkat yang jamnya mundur selalu kalah. Itu bug, bukan risiko teoretis.
- Klien memperbaiki **penyebabnya**: setiap respons `/api/sync` membawa `serverNow`, klien menghitung `offset = serverNow - (waktuKirim + rtt/2)` dan menyimpan sampel dengan RTT terkecil (estimator best-of-window). Stempel baru memakai `Date.now() + offset`, dan offset dipersist di `sync_meta.clockOffset` supaya restart offline tidak menghapus koreksinya.
- Server membatasi **akibatnya**: stempel lebih dari 60 detik di depan jam server (`MAX_HLC_FUTURE_SKEW_MS`) dilipat **ke jam server** lewat `canonicalizeHLC` (counter dan node id dipertahankan). Baris tetap ditulis dan id-nya dikembalikan di `canonicalized[]`, bukan `rejected[]`, karena penulisannya diterapkan.
- Target lipatan harus jam server, bukan batas toleransi. Smoke menemukan versi pertama (lipat ke `serverNow + 5 menit`) membuat baris tidak bisa diedit lagi selama 5 menit: setiap stempel baru kalah stale dibanding stempel masa depan baris itu sendiri.
- `canonicalized[]` masuk jalur adopsi paksa yang sama dengan `rejected[]`. Tanpa itu, perbandingan HLC akan mempertahankan stempel klien yang lebih tinggi dan justru menciptakan divergensi permanen.
- Ditolak: **menolak** stempel masa depan. Itu menghapus hasil edit pengguna hanya karena jam perangkatnya salah, dan untuk baris baru tidak ada versi server yang bisa diadopsi sehingga cursor tertahan selamanya.
- Ditolak: memakai `server_updated_at` saja sebagai penentu urutan. Itu membuang urutan edit offline yang dibuat sebelum sinkron.
- Batas 60 detik dipilih supaya drift normal (detik) tidak tersentuh, sementara jam yang jelas salah (menit sampai tahun) selalu dilipat.

## Kuota Cloudflare Free Tier

- Beban per siklus sync diukur dari kode, bukan tebakan: satu `POST /api/sync` = 1 Worker request, tiga `SELECT` delta, tiga `SELECT` kepemilikan (hanya bila ada mutasi), dan satu statement tulis per mutasi. Delta memakai indeks `(user_id, server_updated_at, id)`, jadi range kosong membaca **0 rows** — kuota 5 juta rows read/hari praktis tidak tersentuh saat idle. Yang benar-benar dipakai idle hanyalah kuota 100 ribu Worker request/hari.
- `daily_rollups` dan `monthly_rollups` dihapus (`drizzle/0004_wild_sway.sql`). Tidak ada satu pun query yang membacanya sejak analitik dihitung di klien, tetapi trigger menulis 2 baris tambahan per transaksi (4 rows per insert, 7 rows per update). Trigger dibuat ulang hanya dengan statement saldo dompet, karena trigger yang masih menunjuk tabel terhapus akan menggagalkan setiap tulis transaksi.
- Bukti trigger baru: insert transaksi income 5000 → `wallets.current_balance` 5000; soft-delete (hlc berubah) → kembali 0. `tests/be/categories-watermark.test.ts` mengunci jalur insert.
- Dedupe lintas tab lewat `BroadcastChannel`: setelah commit, tab pengirim mengirim `{ type: 'SYNCED', at }`, tab lain memanggil `SyncCoordinator.noteExternalSync(at)` dan tick 30 s-nya dilewati aturan freshness. Tanpa ini N tab = N siklus per 30 s (5 tab × 7 perangkat = 100.800 request/hari, habis).
- `reloadLocalData()` di akhir siklus dihapus: `commitSyncResultToIDB` sudah memasang array reaktif dari hasil merge, jadi pembacaan ulang empat store itu duplikat penuh per siklus.
- Ditolak: cache KV di depan cursor. KV membaca per request (100 ribu/hari) sedangkan delta D1 kosong membaca 0 rows; KV menulis dibatasi 1.000/hari; dan konsistensi eventual hingga 60 detik bisa menjawab "tidak ada perubahan" padahal baris sudah ada, lalu `newCursor = max(serverNow, …)` melewatinya secara permanen.
- Ditolak: memperlambat poll 30 s. Satu tab = 2.880 request/hari (2,9% kuota); menaikkannya menukar latensi multi-perangkat dengan tabungan yang tidak dibutuhkan.

## Pemicu sync: hanya mutasi dan muat halaman

- Poll 30 detik dihapus, begitu juga pemicu `focus`, `visibilitychange`, dan registrasi `periodicsync` di service worker. Siklus sekarang hanya terjadi saat: satu kali per muat halaman (`init`), setiap mutasi lokal, reconnect yang masih punya outbox, dan pesan Background Sync satu kali dari worker.
- Alasan angka: poll 30 detik = 2.880 request/hari per tab, sementara satu tab yang hanya sync saat menulis menghabiskan puluhan request/hari. Kuota Worker Free Tier 100 ribu/hari tidak lagi jadi pertimbangan.
- Trade-off yang diterima pemilik: perubahan dari perangkat lain baru terlihat saat halaman dimuat ulang atau saat pengguna menulis. Tidak ada tarikan latar.
- `ponytail:` bila suatu saat perlu tarikan saat tab kembali aktif, tambahkan pemicu `visibilitychange` yang hanya menyala setelah tab tersembunyi lebih dari 5 menit — jangan kembalikan interval.

## Cursor sync

- `newCursor = max(maxDelta, clientCursor)`. Versi lama memakai `max(serverNow, maxDelta, clientCursor)`: baris yang ditulis perangkat lain di antara `SELECT` delta dan penulisan respons punya `server_updated_at` di bawah `serverNow` sehingga terlewat selamanya. Tanpa poll, baris yang terlewat tidak akan pernah muncul lagi; mengirim ulang baris hanya idempoten.
- Versi yang disimpan adalah `SYNC_PROTOCOL_VERSION` (konstanta di `src/lib/shared/sync-contract.ts`), bukan versi build. Sebelumnya setiap deploy (dan setiap rebuild dev) menghapus cursor dan memaksa setiap klien mengunduh ulang seluruh ledger.
- Batas yang disadari: cursor masih berupa satu angka, jadi baris dengan `server_updated_at` identik dengan cursor tidak terkirim. Menutupnya butuh cursor komposit `(server_updated_at, id)` di kontrak; belum dilakukan karena tabrakan milidetik antar-perangkat praktis nol dan biayanya menyentuh kontrak, server, dan migrasi data klien.

## KV untuk auth: tidak dipakai

- Better-Auth sudah memakai `session.cookieCache` (`maxAge: 300`, `src/lib/server/auth.ts`): sesi divalidasi dari cookie bertanda tangan, jadi `getSession` **tidak** membaca D1 selama 5 menit.
- Bila KV dipakai sebagai cache sesi: setiap request jadi 1 KV read terhadap kuota 100 ribu/hari, dibanding 1 baris D1 per 5 menit per sesi terhadap kuota 5 juta rows/hari. KV 50x lebih mahal per pembacaan dan menambah langkah invalidasi saat logout.
- KV tetap tidak ada di `wrangler.jsonc`; `wrangler types` tidak lagi mendeklarasikan binding itu.
