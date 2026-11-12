# Review Sprint 1 — Orchestrator

Tanggal review: 2026-11-12. Semua angka di bawah **dijalankan ulang oleh orchestrator**, bukan disalin dari laporan role.

## Hasil verifikasi mandiri
| Perintah | Hasil | Catatan |
|---|---|---|
| `npm run check` (svelte-check) | 0 error, 0 warning | dijalankan sendiri |
| `npm run build` (adapter-cloudflare) | sukses, `✔ done` | output `.svelte-kit/cloudflare` |
| `npx vitest run` | **35 test lulus** (3 berkas, 68 s) | termasuk 4 uji isolasi tenant lewat Miniflare D1 |
| `/root/.claude/skills/impeccable/scripts/impeccable detect --json src/` | `[]` (nol temuan) | pertama kali engine diunduh, jalankan bisa >2 menit |
| `wrangler d1 execute APP_DB --local` | `wallets=3, categories=7, transactions=38` | seed demo lokal nyata masuk |

Catatan jujur: perintah detector yang diberikan di brief awal (`npx impeccable detect src/`) **tidak valid** dan hasil "0 temuan" versi pertama dari UI tidak terbukti. Setelah perintah diperbaiki, hasilnya tetap nol temuan — angka di tabel ini yang sahih.

## Yang belum tuntas
- **A2 (guard rute)** belum ada: `hooks.server.ts` mengisi `locals.user`, tapi belum ada pengalihan ke `/login` untuk rute yang butuh sesi.
- **F1–F9 belum punya UI.** Sisi backend (repos + remote function wallet/kategori/transaksi/transfer/dashboard) sudah ada; halaman yang memakainya belum.
- **shadcn-svelte belum di-init** (dijadwalkan awal Sprint 2 oleh orchestrator agar tidak bentrok `package.json`).
- **Deploy belum dijalankan**: tanpa API token Cloudflare dan tanpa zone `akularping.my.id`, `Q5` tetap terblokir. `--remote` tidak dijalankan sekali pun.
- **`wrangler dev` tidak bisa dipakai di host ini.** Setiap permintaan HTTP membuat runtime workerd crash: `Fatal uncaught kj::Exception: kj/async.c++:1429: unimplemented: getcontext(context): Function not implemented`. Penyebab: musl (Alpine) tidak menyediakan API fiber glibc. Yang tetap jalan: perintah `wrangler d1 ...` dan Miniflare yang dipakai tes vitest. Karena itu **smoke test runtime lokal tidak bisa dipercaya**; uji end-to-end harus lewat CI (runner Ubuntu) atau setelah deploy.
- `@img/sharp-wasm32` muncul sebagai paket *extraneous* di `npm ls` (sisa instalasi, tidak dipakai runtime).

## Commit Sprint 1
| Hash | Isi |
|---|---|
| `450e90b` | UI: token OKLCH, komponen, shell navigasi, halaman login/register, error page |
| `04d485d` | Backend: skema D1, migrasi, repos, auth Better-Auth, `balance.ts`, seed |
| `9b4170f` | Infra: bindings + `hooks.server.ts`, `env.ts`, skrip npm, workflow deploy |
| `1b597e3` | QA: vitest suite, `scripts/check.sh`, checklist, workflow CI |
| `89e39ae` | Orchestrator: perbaikan perintah detector di dokumentasi |

Keputusan tetap Sprint 1 ada di `docs/DECISIONS.md`. Urutan kerja Sprint 2 ada di `docs/specs/tasks.md`.
