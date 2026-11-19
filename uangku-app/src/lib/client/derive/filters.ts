import type { TransactionDTO, TransactionType } from '$lib/shared/sync-contract';

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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH = /^\d{4}-\d{2}$/;

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function lastUtcDayOfMonth(year: number, monthIndex: number): number {
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Resolves period bounds with the same boundaries as `$lib/server/period.ts`
 * (`resolveTransactionPeriod`). Re-implemented here because SvelteKit forbids importing
 * `$lib/server/*` from client code; tests/be/derive-parity.test.ts asserts equality with
 * the server resolver so the two cannot drift.
 */
export function resolvePeriodBounds(
	periodParam?: string | null,
	startDateParam?: string | null,
	endDateParam?: string | null,
	now: Date = new Date()
): ResolvedPeriodBounds {
	const rawPeriod = (periodParam ?? '').trim();
	const nowYear = now.getUTCFullYear();
	const nowMonth = now.getUTCMonth();

	if (rawPeriod === 'all') {
		return { period: 'all', startDate: '', endDate: '' };
	}

	if (rawPeriod === 'custom') {
		let start = (startDateParam ?? '').trim();
		let end = (endDateParam ?? '').trim();
		const validStart = DATE_ONLY.test(start);
		const validEnd = DATE_ONLY.test(end);

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
 * (`TxRepo.list` + `resolveTransactionPeriod`): soft-deleted rows excluded, bounds compared
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
