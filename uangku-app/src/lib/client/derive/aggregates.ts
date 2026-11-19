import type { CategoryDTO, TransactionDTO, WalletDTO } from '$lib/shared/sync-contract';

export type AnalyticsRange = 'week' | 'month' | 'year' | 'all' | 'custom';
export type AnalyticsGranularity = 'day' | 'week' | 'month';
export type AnalyticsTypeFilter = 'all' | 'income' | 'expense';

export interface AnalyticsQuery {
	range?: string | null;
	from?: string | null;
	to?: string | null;
	granularity?: string | null;
	walletId?: string | null;
	categoryId?: string | null;
	type?: string | null;
}

export interface AnalyticsLargest {
	amount: number;
	occurredAt: string;
	note: string | null;
	categoryName: string | null;
}

export interface AnalyticsCategoryRow {
	categoryId: string | null;
	name: string;
	total: number;
	count: number;
	color: string | null;
	share: number;
}

export interface AnalyticsWalletRow {
	walletId: string;
	name: string;
	income: number;
	expense: number;
	net: number;
}

export interface AnalyticsSeriesPoint {
	bucket: string;
	label: string;
	/** Alias of `label`: the axis key `CashflowChart` reads, so charts need no page-side adapter. */
	month: string;
	income: number;
	expense: number;
}

/**
 * Same field names/nesting as `AnalyticsResult` from `$lib/server/stats.ts`
 * (drift guard: `tests/be/derive-parity.test.ts`, which compares derived values
 * against real SQL aggregates).
 */
export interface AnalyticsResult {
	filters: {
		range: AnalyticsRange;
		period: string;
		label: string;
		startDate: string;
		endDate: string;
		from: string;
		to: string;
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
		largest: AnalyticsLargest | null;
	};
	series: AnalyticsSeriesPoint[];
	categories: AnalyticsCategoryRow[];
	wallets: AnalyticsWalletRow[];
	previous: { from: string; to: string; income: number; expense: number; net: number } | null;
	options: {
		wallets: Array<{ id: string; name: string }>;
		categories: Array<{ id: string; name: string; kind: string }>;
	};
	range: { from: string; to: string };
}

// --- Mirrors of the pure helpers in $lib/server/stats.ts (`$lib/server/*` cannot be
// imported from client code). tests/be/derive-parity.test.ts asserts equality with the
// server originals for every branch, so the two cannot drift. ---

const INDO_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const INDO_MONTH_FULL = [
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

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function toUtcDateString(d: Date): string {
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseUtcDateString(s: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
	return isNaN(date.getTime()) ? null : date;
}

function getUtcMonday(d: Date): Date {
	const day = d.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff, 0, 0, 0, 0));
}

interface ResolvedBounds {
	range: AnalyticsRange;
	from: string;
	to: string;
	fromDateStr: string;
	toDateStr: string;
	daysCount: number;
	previous: { from: string; to: string } | null;
}

