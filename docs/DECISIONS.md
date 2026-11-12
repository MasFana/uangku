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
| Domain produksi | **akularping.my.id** (custom domain Cloudflare). Worker memakai `routes` dengan `custom_domain: true` |
| Data awal | **Seed demo lokal saja** (`--local`); database produksi kosong, tanpa kategori bawaan |

## Kode
| Aspek | Keputusan |
|---|---|
| Pola arsitektur | **Berlapis**: `+page.server.ts` (`load` + form actions) → layanan `src/lib/server/services/*` → repository `src/lib/server/repos/*` → Drizzle → D1. Route tidak boleh memanggil Drizzle langsung |
| Remote functions SvelteKit | **TIDAK dipakai.** Flag `experimental.remoteFunctions` tetap mati. Berkas `*.remote.ts` lama sudah dipindah ke `src/lib/server/services/*.ts` karena namanya menyesatkan |
| Validasi | Valibot di semua batas input (form action, load, query param) |
| Uang | Integer rupiah, tanpa float; tampil `Rp12.500` |
| Auth | Better-Auth + adapter Drizzle D1, sesi di D1 |
| Binding | `event.platform.env`; tidak pernah di module scope |
| Bahasa | Teks UI + commit message Indonesia; identifier & komentar kode Inggris |
| Test | Vitest `@cloudflare/vitest-pool-workers`; logika saldo wajib fungsi murni |
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
- Detector desain: `/root/.claude/skills/impeccable/scripts/impeccable detect --json src/` (bukan `npx impeccable`).

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
- Akun Cloudflare: `Fanaapi425@gmail.com's Account`, id `7df6da303aefe528f78028f5d5526d94`; CLI login sebagai `adrianfathan69@gmail.com` (OAuth).
- Resource dibuat 2026-11-12: D1 `APP_DB` id `e73aa0f0-258d-400b-8bd9-e93bb39a48b3` (region APAC), KV `CACHE` id `cafd7699ba264d41873423b82644b8c1`.
- **R2 dinonaktifkan sementara** di `wrangler.jsonc`: `wrangler r2 bucket create` gagal dengan `code 10042 Please enable R2 through the Cloudflare Dashboard`. Binding `RECEIPTS` dan bucket `uangku-receipts` dinyalakan kembali saat F6 (upload struk) dikerjakan. Pemilik harus mengaktifkan R2 di dashboard dulu.
- Secret wajib di produksi: `BETTER_AUTH_SECRET` (acak, ≥32 karakter), `BETTER_AUTH_URL=https://akularping.my.id`. Secret `AI_*` belum diisi karena `.dev.vars` masih berisi placeholder dan fitur AI belum diimplementasikan.

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
