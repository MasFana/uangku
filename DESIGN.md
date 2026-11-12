---
version: 1.0.0
name: Uangku Design System
description: Sistem desain Neo-Brutalism Ringan untuk aplikasi keuangan pribadi Uangku. Mengutamakan kontras tinggi, border tegas, bayangan keras tanpa blur, tipografi proporsional, dan blok warna tenang.
author: ui-design
tokens:
  primitive:
    color:
      neutral-0: "oklch(1.00 0.000 0)"
      neutral-50: "oklch(0.985 0.005 85)"
      neutral-100: "oklch(0.965 0.008 85)"
      neutral-200: "oklch(0.920 0.012 85)"
      neutral-300: "oklch(0.850 0.015 85)"
      neutral-400: "oklch(0.700 0.018 85)"
      neutral-500: "oklch(0.550 0.020 85)"
      neutral-700: "oklch(0.350 0.020 260)"
      neutral-800: "oklch(0.240 0.020 260)"
      neutral-900: "oklch(0.180 0.025 260)"
      neutral-950: "oklch(0.120 0.025 260)"
      teal-300: "oklch(0.820 0.090 165)"
      teal-500: "oklch(0.650 0.130 165)"
      teal-700: "oklch(0.450 0.120 165)"
      amber-300: "oklch(0.860 0.120 85)"
      amber-500: "oklch(0.740 0.140 85)"
      coral-300: "oklch(0.780 0.120 25)"
      coral-500: "oklch(0.620 0.160 25)"
      coral-700: "oklch(0.450 0.140 25)"
      blue-300: "oklch(0.820 0.090 240)"
      blue-500: "oklch(0.620 0.120 240)"
    space:
      xs: "4px"
      sm: "8px"
      md: "12px"
      lg: "16px"
      xl: "24px"
      2xl: "32px"
      3xl: "48px"
    radius:
      none: "0px"
      sm: "4px"
      md: "6px"
      lg: "8px"
      xl: "12px"
      full: "9999px"
    border-width:
      thin: "1px"
      base: "2px"
      thick: "3px"
    font-family:
      sans: "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    shadow-hard:
      sm: "2px 2px 0px 0px var(--color-shadow-solid)"
      base: "3px 3px 0px 0px var(--color-shadow-solid)"
      lg: "5px 5px 0px 0px var(--color-shadow-solid)"
  semantic:
    light:
      canvas: "var(--primitive-neutral-50)"
      surface: "var(--primitive-neutral-0)"
      surface-subtle: "var(--primitive-neutral-100)"
      surface-muted: "var(--primitive-neutral-200)"
      border: "var(--primitive-neutral-900)"
      content: "var(--primitive-neutral-900)"
      content-muted: "var(--primitive-neutral-700)"
      content-inverse: "var(--primitive-neutral-0)"
      shadow-solid: "var(--primitive-neutral-900)"
      brand: "var(--primitive-teal-500)"
      brand-hover: "var(--primitive-teal-700)"
      brand-foreground: "var(--primitive-neutral-900)"
      accent: "var(--primitive-amber-300)"
      income: "var(--primitive-teal-500)"
      income-foreground: "var(--primitive-neutral-900)"
      expense: "var(--primitive-coral-500)"
      expense-foreground: "var(--primitive-neutral-0)"
      transfer: "var(--primitive-blue-500)"
      transfer-foreground: "var(--primitive-neutral-0)"
      warning: "var(--primitive-amber-500)"
      warning-foreground: "var(--primitive-neutral-900)"
    dark:
      canvas: "var(--primitive-neutral-950)"
      surface: "var(--primitive-neutral-900)"
      surface-subtle: "var(--primitive-neutral-800)"
      surface-muted: "var(--primitive-neutral-700)"
      border: "var(--primitive-neutral-200)"
      content: "var(--primitive-neutral-50)"
      content-muted: "var(--primitive-neutral-300)"
      content-inverse: "var(--primitive-neutral-950)"
      shadow-solid: "var(--primitive-neutral-0)"
      brand: "var(--primitive-teal-300)"
      brand-hover: "var(--primitive-teal-500)"
      brand-foreground: "var(--primitive-neutral-950)"
      accent: "var(--primitive-amber-300)"
      income: "var(--primitive-teal-300)"
      income-foreground: "var(--primitive-neutral-950)"
      expense: "var(--primitive-coral-300)"
      expense-foreground: "var(--primitive-neutral-950)"
      transfer: "var(--primitive-blue-300)"
      transfer-foreground: "var(--primitive-neutral-950)"
      warning: "var(--primitive-amber-300)"
      warning-foreground: "var(--primitive-neutral-950)"
  component:
    button:
      min-height: "44px"
      border: "2px solid var(--color-border)"
      shadow: "3px 3px 0px 0px var(--color-shadow-solid)"
      shadow-active: "0px 0px 0px 0px transparent"
      transform-active: "translate(2px, 2px)"
      radius: "6px"
    input:
      min-height: "44px"
      border: "2px solid var(--color-border)"
      shadow-focus: "3px 3px 0px 0px var(--color-shadow-solid)"
      radius: "6px"
    card:
      border: "2px solid var(--color-border)"
      shadow: "3px 3px 0px 0px var(--color-shadow-solid)"
      radius: "8px"
    fab:
      min-size: "52px"
      border: "3px solid var(--color-border)"
      shadow: "4px 4px 0px 0px var(--color-shadow-solid)"
      radius: "9999px"
    nav-bottom:
      height: "64px"
      border-top: "2px solid var(--color-border)"
      background: "var(--color-surface)"
