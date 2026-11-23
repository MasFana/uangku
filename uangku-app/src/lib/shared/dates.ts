/**
 * Tanggal untuk ledger Uangku.
 *
 * Satu transaksi menyimpan tanggal kalender sebagai ISO tengah malam UTC
 * (`YYYY-MM-DDT00:00:00.000Z`), jadi semua perbandingan, bucket, dan label memakai bagian
 * UTC dari nilai itu.
 *
 * "Hari ini" diambil dari kalender WIB (UTC+7, tanpa DST), bukan kalender UTC. Tanpa ini,
 * pukul 00:00-06:59 WIB masih terbaca sebagai hari (dan bulan) kemarin.
 */

/** WIB = UTC+7 sepanjang tahun; Indonesia tidak memakai DST. */
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export const INDO_MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'Mei',
	'Jun',
	'Jul',
	'Agu',
	'Sep',
	'Okt',
	'Nov',
	'Des'
];

export const INDO_MONTH_FULL = [
	'Januari',
	'Februari',
	'Maret',
	'April',
	'Mei',
	'Juni',
	'Juli',
	'Agustus',
	'September',
	'Oktober',
	'November',
	'Desember'
];

export function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

export function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function toUtcDateString(d: Date): string {
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Mengurai `YYYY-MM-DD` menjadi tengah malam UTC.
 *
 * Ketat: tanggal yang tidak ada di kalender (`2026-02-31`) ditolak, tidak digeser diam-diam
 * ke bulan berikutnya. Mengembalikan `null` bila bentuk atau nilainya salah.
 */
export function parseUtcDateString(s: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
	if (isNaN(date.getTime())) return null;
	// Round-trip: menolak tanggal mustahil yang dinormalkan Date.UTC.
	return toUtcDateString(date) === s ? date : null;
}

export function getUtcMonday(d: Date): Date {
	const day = d.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff, 0, 0, 0, 0));
}

/**
 * Hari kalender WIB pada `now`, dinyatakan sebagai tengah malam UTC dari tanggal yang sama.
 *
 * Bentuknya sama dengan `occurredAt` yang disimpan, jadi batas hari/minggu/bulan bisa
 * dibandingkan sebagai string tanpa konversi zona tambahan.
 */
export function todayInJakarta(now: Date = new Date()): Date {
	return startOfUtcDay(new Date(now.getTime() + JAKARTA_OFFSET_MS));
}

/** `YYYY-MM` dari hari kalender WIB pada `now`. */
export function jakartaMonthKey(now: Date = new Date()): string {
	return toUtcDateString(todayInJakarta(now)).slice(0, 7);
}

/** Selisih hari kalender (UTC) antara dua tengah malam. */
export function daysBetweenUtc(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Hari terakhir sebuah bulan: `(2026, 1)` -> 28. */
export function lastUtcDayOfMonth(year: number, monthIndex: number): number {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export type BucketGranularity = 'day' | 'week' | 'month';

/**
 * Rentang kalender satu titik grafik. Kunci harian/mingguan berbentuk `YYYY-MM-DD`
 * (mingguan = hari Senin), kunci bulanan `YYYY-MM`.
 *
 * Mengembalikan `null` bila kuncinya tidak sesuai granularitas, supaya pemanggil bisa
 * jatuh ke label ringkas daripada menampilkan rentang yang salah.
 */
export function bucketRange(
	bucket: string,
	granularity: BucketGranularity
): { startDate: string; endDate: string } | null {
	if (granularity === 'month') {
		if (!/^\d{4}-\d{2}$/.test(bucket)) return null;
		const [y, m] = bucket.split('-').map(Number);
		return { startDate: `${bucket}-01`, endDate: `${bucket}-${pad2(lastUtcDayOfMonth(y, m - 1))}` };
	}
	const start = parseUtcDateString(bucket);
	if (!start) return null;
	const end = new Date(start.getTime() + (granularity === 'week' ? 6 : 0) * 86400000);
	return { startDate: toUtcDateString(start), endDate: toUtcDateString(end) };
}

/**
 * Label sumbu ringkas dari kunci bulanan `YYYY-MM`: `2026-09` -> `Sep`.
 * Kunci yang tidak sesuai format dikembalikan apa adanya.
 */
export function monthKeyShortLabel(monthKey: string): string {
	if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
	return INDO_MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;
}

/**
 * Label panjang satu titik grafik: `3 Nov 2026`, `3 Nov 2026 - 9 Nov 2026`,
 * atau `November 2026`. Dipakai panel nilai grafik, bukan sumbu (sumbu tetap ringkas).
 */
export function bucketLabel(bucket: string, granularity: BucketGranularity): string {
	const range = bucketRange(bucket, granularity);
	if (!range) return bucket;
	const [sy, sm, sd] = range.startDate.split('-').map(Number);
	const [ey, em, ed] = range.endDate.split('-').map(Number);
	if (granularity === 'month') return `${INDO_MONTH_FULL[sm - 1] ?? ''} ${sy}`.trim();
	const startText = `${sd} ${INDO_MONTH_NAMES[sm - 1] ?? ''}`;
	if (granularity === 'day') return `${startText} ${sy}`;
	const endText = `${ed} ${INDO_MONTH_NAMES[em - 1] ?? ''}`;
	return sy === ey ? `${startText} - ${endText} ${sy}` : `${startText} ${sy} - ${endText} ${ey}`;
}
