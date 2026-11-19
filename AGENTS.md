# AGENTS.md — Aturan Repo Uangku

Konteks wajib untuk AI coding agent yang bekerja di repo ini.

## Stack (jangan deviasi)
- **SvelteKit 3 + Svelte 5 (runes)** — TypeScript strict
- **Adapter**: `@sveltejs/adapter-cloudflare` (Workers Static Assets)
- **DB**: Cloudflare D1 + Drizzle ORM. Migrasi: `drizzle-kit generate` → `wrangler d1 migrations apply APP_DB --local|--remote`. DILARANG `drizzle-kit push`.
- **Validasi**: Valibot (bukan Zod — hemat 14 KB di edge)
- **Data**: halaman data merender dari ledger IndexedDB (`ssr = false`, tanpa `load`); semua mutasi lewat `/api/sync` dengan antrian outbox. Tidak ada form action data
- **UI**: shadcn-svelte (Bits UI v1) + Tailwind CSS v4 (`@theme`, token OKLCH) — kontrak token ada di `DESIGN.md`
- **Auth**: Better-Auth dengan adapter D1. Akses binding via `event.platform.env` lalu `cloudflare:workers` (adapter ^8). JANGAN akses binding di module scope.
- **File**: R2 (foto struk, belum aktif) — DILARANG pakai `fs`
- **AI**: endpoint OpenAI-kompatibel sendiri via `fetch` dari server. Secrets: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — DILARANG hardcode atau taruh di `vars` wrangler.

## Kontrak desain
- Semua UI mengikuti `./DESIGN.md` — lihat bagian "UI & Design System".
- Sebelum selesai, jalankan `npx impeccable detect src/` dan perbaiki temuan P0/P1.

## Aturan kode
- Mata uang: **IDR** — simpan sebagai integer rupiah (tanpa desimal), bukan float.
- Semua query D1 lewat Drizzle; parameterized — tidak ada string SQL mentah dari input user.
- Logging: `console.log` JSON terstruktur. Observability enabled di wrangler.
- Test: Vitest (suite D1 memakai `getPlatformProxy` dari `wrangler`) untuk logic; happy path + edge case untuk kalkulasi saldo.
- Node compat: `compatibility_flags: ["nodejs_compat"]`.
