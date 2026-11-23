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
