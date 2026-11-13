-- Custom SQL migration: Backfill default categories for existing users without categories
-- Catatan: Daftar kategori bawaan di bawah harus cermin persis DEFAULT_CATEGORIES di src/lib/server/defaults.ts
-- (12 pengeluaran + 5 pemasukan, icon NULL, color sesuai token)

INSERT INTO `categories` (`id`, `user_id`, `name`, `kind`, `icon`, `color`, `archived`, `created_at`)
SELECT
	lower(hex(randomblob(16))),
	u.id,
	d.column1,
	d.column2,
	NULL,
	d.column3,
	0,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `user` u
CROSS JOIN (
	VALUES
		('Makan & Minum', 'expense', '#0f766e'),
		('Belanja Harian', 'expense', '#c2410c'),
		('Transportasi', 'expense', '#1d4ed8'),
		('Tagihan & Utilitas', 'expense', '#7c3aed'),
		('Sewa & Cicilan', 'expense', '#b91c1c'),
		('Kesehatan', 'expense', '#be123c'),
		('Pendidikan', 'expense', '#0369a1'),
		('Hiburan', 'expense', '#a21caf'),
		('Rumah & Perawatan', 'expense', '#4d7c0f'),
		('Keluarga', 'expense', '#c026d3'),
		('Donasi & Zakat', 'expense', '#15803d'),
		('Lain-lain', 'expense', '#525252'),
		('Gaji', 'income', '#0f766e'),
		('Bonus & THR', 'income', '#c2410c'),
		('Usaha & Freelance', 'income', '#1d4ed8'),
		('Bunga & Investasi', 'income', '#7c3aed'),
		('Lain-lain', 'income', '#525252')
) d
WHERE u.id NOT IN (SELECT DISTINCT user_id FROM `categories`);
