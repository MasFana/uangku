import type { CategoryDTO, TransactionDTO, WalletDTO } from '$lib/shared/sync-contract';
import { deriveWalletBalances, sumBalances } from './balances';

export { deriveWalletBalances, sumBalances } from './balances';
export { filterTransactions, resolvePeriodBounds } from './filters';
export type { TransactionListFilter, TransactionListResult, ResolvedPeriodBounds } from './filters';
export { deriveAnalytics } from './aggregates';
export type {
	AnalyticsQuery,
	AnalyticsResult,
	AnalyticsRange,
	AnalyticsGranularity,
	AnalyticsTypeFilter,
	AnalyticsLargest,
	AnalyticsCategoryRow,
	AnalyticsWalletRow,
	AnalyticsSeriesPoint
} from './aggregates';

export interface DashboardCategoryBreakdownRow {
	categoryId: string | null;
	categoryName: string;
	total: number;
	color: string | null;
}

export interface DashboardSummary {
	totalBalance: number;
	wallets: WalletDTO[];
	currentMonth: { income: number; expense: number; net: number };
	recentTransactions: Array<{
		id: string;
		walletId: string;
		categoryId: string | null;
		type: TransactionDTO['type'];
		amount: number;
		transferWalletId: string | null;
		note: string | null;
		occurredAt: string;
	}>;
	categoryBreakdown: DashboardCategoryBreakdownRow[];
	sixMonthTrend: Array<{ month: string; income: number; expense: number }>;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * Dashboard summary computed locally from IndexedDB contents with `deriveWalletBalances`, so
 * triggers/D1 drift cannot leak into the dashboard. Drift guard: `tests/be/derive-parity.test.ts`
 * checks these fields against plain SQL aggregates over the same rows.
 */
export function deriveDashboard(
	transactions: readonly TransactionDTO[],
	wallets: readonly WalletDTO[],
	categories: readonly CategoryDTO[],
	now: Date = new Date()
): DashboardSummary {
	const activeWallets = wallets.filter((w) => !w.archived && w.deletedAt == null);
	const balances = deriveWalletBalances(activeWallets, transactions);
	const walletsDto: WalletDTO[] = activeWallets.map((w) => ({
		...w,
		currentBalance: balances.get(w.id) ?? w.initialBalance
	}));

	const year = now.getUTCFullYear();
	const currentYm = `${year}-${pad2(now.getUTCMonth() + 1)}`;

	const monthKeys: string[] = [];
	for (let i = 5; i >= 0; i--) {
		const d = new Date(Date.UTC(year, now.getUTCMonth() - i, 1));
		monthKeys.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`);
	}
	const trendMap = new Map(monthKeys.map((ym) => [ym, { income: 0, expense: 0 }]));

	const active = transactions.filter((tx) => tx.deletedAt == null);
	const categoryMap = new Map(categories.map((c) => [c.id, c]));
	const monthCategoryTotals = new Map<string, number>();
	let currentIncome = 0;
	let currentExpense = 0;

	for (const tx of active) {
		if (tx.type !== 'income' && tx.type !== 'expense') continue;
		const amount = Math.trunc(tx.amount) || 0;
		const ym = tx.occurredAt.slice(0, 7);
		const trend = trendMap.get(ym);

		if (trend) {
			if (tx.type === 'income') trend.income += amount;
			else trend.expense += amount;
		}

		if (ym === currentYm) {
			if (tx.type === 'income') {
				currentIncome += amount;
			} else {
				currentExpense += amount;
				const key = tx.categoryId ?? '';
				monthCategoryTotals.set(key, (monthCategoryTotals.get(key) ?? 0) + amount);
			}
		}
	}

	const categoryBreakdown: DashboardCategoryBreakdownRow[] = Array.from(monthCategoryTotals.entries())
		.map(([categoryId, total]) => ({
			categoryId: categoryId || null,
			categoryName: categoryId ? (categoryMap.get(categoryId)?.name ?? 'Tanpa Kategori') : 'Tanpa Kategori',
			total,
			color: categoryId ? (categoryMap.get(categoryId)?.color ?? null) : null
		}))
		.sort((a, b) =>
			b.total !== a.total
				? b.total - a.total
				: (a.categoryId ?? '') < (b.categoryId ?? '')
					? -1
					: (a.categoryId ?? '') > (b.categoryId ?? '')
						? 1
						: 0
		);

	const recentTransactions = active
		.slice()
		.sort((a, b) => {
			if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
			if (a.id !== b.id) return a.id < b.id ? 1 : -1;
			return 0;
		})
		.slice(0, 10)
		.map((tx) => ({
			id: tx.id,
			walletId: tx.walletId,
			categoryId: tx.categoryId,
			type: tx.type,
			amount: Math.trunc(tx.amount) || 0,
			transferWalletId: tx.transferWalletId,
			note: tx.note,
			occurredAt: tx.occurredAt
		}));

	return {
		totalBalance: sumBalances(balances),
		wallets: walletsDto,
		currentMonth: { income: currentIncome, expense: currentExpense, net: currentIncome - currentExpense },
		recentTransactions,
		categoryBreakdown,
		sixMonthTrend: monthKeys.map((month) => ({
			month,
			income: trendMap.get(month)?.income ?? 0,
			expense: trendMap.get(month)?.expense ?? 0
		}))
	};
}