---

# DESIGN.md — Kontrak Desain Uangku

Dokumen ini adalah *single source of truth* identitas visual dan token desain aplikasi **Uangku**. Semua kode UI, styling Tailwind, dan komponen wajib mematuhi aturan di sini.

---

## 1. Arah Visual: Neo-Brutalism Ringan

Uangku mengusung gaya **Neo-Brutalism Ringan** (terinspirasi oleh *Gumroad* dan *neobrutalism.dev*). Gaya ini dipilih untuk memberikan rasa percaya, ketegasan data finansial, dan kesederhanaan operasional pada layar ponsel:

1. **Border Tegas (2–3px)**: Garis batas solid yang memisahkan elemen antarmuka tanpa ambigu. Tidak ada batas 1px samar yang membingungkan mata di bawah terik matahari.
2. **Hard Shadow (Bayangan Keras Tanpa Blur)**: Offset 2–4px solid (`3px 3px 0px #000`). Elemen berinteraksi terasa taktil seperti kartu fisik yang dapat ditekan.
3. **Blok Warna Tenang (Calm Palette)**: Menghindari warna neon menyilaukan. Kami menggunakan palet bersahaja: sage teal untuk pemasukan/brand, coral bersahaja untuk pengeluaran, amber hangat untuk transfer/peringatan.
4. **Anti AI-Slop**:
   - DILARANG menggunakan gradien ungu-ke-biru generik.
   - DILARANG menggunakan kartu bersarang (*nested cards inside cards*).
   - DILARANG glassmorphism berlebihan (latar belakang kabur di mana-mana).
   - DILARANG teks pemasaran generik atau dekorasi tanpa makna semantik.

---

## 2. Tipografi & Angka Finansial

