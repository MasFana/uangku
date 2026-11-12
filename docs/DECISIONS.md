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

## Kode
| Aspek | Keputusan |
|---|---|
| Pola arsitektur | **Berlapis**: `+page.svelte` → Remote Function (`*.remote.ts`) → repository (`src/lib/server/repos/*`) → Drizzle → D1. Route tidak boleh memanggil Drizzle langsung |
| Validasi | Valibot di semua batas input (form, remote function, query param) |
| Uang | Integer rupiah, tanpa float; tampil `Rp12.500` |
| Auth | Better-Auth + adapter Drizzle D1, sesi di D1 |
| Binding | `event.platform.env`; tidak pernah di module scope |
| Bahasa | Teks UI + commit message Indonesia; identifier & komentar kode Inggris |
| Test | Vitest `@cloudflare/vitest-pool-workers`; logika saldo wajib fungsi murni |
| Deploy | Lokal saja sampai kredensial Cloudflare tersedia; `--remote`/`deploy` hanya dengan izin orchestrator |

## Konsekuensi yang sudah diterima
- Neo-brutalism ringan berarti shadow keras pada kartu/Sheet; ini disengaja, bukan bug render.
- Motion expressive menambah ~5 KB JS pada bundle; masih jauh di bawah batas 30 MB.
- shadcn-svelte dipasang pada sprint 2 (orchestrator menyiapkan init-nya agar tidak bentrok `package.json`).