function resolveBounds(
	rangeParam: string | null | undefined,
	fromParam: string | null | undefined,
	toParam: string | null | undefined,
	earliestOccurredAt: string | null,
	now: Date
): ResolvedBounds {
	const range: AnalyticsRange =
		rangeParam === 'week' ||
			rangeParam === 'month' ||
			rangeParam === 'year' ||
			rangeParam === 'all' ||
			rangeParam === 'custom'
			? rangeParam
			: 'month';

	const todayStart = startOfUtcDay(now);
	const todayEnd = endOfUtcDay(now);
	const toIso = todayEnd.toISOString();

	const trailing = (start: Date): ResolvedBounds => {
		const daysCount = Math.max(1, Math.round((todayEnd.getTime() - start.getTime()) / 86400000));
		const prevTo = new Date(start.getTime() - 1);
		const prevFrom = new Date(prevTo.getTime() - (daysCount * 86400000 - 1));
		return {
			range,
			from: start.toISOString(),
			to: toIso,
			fromDateStr: toUtcDateString(start),
			toDateStr: toUtcDateString(todayEnd),
			daysCount,
			previous: { from: prevFrom.toISOString(), to: prevTo.toISOString() }
		};
	};

	if (range === 'week') return trailing(getUtcMonday(todayStart));
	if (range === 'month') return trailing(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)));
	if (range === 'year') return trailing(new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0)));

	if (range === 'all') {
		const earliest = earliestOccurredAt ? new Date(earliestOccurredAt) : null;
		const fromDate =
			earliest && !isNaN(earliest.getTime()) ? startOfUtcDay(earliest) : todayStart;
		return {
			range,
			from: fromDate.toISOString(),
			to: toIso,
			fromDateStr: toUtcDateString(fromDate),
			toDateStr: toUtcDateString(todayEnd),
			daysCount: Math.max(1, Math.round((todayEnd.getTime() - fromDate.getTime()) / 86400000)),
			previous: null
		};
	}

	// custom
	const parsedFrom = fromParam ? parseUtcDateString(fromParam.trim()) : null;
	const parsedTo = toParam ? parseUtcDateString(toParam.trim()) : null;
	let customStart = parsedFrom ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
	let customEnd = parsedTo ? endOfUtcDay(parsedTo) : todayEnd;

	if (customStart.getTime() > customEnd.getTime()) {
		const swap = customStart;
		customStart = startOfUtcDay(customEnd);
		customEnd = endOfUtcDay(swap);
	}

	const daysCount = Math.max(1, Math.round((customEnd.getTime() - customStart.getTime()) / 86400000));
	const prevTo = new Date(customStart.getTime() - 1);
	const prevFrom = new Date(prevTo.getTime() - (daysCount * 86400000 - 1));

	return {
		range: 'custom',
		from: customStart.toISOString(),
		to: customEnd.toISOString(),
		fromDateStr: toUtcDateString(customStart),
		toDateStr: toUtcDateString(customEnd),
		daysCount,
		previous: { from: prevFrom.toISOString(), to: prevTo.toISOString() }
	};
}

function resolveGranularity(
	range: AnalyticsRange,
	granularityParam: string | null | undefined,
	daysCount: number
): AnalyticsGranularity {
	if (granularityParam === 'day' || granularityParam === 'week' || granularityParam === 'month') {
		return granularityParam;
	}
	if (range === 'week' || range === 'month') return 'day';
	if (range === 'year' || range === 'all') return 'month';
	if (daysCount <= 45) return 'day';
	if (daysCount <= 180) return 'week';
	return 'month';
}

function generateBuckets(
	fromIso: string,
	toIso: string,
	granularity: AnalyticsGranularity
): Array<{ bucket: string; label: string; income: number; expense: number }> {
	const start = new Date(fromIso);
	const end = new Date(toIso);
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) return [];

	const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
	const multiYear = start.getUTCFullYear() !== end.getUTCFullYear();
	const buckets: Array<{ bucket: string; label: string; income: number; expense: number }> = [];

	if (granularity === 'day') {
		const curr = startOfUtcDay(start);
		const endLimit = end.getTime();
		while (curr.getTime() <= endLimit) {
			buckets.push({
				bucket: toUtcDateString(curr),
				label: totalDays > 14 ? `${curr.getUTCDate()}/${curr.getUTCMonth() + 1}` : String(curr.getUTCDate()),
				income: 0,
				expense: 0
			});
			curr.setUTCDate(curr.getUTCDate() + 1);
		}
	} else if (granularity === 'week') {
		const curr = getUtcMonday(start);
		const endLimit = end.getTime();
		while (curr.getTime() <= endLimit) {
			buckets.push({
				bucket: toUtcDateString(curr),
				label: `${curr.getUTCDate()}/${curr.getUTCMonth() + 1}`,
				income: 0,
				expense: 0
			});
			curr.setUTCDate(curr.getUTCDate() + 7);
		}
	} else {
		let y = start.getUTCFullYear();
		let m = start.getUTCMonth();
		const endYear = end.getUTCFullYear();
		const endMonth = end.getUTCMonth();
		while (y < endYear || (y === endYear && m <= endMonth)) {
			const monthName = INDO_MONTH_NAMES[m] ?? 'Bln';
			buckets.push({
				bucket: `${y}-${pad2(m + 1)}`,
				label: multiYear ? `${monthName} ${String(y).slice(-2)}` : monthName,
				income: 0,
				expense: 0
			});
			m++;
			if (m > 11) {
				m = 0;
				y++;
			}
		}
	}

	return buckets;
}

