import type { AppEvent } from '../types';
import { assertUser } from '../types';
import { StatsRepo } from '../repos/stats';
import {
	resolveAnalyticsRange,
	resolveGranularity,
	generateBuckets,
	getBucketKeyForDate,
	type AnalyticsRange,
	type AnalyticsGranularity,
	type AnalyticsTypeFilter
} from '../stats';

export interface AnalyticsQueryInput {
	range?: string | null;
	from?: string | null;
	to?: string | null;
	granularity?: string | null;
	walletId?: string | null;
	categoryId?: string | null;
	type?: string | null;
}

export interface AnalyticsResult {
	filters: {
		range: AnalyticsRange;
		from: string; // YYYY-MM-DD
		to: string; // YYYY-MM-DD
		granularity: AnalyticsGranularity;
		walletId?: string;
		categoryId?: string;
		type: AnalyticsTypeFilter;
	};
	summary: {
		income: number;
		expense: number;
		net: number;
		count: number;
		avgPerDay: number;
		largest: {
			amount: number;
			occurredAt: string;
			note: string | null;
			categoryName: string | null;
		} | null;
	};
	series: Array<{
		bucket: string;
		label: string;
		income: number;
		expense: number;
	}>;
	categories: Array<{
		categoryId: string | null;
		name: string;
		total: number;
		count: number;
		color: string | null;
		share: number;
	}>;
	wallets: Array<{
		walletId: string;
		name: string;
		income: number;
		expense: number;
		net: number;
	}>;
	previous: {
		from: string;
		to: string;
		income: number;
		expense: number;
		net: number;
	} | null;
	options: {
		wallets: Array<{ id: string; name: string }>;
		categories: Array<{ id: string; name: string; kind: string }>;
	};
	range: {
		from: string;
		to: string;
	};
}

