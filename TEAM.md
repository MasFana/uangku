# TEAM.md — Tim Persistent Uangku

Orchestrator: **Pi** (sesi utama). Semua laporan task ditulis dalam Bahasa Indonesia; commit message Indonesia; identifier & komentar kode Inggris.

## Aturan umum (semua role wajib baca)
- Baca `AGENTS.md`, `PRODUCT.md`, dan **`docs/DECISIONS.md`** (keputusan tetap: tema, pola kode, font, motion) sebelum menyentuh kode. Spec kerja: `docs/specs/fase1-prd.md` + `docs/specs/tasks.md`.
- Konteks teknis lengkap: `../Cloudflared-Project/00-OVERVIEW.md` + `../Cloudflared-Project/research/01..05`.
- **Bahasa**: teks UI + commit message Indonesia; nama variabel/fungsi/komentar kode Inggris.
- **Setor hasil**: commit kecil langsung ke `main` (repo `/home/public/pocket/uangku`), pesan commit `tipe(scope): deskripsi`. Jangan push (tidak ada remote).
- **Jangan** `wrangler deploy` / `d1 migrations apply --remote` (butuh kredensial; task terpisah bila token tersedia). Lokal OK: `--local`, `vite dev`, `vitest`, `vite build`.
- **Izin file**: hanya sentuh file milikmu (tabel di bawah). Butuh file orang lain? Kirim pesan ke orchestrator, jangan edit sendiri.
- `package.json` **hanya** milik Infra. Butuh dependency? Minta lewat orchestrator.
- Uang selalu integer rupiah. Tidak ada float. Tidak ada `fs`.
- Binding D1/R2/KV diakses dari `event.platform.env` (adapter ^8: `cloudflare:workers` env) — **jangan** di module scope.
- Sebelum lapor selesai: jalankan `npm run check` dan test terkait, lalu tulis hasilnya apa adanya (termasuk yang gagal).
- UI: ikuti `DESIGN.md` dan `docs/DECISIONS.md`; jalankan `npx impeccable detect src/` dan perbaiki temuan P0/P1. Muat skill `antislop` (+ `antislop-ui`, `antislop-human`, `antislop-layoutmobile` sesuai kebutuhan) dari `/root/.agents/skills/` dan patuhi isinya.

## Peta kepemilikan file

| Role | Alamat sesi | Pemilik file |
|---|---|---|
| **domain-backend** | `domain-backend` | `src/lib/server/db/schema.ts`, `src/lib/server/db/*`, `src/lib/server/repos/*`, `drizzle/*` (migrasi), `src/lib/server/auth.ts`, `src/routes/api/auth/[...all]/+server.ts`, `src/lib/**/*.remote.ts` |
| **infra-cloudflare** | `infra-cloudflare` | `wrangler.jsonc`, `drizzle.config.ts`, `vite.config.ts`, `package.json`, `tsconfig.json`, `.gitignore`, `.dev.vars.example`, `.github/workflows/deploy.yml`, `worker-configuration.d.ts`, `src/app.d.ts`, `src/hooks.server.ts`, `src/lib/server/env.ts` |
| **ui-design** | `ui-design` | `DESIGN.md`, `src/app.css`, `src/app.html`, `src/lib/components/**`, `src/lib/utils.ts`, `src/routes/**/+layout.svelte`, `src/routes/**/+page.svelte`, `src/routes/**/+error.svelte`, `static/**` |
| **qa-review** | `qa-review` | `vitest.config.ts`, `tests/**`, `scripts/**`, `.github/workflows/ci.yml`, `docs/qa/**` |

## Sprint 1 — Setup + Auth (target)

### infra-cloudflare
1. `wrangler.jsonc`: `name=uangku`, D1 `APP_DB`, R2 `RECEIPTS`, KV `CACHE`, assets `./build/client` binding `ASSETS`, `compatibility_date` terbaru, `compatibility_flags: ["nodejs_compat"]`, `observability.enabled: true`, `run_worker_first` untuk `/api/*`.
2. `vite.config.ts`: adapter-cloudflare (`platformProxy: { enabled: true, configPath: './wrangler.jsonc' }`), `@tailwindcss/vite`, `@sveltejs/vite-plugin-svelte`.
3. `svelte.config.js`: `adapter: adapterCloudflare()`.
4. `drizzle.config.ts`: dialect `sqlite`, driver `d1-http`/local, `schema: src/lib/server/db/schema.ts`, `out: drizzle`.
5. `src/hooks.server.ts`: Better-Auth (`svelteKitHandler`) + `event.locals.user`, `locals.db` (Drizzle D1), `locals.r2`, `locals.kv`.
6. `src/app.d.ts`: `App.Platform.env` dari `worker-configuration.d.ts`; `wrangler types` masuk script `npm run types`.
7. `src/lib/server/env.ts`: pembaca binding yang type-safe.
8. `.dev.vars.example` (BETTER_AUTH_SECRET, AI_* placeholder).
9. Skrip npm: `types`, `db:generate`, `db:migrate:local`, `test`, `deploy`.

### domain-backend
1. Drizzle schema: `wallets`, `categories`, `transactions` (+ indeks) sesuai `fase1-prd.md` §2, plus tabel Better-Auth (user/session/account/verification) via adapter D1.
2. `repos/*`: CRUD wallet/category/transaction/transfer dengan scope `user_id`; transfer pakai `db.batch`.
3. `src/lib/server/balance.ts`: kalkulasi saldo murni (initial + income - expense ± transfer) — **wajib** pure function supaya bisa diuji.
4. `auth.ts`: Better-Auth instance + adapter Drizzle D1; handler `src/routes/api/auth/[...all]/+server.ts` dengan `sveltekitCookies(getRequestEvent)`.
5. Migrasi dihasilkan via `npx drizzle-kit generate` (jangan `push`).

### ui-design
1. `DESIGN.md`: token 3 tingkat (primitive → semantic → component) dalam OKLCH + alasan singkat tiap keputusan.
2. `src/app.css`: Tailwind v4 `@import "tailwindcss"` + `@theme inline` yang memetakan token DESIGN.md; dark mode tanpa recompile.
3. `src/app.html`: lang `id`, meta viewport, font stack.
4. Shell: `+layout.svelte` mobile-first (bottom nav / FAB), `+error.svelte`.
5. Halaman `/login` & `/register` (form + state loading/error, target sentuh ≥44px).
6. Jalankan `npx impeccable detect src/`.

### qa-review
1. `vitest.config.ts`: `defineWorkersConfig` + `wrangler.configPath`, pool workers.
2. `tests/`: kalkulasi saldo (happy + edge: dompet tanpa transaksi, transfer keluar>masuk, transaksi masa depan), scope `user_id`, validasi Valibot.
3. `scripts/check.sh`: `npm run check` + `vitest run` + `npx impeccable detect src/` — exit non-zero bila gagal.
4. `.github/workflows/ci.yml`: svelte-check → test → build (tanpa deploy).
5. `docs/qa/checklist.md`: kriteria terima Fase 1 dari `fase1-prd.md` §7 sebagai daftar periksa.

## Alur koordinasi
- Role lapor ke orchestrator: apa yang selesai, bukti perintah + hasil, yang gagal/belum, permintaan dependency.
- Orchestrator me-relay permintaan dependency ke **infra-cloudflare**.
- Konflik file = bug proses: laporkan, jangan selesaikan sendiri.