function bucketKeyForDate(occurredAt: string, granularity: AnalyticsGranularity): string {
	const d = new Date(occurredAt);
	if (isNaN(d.getTime())) return '';
	if (granularity === 'day') return toUtcDateString(d);
	if (granularity === 'week') return toUtcDateString(getUtcMonday(d));
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function rangeLabel(range: AnalyticsRange, fromDateStr: string, toDateStr: string): string {
	if (range === 'week') return 'Minggu Ini';
	if (range === 'month') {
		const [y, m] = fromDateStr.split('-').map(Number);
		return `${INDO_MONTH_FULL[m - 1] ?? ''} ${y}`;
	}
	if (range === 'year') return `Tahun ${fromDateStr.slice(0, 4)}`;
	if (range === 'all') return 'Semua Periode';
	return `${fromDateStr} – ${toDateStr}`;
}

export function deriveAnalytics(
	transactions: readonly TransactionDTO[],
	wallets: readonly WalletDTO[],
	categories: readonly CategoryDTO[],
	query: AnalyticsQuery = {},
	now: Date = new Date()
): AnalyticsResult {
	const typeFilter: AnalyticsTypeFilter =
		query.type === 'income' || query.type === 'expense' ? query.type : 'all';
	const walletFilter = query.walletId ? query.walletId.trim() : undefined;
	const categoryFilter = query.categoryId ? query.categoryId.trim() : undefined;

	const active = transactions.filter((tx) => tx.deletedAt == null);
	let earliestOccurredAt: string | null = null;
	if (query.range === 'all') {
		for (const tx of active) {
			if (earliestOccurredAt === null || tx.occurredAt < earliestOccurredAt) {
				earliestOccurredAt = tx.occurredAt;
			}
		}
	}

	const bounds = resolveBounds(query.range, query.from, query.to, earliestOccurredAt, now);
	const granularity = resolveGranularity(bounds.range, query.granularity, bounds.daysCount);

	const inRange = active.filter(
		(tx) =>
			tx.occurredAt >= bounds.from &&
			tx.occurredAt <= bounds.to &&
			(!walletFilter || tx.walletId === walletFilter) &&
			(!categoryFilter || tx.categoryId === categoryFilter) &&
			(typeFilter === 'all' || tx.type === typeFilter)
	);
	// Server reads rows as `ORDER BY occurred_at ASC, id ASC`.
	inRange.sort((a, b) => {
		if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
		if (a.id !== b.id) return a.id < b.id ? -1 : 1;
		return 0;
	});

	const categoryNames = new Map(categories.map((c) => [c.id, c]));
	const walletNames = new Map(wallets.map((w) => [w.id, w.name]));
	const bucketMap = new Map(generateBuckets(bounds.from, bounds.to, granularity).map((b) => [b.bucket, b]));

	let totalIncome = 0;
	let totalExpense = 0;
	let largest: AnalyticsLargest | null = null;
	const categoryAgg = new Map<
		string,
		{ categoryId: string | null; name: string; total: number; count: number; color: string | null }
	>();
	const walletAgg = new Map<string, { walletId: string; name: string; income: number; expense: number }>();

	for (const tx of inRange) {
		const amount = Math.trunc(tx.amount) || 0;
		const category = tx.categoryId ? categoryNames.get(tx.categoryId) : undefined;

		if (tx.type !== 'transfer' && (!largest || amount > largest.amount)) {
			largest = {
				amount,
				occurredAt: tx.occurredAt,
				note: tx.note,
				categoryName: category?.name ?? null
			};
		}
		// Transfers move no income/expense.
		if (tx.type === 'transfer') continue;

		const bucket = bucketMap.get(bucketKeyForDate(tx.occurredAt, granularity));
		if (bucket) {
			if (tx.type === 'income') bucket.income += amount;
			else bucket.expense += amount;
		}

		if (tx.type === 'income') totalIncome += amount;
		else totalExpense += amount;

		const catKey = tx.categoryId ?? '__uncategorized__';
		const existingCat = categoryAgg.get(catKey);
		if (existingCat) {
			existingCat.total += amount;
			existingCat.count += 1;
		} else {
			categoryAgg.set(catKey, {
				categoryId: tx.categoryId,
				name: category?.name ?? 'Tanpa Kategori',
				total: amount,
				count: 1,
				color: category?.color ?? null
			});
		}

		const existingWallet = walletAgg.get(tx.walletId);
		if (existingWallet) {
			if (tx.type === 'income') existingWallet.income += amount;
			else existingWallet.expense += amount;
		} else {
			walletAgg.set(tx.walletId, {
				walletId: tx.walletId,
				name: walletNames.get(tx.walletId) ?? 'Dompet',
				income: tx.type === 'income' ? amount : 0,
				expense: tx.type === 'expense' ? amount : 0
			});
		}
	}

	const series = Array.from(bucketMap.values()).map((b) => ({
		bucket: b.bucket,
		label: b.label,
		month: b.label,
		income: b.income,
		expense: b.expense
	}));

	const shareDenominator =
		typeFilter === 'income' ? totalIncome : typeFilter === 'expense' ? totalExpense : totalIncome + totalExpense;
	const categoryRows = Array.from(categoryAgg.values())
		.sort((a, b) => b.total - a.total)
		.map((c) => ({
			...c,
			share: shareDenominator > 0 ? Number((c.total / shareDenominator).toFixed(4)) : 0
		}));

	const walletRows = Array.from(walletAgg.values()).map((w) => ({
		walletId: w.walletId,
		name: w.name,
		income: w.income,
		expense: w.expense,
		net: w.income - w.expense
	}));

	let previous: AnalyticsResult['previous'] = null;
	if (bounds.previous) {
		let prevIncome = 0;
		let prevExpense = 0;
		for (const tx of active) {
			if (tx.occurredAt < bounds.previous.from || tx.occurredAt > bounds.previous.to) continue;
			if (walletFilter && tx.walletId !== walletFilter) continue;
			if (categoryFilter && tx.categoryId !== categoryFilter) continue;
			if (typeFilter !== 'all' && tx.type !== typeFilter) continue;
			const amount = Math.trunc(tx.amount) || 0;
			if (tx.type === 'income') prevIncome += amount;
			else if (tx.type === 'expense') prevExpense += amount;
		}
		previous = {
			from: bounds.previous.from,
			to: bounds.previous.to,
			income: prevIncome,
			expense: prevExpense,
			net: prevIncome - prevExpense
		};
	}

	const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const options = {
		wallets: wallets
			.filter((w) => !w.archived && w.deletedAt == null)
			.map((w) => ({ id: w.id, name: w.name }))
			.sort(byName),
		categories: categories
			.filter((c) => !c.archived && c.deletedAt == null)
			.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
			.sort(byName)
	};

	return {
		filters: {
			range: bounds.range,
			period: bounds.range,
			label: rangeLabel(bounds.range, bounds.fromDateStr, bounds.toDateStr),
			startDate: bounds.fromDateStr,
			endDate: bounds.toDateStr,
			from: bounds.fromDateStr,
			to: bounds.toDateStr,
			granularity,
			walletId: walletFilter,
			categoryId: categoryFilter,
			type: typeFilter
		},
		summary: {
			income: totalIncome,
			expense: totalExpense,
			net: totalIncome - totalExpense,
			count: inRange.length,
			avgPerDay: Math.round(totalExpense / Math.max(1, bounds.daysCount)),
			largest
		},
		series,
		categories: categoryRows,
		wallets: walletRows,
		previous,
		options,
		range: { from: bounds.fromDateStr, to: bounds.toDateStr }
	};
}
