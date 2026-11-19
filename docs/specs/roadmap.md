# Roadmap & PRD Fase 2–3 (ringkas)

## Fase 2 — Insight & Budget (setelah MVP stabil)
### Budget per kategori
- budgets: id, user_id, category_id FK, month TEXT (YYYY-MM), limit_amount INTEGER.
- UI progress bar; alert warna dari DESIGN.md saat ≥80%, ≥100%.
- EARS: WHEN transaksi expense dicatat THE SYSTEM SHALL update progres budget bulan terkait; WHEN limit terlampaui THEN badge merah di dashboard.

### Tags & pencarian
- tags (user_id, name), transaction_tags (many-to-many).
- Pencarian teks: D1 FTS5 virtual table pada note + category name + tags.

### AI via endpoint [OI]-kompatibel sendiri
- Konfigurasi: secrets `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (wrangler secret put). Tidak ada SDK vendor; pakai `fetch` POST `${AI_BASE_URL}/chat/completions`.
- Insight bulanan: agregat dari D1 → prompt ringkas (bahasa Indonesia) → jawaban streaming SSE ke UI.
  - WHEN user buka /insights THEN SYSTEM kirim konteks JSON (total per kategori, tren 3 bulan) dan render streaming.
  - IF endpoint gagal/timeout 15 s THEN tampilkan pesan ramah + retry, TANPA menampilkan detail error teknis.
- Scan struk (vision): foto struk R2 → kirim image (base64) ke endpoint vision → hasil JSON {merchant, total, date, items[]} (JSON mode / response_format) → user konfirmasi → create transaction.
  - WHEN JSON tidak valid THEN minta ulang 1x, lalu fallback manual.
- Catatan: seluruh prompt dalam Bahasa Indonesia; jangan kirim data user lain; konteks hanya milik user login.

### Kalkulator target nabung
- goals: id, user_id, name, target_amount, current_amount? (dihitung dari transaksi kategori 'nabung'), target_date.
- Tampilkan saran setoran/bulan (aritmetika sederhana, bukan AI).

## Fase 3 — Lengkap (later)
- Investasi & utang: assets (jenis, nilai, updated_at), debts (principal, rate, due); net worth = aset - utang + saldo dompet.
- Multi-currency: currencies table + kurs harian dari API publik (cache KV TTL 12 h); konversi saat tampil.
- Laporan PDF: generate via lib edge-safe atau render HTML cetak (window.print) — tanpa email.
- PWA offline: **sudah diimplementasikan pada Fase 1** (lihat `CHANGELOG.md`) — service worker + antrian mutasi lokal (IndexedDB) → sync via `/api/sync` saat online; konflik: HLC last-write-wins per transaksi.
- Sharing keluarga: workspace/family_id pada tabel utama + undangan; permission owner/member.

## Urutan kerja yang disarankan
1. fase1-prd.md (MVP) → deploy → pakai sendiri 1 minggu
2. Budget + tags (data model paling stabil dulu)
3. AI insight → scan struk (butuh endpoint siap)
4. Sisanya sesuai kebutuhan nyata kamu
