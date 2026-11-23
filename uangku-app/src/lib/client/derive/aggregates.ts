import type { CategoryDTO, TransactionDTO, WalletDTO } from '$lib/shared/sync-contract';
import {
	INDO_MONTH_FULL,
	INDO_MONTH_NAMES,
	daysBetweenUtc,
	endOfUtcDay,
	getUtcMonday,
	lastUtcDayOfMonth,
	pad2,
	parseUtcDateString,
	startOfUtcDay,
	todayInJakarta,
	toUtcDateString
} from '$lib/shared/dates';

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
	/** Jenis transaksi, supaya kartu bisa menandai pemasukan vs pengeluaran. */
	type: 'income' | 'expense';
	occurredAt: string;
	note: string | null;
	categoryName: string | null;
	walletId: string;
	walletName: string | null;
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
	transferIn: number;
	transferOut: number;
	/** Pemasukan - pengeluaran; transfer tidak dihitung. */
	net: number;
	/** Perubahan saldo dompet di periode ini, termasuk transfer masuk/keluar. */
	netChange: number;
	count: number;
}

export interface AnalyticsSeriesPoint {
	bucket: string;
	label: string;
	/** Alias of `label`: the axis key `CashflowChart` reads, so charts need no page-side adapter. */
	month: string;
	income: number;
	expense: number;
}

/** Batas jumlah titik grafik. Di atas ini granularitas dinaikkan otomatis. */
export const MAX_SERIES_BUCKETS = 180;

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
		/** True bila granularitas dinaikkan otomatis karena rentang terlalu panjang. */
		granularityAdjusted: boolean;
		/** Jumlah hari yang dipakai sebagai pembagi `avgPerDay` (sampai hari ini saja). */
		daysCount: number;
		/** Basis baris `categories`: pengeluaran, atau pemasukan saat filter pemasukan. */
		categoriesBasis: 'income' | 'expense';
		walletId?: string;
		categoryId?: string;
		type: AnalyticsTypeFilter;
	};
	summary: {
		income: number;
		expense: number;
		net: number;
		/** Semua transaksi di rentang, termasuk transfer. */
		count: number;
		transferCount: number;
		avgPerDay: number;
		avgPerDayBasis: 'income' | 'expense';
		largest: AnalyticsLargest | null;
	};
	series: AnalyticsSeriesPoint[];
	categories: AnalyticsCategoryRow[];
	wallets: AnalyticsWalletRow[];
	previous: {
		from: string;
		to: string;
		label: string;
		income: number;
		expense: number;
		net: number;
	} | null;
	options: {
		wallets: Array<{ id: string; name: string; archived: boolean }>;
		categories: Array<{ id: string; name: string; kind: string; archived: boolean }>;
	};
	range: { from: string; to: string };
}

// --- Bantuan tanggal (kalender UTC, "hari ini" WIB) ada di $lib/shared/dates.ts. ---

interface ResolvedBounds {
	range: AnalyticsRange;
	from: string;
	to: string;
	fromDateStr: string;
	toDateStr: string;
	/** Hari sampai hari ini saja: periode berjalan tidak dihitung penuh. */
	daysCount: number;
	previous: { from: string; to: string; label: string } | null;
}

