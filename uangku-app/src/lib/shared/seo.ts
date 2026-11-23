// Satu sumber untuk judul dan deskripsi yang dipakai kartu bagikan (Open Graph/Twitter).
// Deskripsi statis ada di `src/app.html`; di sini hanya nilai tambahan yang butuh origin
// permintaan, karena gambar dan URL harus absolut.
export const SITE_NAME = 'Uangku';
export const SITE_TITLE = 'Uangku — Pencatat Keuangan Pribadi';
export const SITE_DESCRIPTION =
	'Catat pemasukan dan pengeluaran harian dalam rupiah. Data tersimpan di perangkat Anda, lalu disinkronkan saat online. Gratis, tanpa iklan.';
export const OG_IMAGE_PATH = '/og-image.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT =
	'Kartu Uangku bertuliskan Total Saldo Bersih Rp 12.480.000 dengan lencana Uangku.';

/** URL absolut terhadap host yang sedang melayani permintaan. */
export function absoluteUrl(origin: string, path: string): string {
	return `${origin.replace(/\/$/, '')}${path}`;
}

/** Data terstruktur untuk mesin pencari. URL memakai host permintaan, bukan host tetap. */
export function webApplicationJsonLd(origin: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: SITE_NAME,
		url: `${origin.replace(/\/$/, '')}/`,
		description: SITE_DESCRIPTION,
		applicationCategory: 'FinanceApplication',
		operatingSystem: 'Any',
		inLanguage: 'id',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' }
	};
}
