import type { TransactionDTO, TransactionType } from '$lib/shared/sync-contract';
import { lastUtcDayOfMonth, pad2, parseUtcDateString, todayInJakarta } from '$lib/shared/dates';

export interface TransactionListFilter {
	/** 'YYYY-MM' | 'all' | 'custom' (mirrors the server query param). */
	period?: string | null;
	/** Custom period bounds, 'YYYY-MM-DD'. */
	startDate?: string | null;
	endDate?: string | null;
	type?: TransactionType | null;
	walletId?: string | null;
	categoryId?: string | null;
	/** Case-insensitive substring match on `note` (server has no note search yet). */
	search?: string | null;
	/** 1-based; defaults to 1. */
	page?: number;
	/** Clamped to 1..100; defaults to 20 (same clamp as TransactionsRepo.list). */
	pageSize?: number;
}

export interface TransactionListResult {
	items: TransactionDTO[];
	total: number;
}

export interface ResolvedPeriodBounds {
	/** 'YYYY-MM' | 'all' | 'custom' */
	period: string;
	/** 'YYYY-MM-DD' or '' */
	startDate: string;
	/** 'YYYY-MM-DD' or '' */
	endDate: string;
}

const YEAR_MONTH = /^\d{4}-\d{2}$/;
/** Tanggal harus ada di kalender: `2026-02-31` dan `2026-13-99` ditolak. */
function isValidDateParam(value: string): boolean {
	return parseUtcDateString(value) !== null;
}

/**
 * Resolves period bounds for the transaction list. This is the only implementation: the
 * server no longer resolves periods, so the bounds live on the client.
 * The current month comes from the Jakarta calendar (`todayInJakarta`).
 */
export function resolvePeriodBounds(
	periodParam?: string | null,
	startDateParam?: string | null,
	endDateParam?: string | null,
	now: Date = new Date()
): ResolvedPeriodBounds {
	const rawPeriod = (periodParam ?? '').trim();
	// Bulan berjalan ditentukan kalender WIB: pukul 06:00 WIB tanggal 1 sudah bulan baru.
	const today = todayInJakarta(now);
	const nowYear = today.getUTCFullYear();
	const nowMonth = today.getUTCMonth();

	if (rawPeriod === 'all') {
		return { period: 'all', startDate: '', endDate: '' };
	}

	if (rawPeriod === 'custom') {
		let start = (startDateParam ?? '').trim();
		let end = (endDateParam ?? '').trim();
		const validStart = isValidDateParam(start);
		const validEnd = isValidDateParam(end);

		if (!validStart && !validEnd) {
			start = `${nowYear}-${pad2(nowMonth + 1)}-01`;
			end = `${nowYear}-${pad2(nowMonth + 1)}-${pad2(lastUtcDayOfMonth(nowYear, nowMonth))}`;
		} else if (!validStart && validEnd) {
			start = end;
		} else if (validStart && !validEnd) {
			end = start;
		}

		if (start > end) {
			const swap = start;
			start = end;
			end = swap;
		}

		return { period: 'custom', startDate: start, endDate: end };
	}

	let year = nowYear;
	let month = nowMonth;
	if (YEAR_MONTH.test(rawPeriod)) {
		const [py, pm] = rawPeriod.split('-').map(Number);
		if (pm >= 1 && pm <= 12 && py >= 1970 && py <= 2100) {
			year = py;
			month = pm - 1;
		}
	}

	const periodStr = `${year}-${pad2(month + 1)}`;
	return {
		period: periodStr,
		startDate: `${periodStr}-01`,
		endDate: `${periodStr}-${pad2(lastUtcDayOfMonth(year, month))}`
	};
}

/**
 * Filters/sorts/pages local transactions with the server's list semantics
 * (`TxRepo.list`): soft-deleted rows excluded, bounds compared
 * as ISO strings, order `occurredAt DESC, id DESC`, page size clamped to 1..100.
 */
export function filterTransactions(
	transactions: readonly TransactionDTO[],
	filter: TransactionListFilter = {},
	now: Date = new Date()
): TransactionListResult {
	const bounds = resolvePeriodBounds(filter.period, filter.startDate, filter.endDate, now);
	const fromIso = bounds.startDate ? `${bounds.startDate}T00:00:00.000Z` : '';
	const toIso = bounds.endDate ? `${bounds.endDate}T23:59:59.999Z` : '';
	const search = (filter.search ?? '').trim().toLowerCase();

	const matched: TransactionDTO[] = [];
	for (const tx of transactions) {
		if (tx.deletedAt != null) continue;
		if (fromIso && tx.occurredAt < fromIso) continue;
		if (toIso && tx.occurredAt > toIso) continue;
		if (filter.type && tx.type !== filter.type) continue;
		if (filter.walletId && tx.walletId !== filter.walletId) continue;
		if (filter.categoryId && tx.categoryId !== filter.categoryId) continue;
		if (search && !(tx.note ?? '').toLowerCase().includes(search)) continue;
		matched.push(tx);
	}

	matched.sort((a, b) => {
		if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
		if (a.id !== b.id) return a.id < b.id ? 1 : -1;
		return 0;
	});

	const pageSize = Math.min(Math.max(Math.trunc(filter.pageSize ?? 20) || 20, 1), 100);
	const page = Math.max(Math.trunc(filter.page ?? 1) || 1, 1);
	const offset = (page - 1) * pageSize;

	return { items: matched.slice(offset, offset + pageSize), total: matched.length };
}