function resolveBounds(
	rangeParam: string | null | undefined,
	fromParam: string | null | undefined,
	toParam: string | null | undefined,
	earliestOccurredAt: string | null,
	latestOccurredAt: string | null,
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

	const today = todayInJakarta(now);
	const todayEnd = endOfUtcDay(today);
	const latestEnd = latestOccurredAt ? endOfUtcDay(new Date(latestOccurredAt)) : todayEnd;
	/** Transaksi bertanggal depan tetap masuk; presets memakai batas kalender, bukan "hari ini". */
	const forwardEnd = latestEnd.getTime() > todayEnd.getTime() ? latestEnd : todayEnd;

	let start: Date;
	let end: Date;
	let previous: ResolvedBounds['previous'] = null;

	if (range === 'week') {
		start = getUtcMonday(today);
		end = endOfUtcDay(new Date(start.getTime() + 6 * 86400000));
		const prevStart = new Date(start.getTime() - 7 * 86400000);
		previous = {
			from: prevStart.toISOString(),
			to: endOfUtcDay(new Date(start.getTime() - 86400000)).toISOString(),
			label: 'minggu lalu'
		};
	} else if (range === 'month') {
		start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
		end = endOfUtcDay(
			new Date(
				Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), lastUtcDayOfMonth(today.getUTCFullYear(), today.getUTCMonth()), 0, 0, 0, 0)
			)
		);
		const prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1, 0, 0, 0, 0));
		previous = {
			from: prevStart.toISOString(),
			to: endOfUtcDay(new Date(start.getTime() - 86400000)).toISOString(),
			label: 'bulan lalu'
		};
	} else if (range === 'year') {
		start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
		end = endOfUtcDay(new Date(Date.UTC(today.getUTCFullYear(), 11, 31, 0, 0, 0, 0)));
		const prevStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0));
		previous = {
			from: prevStart.toISOString(),
			to: endOfUtcDay(new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31, 0, 0, 0, 0))).toISOString(),
			label: 'tahun lalu'
		};
	} else if (range === 'all') {
		const earliest = earliestOccurredAt ? new Date(earliestOccurredAt) : null;
		start = earliest && !isNaN(earliest.getTime()) ? startOfUtcDay(earliest) : today;
		end = forwardEnd;
	} else {
		const parsedFrom = fromParam ? parseUtcDateString(fromParam.trim()) : null;
		const parsedTo = toParam ? parseUtcDateString(toParam.trim()) : null;
		// Tanggal yang tidak ada (2026-02-31) ditolak; satu sisi yang valid dipakai untuk keduanya,
		// sama seperti `resolvePeriodBounds` di halaman Transaksi.
		if (parsedFrom && !parsedTo) {
			start = parsedFrom;
			end = endOfUtcDay(parsedFrom);
		} else if (!parsedFrom && parsedTo) {
			start = parsedTo;
			end = endOfUtcDay(parsedTo);
		} else {
			start = parsedFrom ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
			end = parsedTo ? endOfUtcDay(parsedTo) : forwardEnd;
		}
		const lengthDays = daysBetweenUtc(startOfUtcDay(start), startOfUtcDay(end)) + 1;
		const prevToDate = new Date(start.getTime() - 86400000);
		const prevFromDate = new Date(prevToDate.getTime() - (lengthDays - 1) * 86400000);
		previous = {
			from: startOfUtcDay(prevFromDate).toISOString(),
			to: endOfUtcDay(prevToDate).toISOString(),
			label: 'periode sebelumnya'
		};
	}

	// Pembagi rata-rata hanya menghitung hari yang sudah berjalan di periode ini.
	const elapsedEnd = end.getTime() > todayEnd.getTime() ? todayEnd : end;
	const daysCount = Math.max(1, daysBetweenUtc(startOfUtcDay(start), startOfUtcDay(elapsedEnd)) + 1);

	return {
		range,
		from: start.toISOString(),
		to: end.toISOString(),
		fromDateStr: toUtcDateString(start),
		toDateStr: toUtcDateString(end),
		daysCount,
		previous
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

function countBuckets(
	fromIso: string,
	toIso: string,
	granularity: AnalyticsGranularity
): number {
	const start = new Date(fromIso);
	const end = new Date(toIso);
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) return 0;
	if (granularity === 'day') return daysBetweenUtc(startOfUtcDay(start), startOfUtcDay(end)) + 1;
	if (granularity === 'week') {
		const first = getUtcMonday(start).getTime();
		const last = getUtcMonday(end).getTime();
		return Math.floor((last - first) / (7 * 86400000)) + 1;
	}
	const months =
		(end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
	return Math.max(1, months);
}

/** Naikkan granularitas sampai jumlah titik grafik di bawah `MAX_SERIES_BUCKETS`. */
function capGranularity(
	fromIso: string,
	toIso: string,
	granularity: AnalyticsGranularity
): { granularity: AnalyticsGranularity; adjusted: boolean } {
	const order: AnalyticsGranularity[] = ['day', 'week', 'month'];
	let current = granularity;
	for (const candidate of order.slice(order.indexOf(granularity))) {
		current = candidate;
		if (countBuckets(fromIso, toIso, current) <= MAX_SERIES_BUCKETS) break;
	}
	return { granularity: current, adjusted: current !== granularity };
}

function generateBuckets(
	fromIso: string,
	toIso: string,
	granularity: AnalyticsGranularity
): Array<{ bucket: string; label: string; income: number; expense: number }> {
	const start = new Date(fromIso);
	const end = new Date(toIso);
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) return [];

	const totalDays = Math.max(1, daysBetweenUtc(start, end));
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
	if (range === 'week') {
		const fmt = (s: string) => {
			const [y, m, d] = s.split('-').map(Number);
			return `${d} ${INDO_MONTH_NAMES[m - 1] ?? ''} ${y}`;
		};
		return `Minggu ${fmt(fromDateStr)} – ${fmt(toDateStr)}`;
	}
	if (range === 'month') {
		const [y, m] = fromDateStr.split('-').map(Number);
		return `${INDO_MONTH_FULL[m - 1] ?? ''} ${y}`;
	}
	if (range === 'year') return `Tahun ${fromDateStr.slice(0, 4)}`;
	if (range === 'all') return 'Semua Periode';
	const fmt = (s: string) => {
		const [y, m, d] = s.split('-').map(Number);
		return `${d} ${INDO_MONTH_NAMES[m - 1] ?? ''} ${y}`;
	};
	return `${fmt(fromDateStr)} – ${fmt(toDateStr)}`;
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

	// Batas waktu dihitung dari transaksi yang lolos filter dompet/kategori/jenis, jadi
	// "Semua Periode" tidak memakai riwayat dompet yang sedang disembunyikan.
	const candidates = transactions.filter(
		(tx) =>
			tx.deletedAt == null &&
			(!walletFilter || tx.walletId === walletFilter) &&
			(!categoryFilter || tx.categoryId === categoryFilter) &&
			(typeFilter === 'all' || tx.type === typeFilter)
	);

	let earliestOccurredAt: string | null = null;
	let latestOccurredAt: string | null = null;
	for (const tx of candidates) {
		if (earliestOccurredAt === null || tx.occurredAt < earliestOccurredAt) earliestOccurredAt = tx.occurredAt;
		if (latestOccurredAt === null || tx.occurredAt > latestOccurredAt) latestOccurredAt = tx.occurredAt;
	}

	const bounds = resolveBounds(
		query.range,
		query.from,
		query.to,
		earliestOccurredAt,
		latestOccurredAt,
		now
	);
	const capped = capGranularity(
		bounds.from,
		bounds.to,
		resolveGranularity(bounds.range, query.granularity, bounds.daysCount)
	);
	const granularity = capped.granularity;

	const inRange = candidates.filter((tx) => tx.occurredAt >= bounds.from && tx.occurredAt <= bounds.to);
	// Server reads rows as `ORDER BY occurred_at ASC, id ASC`.
	inRange.sort((a, b) => {
		if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
		if (a.id !== b.id) return a.id < b.id ? -1 : 1;
		return 0;
	});

	// Kartu kategori menampilkan pengeluaran; saat filter "Pemasukan" aktif, ia menjadi
	// rincian pemasukan supaya judul dan penyebut `share` tetap benar.
	const categoriesBasis: 'income' | 'expense' = typeFilter === 'income' ? 'income' : 'expense';
	const categoryNames = new Map(categories.map((c) => [c.id, c]));
	const walletNames = new Map(wallets.map((w) => [w.id, w.name]));
	const bucketMap = new Map(generateBuckets(bounds.from, bounds.to, granularity).map((b) => [b.bucket, b]));

	let totalIncome = 0;
	let totalExpense = 0;
	let transferCount = 0;
	let largest: AnalyticsLargest | null = null;
	const categoryAgg = new Map<
		string,
		{ categoryId: string | null; name: string; total: number; count: number; color: string | null }
	>();
	const walletAgg = new Map<
		string,
		{ walletId: string; name: string; income: number; expense: number; transferIn: number; transferOut: number; count: number }
	>();

	const ensureWallet = (walletId: string) => {
		const existing = walletAgg.get(walletId);
		if (existing) return existing;
		const created = {
			walletId,
			name: walletNames.get(walletId) ?? 'Dompet',
			income: 0,
			expense: 0,
			transferIn: 0,
			transferOut: 0,
			count: 0
		};
		walletAgg.set(walletId, created);
		return created;
	};

	for (const tx of inRange) {
		const amount = Math.trunc(tx.amount) || 0;
		const category = tx.categoryId ? categoryNames.get(tx.categoryId) : undefined;

		if (tx.type === 'transfer') {
			transferCount += 1;
			const source = ensureWallet(tx.walletId);
			source.transferOut += amount;
			source.count += 1;
			if (tx.transferWalletId) {
				const target = ensureWallet(tx.transferWalletId);
				target.transferIn += amount;
				target.count += 1;
			}
			continue;
		}

		if (amount > 0 && (!largest || amount > largest.amount)) {
			largest = {
				amount,
				type: tx.type === 'income' ? 'income' : 'expense',
				occurredAt: tx.occurredAt,
				note: tx.note,
				categoryName: category?.name ?? null,
				walletId: tx.walletId,
				walletName: walletNames.get(tx.walletId) ?? null
			};
		}

		const bucket = bucketMap.get(bucketKeyForDate(tx.occurredAt, granularity));
		if (bucket) {
			if (tx.type === 'income') bucket.income += amount;
			else bucket.expense += amount;
		}

		if (tx.type === 'income') totalIncome += amount;
		else totalExpense += amount;

		if (tx.type === categoriesBasis) {
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
		}

		const wallet = ensureWallet(tx.walletId);
		if (tx.type === 'income') wallet.income += amount;
		else wallet.expense += amount;
		wallet.count += 1;
	}

	const series = Array.from(bucketMap.values()).map((b) => ({
		bucket: b.bucket,
		label: b.label,
		month: b.label,
		income: b.income,
		expense: b.expense
	}));

	const shareDenominator = categoriesBasis === 'income' ? totalIncome : totalExpense;
	const categoryRows = Array.from(categoryAgg.values())
		.sort((a, b) => b.total - a.total)
		.map((c) => ({
			...c,
			share: shareDenominator > 0 ? Number((c.total / shareDenominator).toFixed(4)) : 0
		}));

	const walletRows = Array.from(walletAgg.values())
		.map((w) => ({
			walletId: w.walletId,
			name: w.name,
			income: w.income,
			expense: w.expense,
			transferIn: w.transferIn,
			transferOut: w.transferOut,
			net: w.income - w.expense,
			netChange: w.income - w.expense + w.transferIn - w.transferOut,
			count: w.count
		}))
		.sort((a, b) => {
			const flowA = a.income + a.expense + a.transferIn + a.transferOut;
			const flowB = b.income + b.expense + b.transferIn + b.transferOut;
			if (flowA !== flowB) return flowB - flowA;
			return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
		});

	let previous: AnalyticsResult['previous'] = null;
	if (bounds.previous) {
		let prevIncome = 0;
		let prevExpense = 0;
		for (const tx of candidates) {
			if (tx.occurredAt < bounds.previous.from || tx.occurredAt > bounds.previous.to) continue;
			const amount = Math.trunc(tx.amount) || 0;
			if (tx.type === 'income') prevIncome += amount;
			else if (tx.type === 'expense') prevExpense += amount;
		}
		previous = {
			from: bounds.previous.from,
			to: bounds.previous.to,
			label: bounds.previous.label,
			income: prevIncome,
			expense: prevExpense,
			net: prevIncome - prevExpense
		};
	}

	const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const options = {
		wallets: wallets
			.filter((w) => w.deletedAt == null)
			.map((w) => ({ id: w.id, name: w.name, archived: w.archived }))
			.sort(byName),
		categories: categories
			.filter((c) => c.deletedAt == null)
			.map((c) => ({ id: c.id, name: c.name, kind: c.kind, archived: c.archived }))
			.sort(byName)
	};

	const basisTotal = categoriesBasis === 'income' ? totalIncome : totalExpense;

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
			granularityAdjusted: capped.adjusted,
			daysCount: bounds.daysCount,
			categoriesBasis,
			walletId: walletFilter,
			categoryId: categoryFilter,
			type: typeFilter
		},
		summary: {
			income: totalIncome,
			expense: totalExpense,
			net: totalIncome - totalExpense,
			count: inRange.length,
			transferCount,
			avgPerDay: Math.round(basisTotal / bounds.daysCount),
			avgPerDayBasis: categoriesBasis,
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