- **Font Antarmuka (UI)**: `Instrument Sans` — tipografi sans-serif modern yang ekspresif, proporsional, dan sangat mudah dibaca pada layar kecil.
- **Font Angka & Kode**: `JetBrains Mono` — monospaced font berkarakter kuat untuk angka finansial.
- **Aturan Angka Rupiah**:
  - Semua angka mata uang wajib menggunakan `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) agar kolom angka tidak bergeser saat nilai berubah.
  - Format penulisan rupiah: integer tanpa desimal, awalan `Rp` tanpa spasi (contoh: `Rp12.500`, `Rp1.250.000`).

---

## 3. Sistem Token 3 Tingkat (OKLCH)

### Tier 1 — Primitive Tokens
Nilai absolut warna dalam ruang warna perceptually-uniform **OKLCH**, skala ruang, radius, dan ketebalan garis batas.

### Tier 2 — Semantic Tokens
Pemetaan peran warna fungsional untuk tema **Terang (Light)** dan **Gelap (Dark)**:
- `--color-canvas`: Latar belakang kanvas aplikasi (`#FBFBF9` pada mode terang).
- `--color-surface`: Latar belakang kartu, form, dan panel (`#FFFFFF`).
- `--color-border`: Garis batas komponen (`#1F2328` 2px solid).
- `--color-content`: Teks utama dengan kontras tinggi (rasio kontras > 14:1 terhadap kanvas, jauh melampaui standar WCAG AA 4.5:1).
- `--color-content-muted`: Teks sekunder/label (rasio kontras > 5.8:1, lolos WCAG AA).
- `--color-brand`: Warna identitas teal bersahaja.
- `--color-income`: Hijau teal untuk mutasi masuk / saldo surplus.
- `--color-expense`: Coral terracotta untuk pengeluaran / mutasi keluar.
- `--color-transfer`: Biru laut tenang untuk mutasi transfer antar dompet.
- `--color-shadow-solid`: Warna bayangan keras solid.

### Tier 3 — Component Tokens
Token fungsional per elemen:
- Tombol: tinggi minimum 44px (memenuhi target sentuh aksesibilitas mobile), border 2px solid, shadow keras 3px 3px. State aktif memberikan sensasi ditekan (`translate(2px, 2px)` dan shadow 0).
- Input: tinggi minimum 44px, border 2px solid, focus ring tegas.
- Kartu: border 2px solid, hard shadow 3px 3px, sudut lengkung lembut 8px (`rounded-lg`).
- Bottom Navigation: tinggi 64px, border-top 2px solid, target sentuh ikon minimum 44x44px.
- FAB (Floating Action Button): lingkaran 52px dengan border 3px solid dan hard shadow 4px 4px.

---

## 4. Aksesibilitas & Manusia (WCAG AA & Touch Targets)

- **Target Sentuh Minimum**: Semua tombol, navigasi, input, dan tautan memiliki dimensi sentuh minimal **44px × 44px** (sesuai standar WCAG 2.5.5 dan skill `antislop-human`).
- **Kontras Warna**:
  - Teks reguler wajib memenuhi rasio kontras minimal **4.5:1** terhadap latar belakangnya.
  - Teks besar / judul wajib memenuhi minimal **3.0:1**.
  - Garis batas komponen interaktif wajib memenuhi minimal **3.0:1**.
- **Indikator Fokus Keyboard**: Menggunakan outline tegas 2px dengan offset (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900`).
- **Pencegahan Error**: Form input menampilkan pesan error inline yang jelas tanpa menyembunyikan label.

---

## 5. Gerak & Transisi (Motion)

- **Karakter Gerak**: Ekspresif dan hidup (durasi 120ms–200ms) menggunakan kurva pegas (*spring* / cubic-bezier) untuk interaksi taktil seperti penekanan tombol dan kemunculan sheet modal.
- **Kepatuhan Aksesibilitas (`prefers-reduced-motion`)**:
  - Jika pengguna mengaktifkan mode pengurangan gerak pada perangkatnya, semua efek transformasi translasi, rotasi, dan skala dinonaktifkan.
  - Hanya transisi opasitas (*opacity fade*) sederhana yang dipertahankan.

---

## 6. Branding & Ikonografi

- **Logo**: Monogram huruf **U** bergaya brutalist geometris tebal dengan latar blok warna brand dan border 2–3px. Komponen mandiri di `src/lib/components/Logo.svelte` dan `static/favicon.svg`. DILARANG menggunakan ikon Lucide generik sebagai pengganti logo.
- **Ikonografi Aplikasi**: Menggunakan ikon garis bersih dari koleksi **Lucide** (`lucide-svelte`) untuk navigasi dan aksi pengguna. DILARANG menggunakan emoji pada antarmuka pengguna.
- **Kondisi Data Kosong (Empty States)**: Menampilkan ilustrasi brutalist sederhana dan ajakan bertindak (CTA) yang jelas saat user belum memiliki transaksi atau dompet.