export async function getAnalyticsData(
	event: AppEvent,
	input: AnalyticsQueryInput = {}
): Promise<AnalyticsResult> {
	const { userId, db } = assertUser(event);
	const repo = new StatsRepo(db);

	// Validate / normalize type filter
	const typeFilter: AnalyticsTypeFilter =
		input.type === 'income' || input.type === 'expense' ? input.type : 'all';

	// 1. Fetch earliest transaction if range is 'all'
	let earliestOccurredAt: string | null = null;
	if (input.range === 'all') {
		earliestOccurredAt = await repo.getEarliestOccurredAt(userId);
	}

	// 2. Resolve date range bounds
	const resolvedRange = resolveAnalyticsRange(
		input.range,
		input.from,
		input.to,
		earliestOccurredAt
	);

	// 3. Resolve granularity
	const granularity = resolveGranularity(
		resolvedRange.range,
		input.granularity,
		resolvedRange.daysCount
	);

	const walletId = input.walletId ? input.walletId.trim() : undefined;
	const categoryId = input.categoryId ? input.categoryId.trim() : undefined;

	// 4. Fetch transactions for current period + filter options + previous period totals in parallel
	const [transactions, options, previousTotals] = await Promise.all([
		repo.getAnalyticsTransactions(userId, {
			from: resolvedRange.from,
			to: resolvedRange.to,
			walletId: walletId || undefined,
			categoryId: categoryId || undefined,
			type: typeFilter
		}),
		repo.getFilterOptions(userId),
		resolvedRange.previous
			? repo.getRangeTotals(
					userId,
					resolvedRange.previous.from,
					resolvedRange.previous.to,
					walletId || undefined,
					categoryId || undefined,
					typeFilter
				)
			: Promise.resolve(null)
	]);

	// 5. Generate series bucket frame
	const buckets = generateBuckets(resolvedRange.from, resolvedRange.to, granularity);
	const bucketMap = new Map<string, { income: number; expense: number }>();
	for (const b of buckets) {
		bucketMap.set(b.bucket, { income: 0, expense: 0 });
	}

	// 6. Aggregate summary, series, category breakdown, and wallet breakdown
	let totalIncome = 0;
	let totalExpense = 0;
	const totalCount = transactions.length;

	let largestTx: {
		amount: number;
		occurredAt: string;
		note: string | null;
		categoryName: string | null;
	} | null = null;

	const categoryAgg = new Map<
		string,
		{
			categoryId: string | null;
			name: string;
			total: number;
			count: number;
			color: string | null;
		}
	>();

	const walletAgg = new Map<
		string,
		{
			walletId: string;
			name: string;
			income: number;
			expense: number;
		}
	>();

	for (const tx of transactions) {
		const amt = Math.trunc(tx.amount) || 0;

		// Track largest non-transfer transaction (by amount)
		if (tx.type !== 'transfer') {
			if (!largestTx || amt > largestTx.amount) {
				largestTx = {
					amount: amt,
					occurredAt: tx.occurredAt,
					note: tx.note,
					categoryName: tx.categoryName
				};
			}
		}

		// Transfers are excluded from income, expense, series, category, and wallet breakdown
		if (tx.type === 'transfer') {
			continue;
		}

		// Series aggregation
		const bKey = getBucketKeyForDate(tx.occurredAt, granularity);
		const bucketItem = bucketMap.get(bKey);
		if (bucketItem) {
			if (tx.type === 'income') {
				bucketItem.income += amt;
			} else if (tx.type === 'expense') {
				bucketItem.expense += amt;
			}
		}

		if (tx.type === 'income') {
			totalIncome += amt;
		} else if (tx.type === 'expense') {
			totalExpense += amt;
		}

		// Category aggregation
		const catKey = tx.categoryId ?? '__uncategorized__';
		const existingCat = categoryAgg.get(catKey);
		const catName = tx.categoryName ?? 'Tanpa Kategori';
		if (!existingCat) {
			categoryAgg.set(catKey, {
				categoryId: tx.categoryId,
				name: catName,
				total: amt,
				count: 1,
				color: tx.categoryColor
			});
		} else {
			existingCat.total += amt;
			existingCat.count += 1;
		}

		// Wallet aggregation
		const wKey = tx.walletId;
		const existingWallet = walletAgg.get(wKey);
		const wName = tx.walletName ?? 'Dompet';
		if (!existingWallet) {
			walletAgg.set(wKey, {
				walletId: wKey,
				name: wName,
				income: tx.type === 'income' ? amt : 0,
				expense: tx.type === 'expense' ? amt : 0
			});
		} else {
			if (tx.type === 'income') existingWallet.income += amt;
			if (tx.type === 'expense') existingWallet.expense += amt;
		}
	}

	// 7. Finalize series
	const series = buckets.map((b) => {
		const aggregated = bucketMap.get(b.bucket);
		return {
			bucket: b.bucket,
			label: b.label,
			income: aggregated?.income ?? 0,
			expense: aggregated?.expense ?? 0
		};
	});

	// 8. Finalize categories with share (0..1) ordered by total desc
	const baseCategoryDenominator =
		typeFilter === 'income'
			? totalIncome
			: typeFilter === 'expense'
				? totalExpense
				: totalIncome + totalExpense;

	const categoriesList = Array.from(categoryAgg.values())
		.sort((a, b) => b.total - a.total)
		.map((c) => ({
			...c,
			share: baseCategoryDenominator > 0 ? Number((c.total / baseCategoryDenominator).toFixed(4)) : 0
		}));

	// 9. Finalize wallets with net (income - expense)
	const walletsList = Array.from(walletAgg.values()).map((w) => ({
		walletId: w.walletId,
		name: w.name,
		income: w.income,
		expense: w.expense,
		net: w.income - w.expense
	}));

	// 10. Summary calculations
	const daysCount = Math.max(1, resolvedRange.daysCount);
	const avgPerDay = Math.round(totalExpense / daysCount);

	const previousResult =
		resolvedRange.previous && previousTotals
			? {
					from: resolvedRange.previous.from,
					to: resolvedRange.previous.to,
					income: previousTotals.income,
					expense: previousTotals.expense,
					net: previousTotals.net
				}
			: null;

	return {
		filters: {
			range: resolvedRange.range,
			from: resolvedRange.fromDateStr,
			to: resolvedRange.toDateStr,
			granularity,
			walletId: walletId || undefined,
			categoryId: categoryId || undefined,
			type: typeFilter
		},
		summary: {
			income: totalIncome,
			expense: totalExpense,
			net: totalIncome - totalExpense,
			count: totalCount,
			avgPerDay,
			largest: largestTx
		},
		series,
		categories: categoriesList,
		wallets: walletsList,
		previous: previousResult,
		options,
		range: {
			from: resolvedRange.from,
			to: resolvedRange.to
		}
	};
}
