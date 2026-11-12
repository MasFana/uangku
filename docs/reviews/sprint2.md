# Review Sprint 2 — Fungsionalitas Inti Uangku

Ditulis orchestrator setelah memeriksa sendiri hasil tiap role, bukan dari laporan mereka.
HEAD saat review: `7a5c340`.

Gerbang final dijalankan sekali di HEAD itu (`bash scripts/check.sh`, 9 mnt 37 s):
`svelte-check found 0 errors and 0 warnings` → build `✓ built` … `✔ done` → `Impeccable results: []` → `Test Files 6 passed (6)`, `Tests 61 passed (61)` → `=== ALL CHECKS PASSED ===`, `exit=0`.

## Ringkasan

Sprint 2 menutup inti aplikasi: dashboard, dompet, kategori, transaksi, transfer, guard rute, dan logout.
Yang **hijau** diverifikasi dengan menjalankan perintahnya sendiri; yang **tidak bisa diuji** di host ini ditulis apa adanya, bukan diklaim lulus.

## Hasil verifikasi yang kujalankan

| Tahap | Perintah | Hasil |
| --- | --- | --- |
| Tipe & Svelte | `npm run check` | 0 error, 0 warning |
| Build edge | `npm run build` | `✓ built`, `✔ done` (adapter Cloudflare) |
| Bau desain | `impeccable detect --json src/` | `[]` (nol temuan) |
| Uji | `npx vitest run` | 6 berkas, **59/59** lulus |
| Gerbang penuh | `bash scripts/check.sh` | keempat tahap lulus, `=== ALL CHECKS PASSED ===`, kode keluar **0**, uji **61/61** |
| Data lokal | `node:sqlite` atas D1 Miniflare | `wallets 3`, `categories 7`, `transactions 38`, `user 1` |
| Kontras | hitungan sendiri OKLCH → sRGB → WCAG | `teal-500` 5.35:1, `coral-500` 5.98:1 (AA lolos) |

## Perbaikan yang kutulis sendiri

- **`db6fea5`** — alias `$lib` dipasang di tingkat Vite (`resolve.alias`) dan rute publik dibatasi ke `path === '/api/auth' || path.startsWith('/api/auth/')`. Tanpa ini build gagal: SvelteKit 3 mencabut `$lib` bawaan, dan opsi `alias` SvelteKit sudah deprecated.
- **`14a9834`, `3b85f37`** — dokumen tugas dan keputusan diperbarui (alias `$lib`, aturan perintah berat berurutan).

## Temuan perbaikan dari audit

| Temuan | Siapa | Commit | Bukti pemeriksaanku |
| --- | --- | --- | --- |
| Kontras token gagal AA | ui-design | `3f4facd` | Dihitung ulang mandiri: 5.35:1 dan 5.98:1 |
| Grafik tanpa teks alternatif | ui-design | `3f4facd` | Tabel `sr-only` + `<caption>` + `aria-label` dinamis ada di `CashflowChart.svelte:47-71` |
| Modal tanpa `role="dialog"`/jebakan fokus | ui-design | `7ad0c1d` | Tiga halaman memakai `Dialog` Bits UI (`bits-ui ^2.21.0`); `svelte:window onkeydown` sudah nol |
| Logout menghapus cookie saja, sesi hidup di D1 | ui-design | `7a5c340` | Aksi memanggil `event.locals.auth.api.signOut({ headers })`; `as any` dan `handleLogout` hilang |
| Uji kursor tidak memakai timestamp kembar | qa-review | `afae335` | Uji menyisipkan 3 baris `2026-07-01T12:00:00.000Z` dan memeriksa urutan halaman eksak |
| Isolasi tenant hanya untuk baca | qa-review | `afae335` | Uji ubah/hapus/arsip lintas user menolak **dan** memeriksa data pemilik utuh |

## Kelemahan yang diketahui, belum diperbaiki

1. **Tidak ada uji di tingkat HTTP.** `vitest.config.ts` memakai vitest biasa; D1/KV disediakan dengan `new Miniflare(...)` programatik di dalam berkas uji. `SELF` dari `cloudflare:test` tidak tersedia. Guard, redirect login, dan logout hanya terbukti di tingkat unit (logika `guard.ts`) dan bacaan kode.
2. **`wrangler dev` tidak jalan di host ini.** Crash `Fatal uncaught kj::Exception: kj/async.c++:1429: unimplemented: getcontext(context)` pada Alpine musl. Akibatnya tampilan ponsel, jebakan fokus, dan alur login belum pernah dilihat di browser sungguhan.
3. **Galat validasi tampil di luar dialog.** Form memakai POST halaman penuh, jadi `fail(400, { error })` mengembalikan `showCreateModal` ke `false`; pesan muncul di banner halaman (`{#if form?.error}`), bukan di dalam dialog. Terlihat, tetapi tidak ideal.
4. **Parser angka memakai `parseInt(..., 10)`.** Aman untuk integer rupiah, tetapi `parseInt('12abc')` menjadi `12`; tidak ada penolakan tegas atas input bercampur. Nilai uang tetap integer di D1 (`integer('amount')`), jadi tidak ada risiko float.

## Insiden yang harus diingat

- Tiga berkas uji QA, `docs/qa/checklist.md`, `vitest.config.ts`, dan alias `$lib` **hilang dari pohon kerja bersama**. Pola `git reflog` cocok dengan `git checkout -- .` atau `git clean -fd`. Aturan ditulis di `TEAM.md` dan `docs/DECISIONS.md` (`f1c85e1`): commit segera setelah pekerjaan berfungsi, dan dilarang `git clean`/`git reset`/`git checkout -- .`/`git restore`/`git stash`.
- Penghapusan `Skeleton.svelte` milik ui-design ikut masuk ke commit orchestrator `3b85f37` karena berkas itu sudah ter-stage saat orchestrator commit. Sejak itu: commit hanya berkas sendiri, dan jangan men-stage berkas role lain.
- Satu role menunggu alamat sesi yang salah (`session-a3363bf5-...`, bukan ui-design). Aturan: jangan menebak alamat; periksa riwayat git.

## Yang belum ada (sesuai rencana, bukan cacat)

- `F9` export CSV — `AC-04` di checklist ditandai BELUM DIUJI karena belum diimplementasikan.
- `F6` upload struk R2, `Z1` budget, `Z2` deploy produksi (butuh kredensial Cloudflare).
