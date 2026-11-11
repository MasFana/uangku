# PRODUCT.md — Uangku

## Apa
App keuangan pribadi berbasis web: catat pemasukan/pengeluaran, kelola dompet, lihat dashboard dan insight (AI). Berjalan penuh di Cloudflare Workers.

## Siapa
Individu di Indonesia yang ingin mencatat keuangan harian dengan cepat, terutama dari HP. Satu pemilik akun (multi-user terpisah, bukan sharing keluarga di MVP).

## Mengapa
Aplikasi keuangan umum: iklan, data di server orang lain, fitur berbayar. Uangku: milik sendiri, gratis (free tier Cloudflare), cepat di edge, AI insight pakai endpoint sendiri.

## Prinsip
1. Input transaksi ≤ 10 detik dari buka app.
2. Mobile-first — semua fitur utama nyaman di layar 360px.
3. Data bisa keluar kapan saja (export CSV).
4. Rupiah integer; tidak ada angka desimal yang membingungkan.

## Batasan
- Bahasa UI: Indonesia.
- Mata uang: IDR saja (MVP).
- Tanpa email, tanpa notifikasi push, tanpa langganan berulang (Fase 3+ bisa).
- AI: endpoint OpenAI-kompatibel milik sendiri (konfigurasi via secret).

## Non-goals (Fase 1–2)
Bank sync/e-wallet otomatis, multi-currency, PDF, PWA offline, sharing keluarga, web publik. Lihat Fase 3 di specs/roadmap.

## Metrik sukses
- Waktu input transaksi < 10 detik.
- Dashboard TTFB < 200 ms di edge.
- Nol data hilang: saldo dompet = mutasi transaksi, selalu konsisten.
