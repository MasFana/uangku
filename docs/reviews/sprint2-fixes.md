# Review: perbaikan bug produksi + F9 (2026-11-12)

## Gerbang di HEAD
- `npm run check` → `svelte-check found 0 errors and 0 warnings`
- `npm run build` → selesai (`@sveltejs/adapter-cloudflare`)
- `npx impeccable detect --json src/` → `[]`
- `npx vitest run` → 7 berkas, 71 uji lulus (termasuk 6 uji CSV dan regresi header `Accept`)

## Bug produksi yang diperbaiki
| Bug | Akar | Bukti perbaikan di produksi |
| --- | --- | --- |
| Beranda terbuka tanpa sesi | `isPublicRequest` menganggap publik setiap `Accept` yang memuat `image/`; browser ikut mengirim `image/avif, image/webp` saat navigasi | `curl` dengan header Chrome/Safari → 303 `/login?redirectTo=%2F`; browser tanpa cookie: `/`, `/transactions`, `/wallets`, `/settings`, `/api/export` → semuanya `/login` |
| Halaman bisa digeser horizontal, nav bawah tidak terjangkau | `sr-only` tidak memotong lebar `<table>` (812 px) sehingga dokumen melebar 745 px di viewport 390 px | emulasi 320 px dan 390 px: `clientWidth == scrollWidth` (320/320, 390/390) |
| Teks saldo sulit dibaca | `text-neutral-900` di atas teal-500 → 3.35:1 | warna render hero `oklch(1 0 0)` di atas `oklch(0.5 0.14 165)` → 5.35:1 |

## F9 Ekspor CSV
- Endpoint `GET /api/export` diuji dengan sesi nyata dan 3 transaksi: pengeluaran tanpa kategori dengan catatan berkoma dan berkutip, pemasukan berkategori, transfer antar dompet.
- Header, BOM, escape, format integer, kolom kategori transfer, dan jumlah baris diperiksa dari berkas hasil unduhan yang sebenarnya.

## Yang tidak diuji
- Unduhan lewat klik tautan di browser sungguhan (endpoint diuji dengan `curl` ber-sesi; tautan ada di `/settings`, belum diklik otomatis).
- Perilaku pada perangkat fisik (pengukuran memakai emulasi CDP; elemen `position: fixed` tidak bisa diukur apa adanya di headless, sehingga nav diukur dengan `position` sementara dijadikan `static`).
- `wrangler dev` masih tidak jalan di host Alpine musl (`getcontext` belum diimplementasi), jadi semua uji produksi memakai deploy sungguhan.
