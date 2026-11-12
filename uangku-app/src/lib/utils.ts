import { type ClassValue, clsx } from 'clsx';

/**
 * Format integer amount to Indonesian Rupiah without decimals.
 * Example: 12500 -> "Rp12.500", -50000 -> "-Rp50.000"
 * Uses tabular-nums compatible structure.
 */
export function formatRupiah(amount: number): string {
	const isNegative = amount < 0;
	const absolute = Math.abs(Math.round(amount));
	const formatted = absolute.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return isNegative ? `-Rp${formatted}` : `Rp${formatted}`;
}

/**
 * Format date string into Indonesian readable format.
 * Example: "2026-11-12" -> "12 Nov 2026"
 */
export function formatDateIndo(dateStr: string | Date): string {
	const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
	return new Intl.DateTimeFormat('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(date);
}

/**
 * Lightweight class name merger using clsx.
 */
export function cn(...inputs: ClassValue[]): string {
	return clsx(inputs);
}
