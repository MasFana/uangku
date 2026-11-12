export type AnalyticsRange = 'week' | 'month' | 'year' | 'all' | 'custom';
export type AnalyticsGranularity = 'day' | 'week' | 'month';
export type AnalyticsTypeFilter = 'all' | 'income' | 'expense';

export interface DateRangeBounds {
	from: string; // ISO string (e.g. 2026-11-01T00:00:00.000Z)
	to: string; // ISO string inclusive or end bound
}

export interface ResolvedRange {
	range: AnalyticsRange;
	from: string; // ISO string
	to: string; // ISO string
	fromDateStr: string; // YYYY-MM-DD
	toDateStr: string; // YYYY-MM-DD
	daysCount: number;
	previous: {
		from: string; // ISO
		to: string; // ISO
	} | null;
}

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

/**
 * Normalizes Date to start of UTC day (00:00:00.000Z).
 */
export function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Normalizes Date to end of UTC day (23:59:59.999Z).
 */
export function endOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Formats UTC date as YYYY-MM-DD.
 */
export function toUtcDateString(d: Date): string {
	const year = d.getUTCFullYear();
	const month = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD into start of UTC day Date.
 */
export function parseUtcDateString(s: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
	if (isNaN(date.getTime())) return null;
	return date;
}

/**
 * Gets Monday of the current week in UTC (ISO week starts Monday).
 */
export function getUtcMonday(d: Date): Date {
	const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday, ... 6 is Saturday
	const diff = day === 0 ? -6 : 1 - day; // distance to Monday
	const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff, 0, 0, 0, 0));
	return monday;
}

/**
 * Resolves effective range from preset or custom query.
 */
export function resolveAnalyticsRange(
	rangeParam?: string | null,
	fromParam?: string | null,
	toParam?: string | null,
	earliestTxOccurredAt?: string | null,
	now: Date = new Date()
): ResolvedRange {
	const range: AnalyticsRange =
		rangeParam === 'week' ||
		rangeParam === 'month' ||
		rangeParam === 'year' ||
		rangeParam === 'all' ||
		rangeParam === 'custom'
			? rangeParam
			: 'month';

	const nowUtc = now;
	const todayStart = startOfUtcDay(nowUtc);
	const todayEnd = endOfUtcDay(nowUtc);

	if (range === 'week') {
		const mondayStart = getUtcMonday(todayStart);
		const toIso = todayEnd.toISOString();
		const fromIso = mondayStart.toISOString();
		const daysCount = Math.max(1, Math.round((todayEnd.getTime() - mondayStart.getTime()) / 86400000));

		// Previous period: identical number of days immediately prior
		const prevTo = new Date(mondayStart.getTime() - 1);
		const prevFrom = new Date(prevTo.getTime() - (daysCount * 86400000 - 1));

		return {
			range,
			from: fromIso,
			to: toIso,
			fromDateStr: toUtcDateString(mondayStart),
			toDateStr: toUtcDateString(todayEnd),
			daysCount,
			previous: {
				from: prevFrom.toISOString(),
				to: prevTo.toISOString()
			}
		};
	}

	if (range === 'month') {
		const monthStart = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1, 0, 0, 0, 0));
		const toIso = todayEnd.toISOString();
		const fromIso = monthStart.toISOString();
		const daysCount = Math.max(1, Math.round((todayEnd.getTime() - monthStart.getTime()) / 86400000));

		// Previous period: identical number of days immediately prior
		const prevTo = new Date(monthStart.getTime() - 1);
		const prevFrom = new Date(prevTo.getTime() - (daysCount * 86400000 - 1));

		return {
			range,
			from: fromIso,
			to: toIso,
			fromDateStr: toUtcDateString(monthStart),
			toDateStr: toUtcDateString(todayEnd),
			daysCount,
			previous: {
				from: prevFrom.toISOString(),
				to: prevTo.toISOString()
			}
		};
	}

	if (range === 'year') {
		const yearStart = new Date(Date.UTC(nowUtc.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
		const toIso = todayEnd.toISOString();
		const fromIso = yearStart.toISOString();
		const daysCount = Math.max(1, Math.round((todayEnd.getTime() - yearStart.getTime()) / 86400000));

		// Previous period: same duration prior
		const prevTo = new Date(yearStart.getTime() - 1);
		const prevFrom = new Date(prevTo.getTime() - (daysCount * 86400000 - 1));

		return {
			range,
			from: fromIso,
			to: toIso,
			fromDateStr: toUtcDateString(yearStart),
			toDateStr: toUtcDateString(todayEnd),
			daysCount,
			previous: {
				from: prevFrom.toISOString(),
				to: prevTo.toISOString()
			}
		};
	}

	if (range === 'all') {
		let fromDate = todayStart;
		if (earliestTxOccurredAt) {
			const earliest = new Date(earliestTxOccurredAt);
			if (!isNaN(earliest.getTime())) {
				fromDate = startOfUtcDay(earliest);
			}
		}
		const toIso = todayEnd.toISOString();
		const fromIso = fromDate.toISOString();
		const daysCount = Math.max(1, Math.round((todayEnd.getTime() - fromDate.getTime()) / 86400000));

		return {
			range,
			from: fromIso,
			to: toIso,
			fromDateStr: toUtcDateString(fromDate),
			toDateStr: toUtcDateString(todayEnd),
			daysCount,
			previous: null
		};
	}

	// range === 'custom'
	const parsedFrom = fromParam ? parseUtcDateString(fromParam) : null;
	const parsedTo = toParam ? parseUtcDateString(toParam) : null;

	let customStart = parsedFrom ?? new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1, 0, 0, 0, 0));
	let customEnd = parsedTo ? endOfUtcDay(parsedTo) : todayEnd;

	// In case start is after end, swap them
	if (customStart.getTime() > customEnd.getTime()) {
		const temp = customStart;
		customStart = startOfUtcDay(customEnd);
		customEnd = endOfUtcDay(temp);
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
		previous: {
			from: prevFrom.toISOString(),
			to: prevTo.toISOString()
		}
	};
}

/**
 * Derives default granularity from range if not provided or invalid.
 * week/month -> day, year/all -> month
 */
export function resolveGranularity(
	range: AnalyticsRange,
	granularityParam?: string | null,
	daysCount = 30
): AnalyticsGranularity {
	if (granularityParam === 'day' || granularityParam === 'week' || granularityParam === 'month') {
		return granularityParam;
	}

	if (range === 'week' || range === 'month') {
		return 'day';
	}
	if (range === 'year' || range === 'all') {
		return 'month';
	}
	// For custom
	if (daysCount <= 45) {
		return 'day';
	}
	if (daysCount <= 180) {
		return 'week';
	}
	return 'month';
}

export interface BucketItem {
	bucket: string; // ISO date key, e.g. YYYY-MM-DD or YYYY-MM
	label: string;
	income: number;
	expense: number;
}

/**
 * Generates an empty sequence of buckets covering [from, to] ascending without gaps.
 * Labels follow contract:
 * - day: "10" if days <= 14, else "10/11" (date/month)
 * - week: "10/11" (date/month of Monday)
 * - month: "Nov" if single year, or "Nov 26" if spans multiple years
 */
export function generateBuckets(
	fromIso: string,
	toIso: string,
	granularity: AnalyticsGranularity
): BucketItem[] {
	const start = new Date(fromIso);
	const end = new Date(toIso);
	if (isNaN(start.getTime()) || isNaN(end.getTime()) || start.getTime() > end.getTime()) {
		return [];
	}

	const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
	const multiYear = start.getUTCFullYear() !== end.getUTCFullYear();
	const buckets: BucketItem[] = [];

	if (granularity === 'day') {
		const curr = startOfUtcDay(start);
		const endLimit = end.getTime();

		while (curr.getTime() <= endLimit) {
			const bucketKey = toUtcDateString(curr);
			const dayNum = String(curr.getUTCDate());
			const monthNum = String(curr.getUTCMonth() + 1);

			const label = totalDays > 14 ? `${dayNum}/${monthNum}` : dayNum;

			buckets.push({
				bucket: bucketKey,
				label,
				income: 0,
				expense: 0
			});

			curr.setUTCDate(curr.getUTCDate() + 1);
		}
	} else if (granularity === 'week') {
		// Advance by Monday buckets
		const curr = getUtcMonday(start);
		const endLimit = end.getTime();

		while (curr.getTime() <= endLimit) {
			const bucketKey = toUtcDateString(curr);
			const dayNum = String(curr.getUTCDate());
			const monthNum = String(curr.getUTCMonth() + 1);
			const label = `${dayNum}/${monthNum}`;

			buckets.push({
				bucket: bucketKey,
				label,
				income: 0,
				expense: 0
			});

			curr.setUTCDate(curr.getUTCDate() + 7);
		}
	} else if (granularity === 'month') {
		// Advance month by month
		const currYear = start.getUTCFullYear();
		const currMonth = start.getUTCMonth();
		const endYear = end.getUTCFullYear();
		const endMonth = end.getUTCMonth();

		let y = currYear;
		let m = currMonth;

		while (y < endYear || (y === endYear && m <= endMonth)) {
			const monthStr = String(m + 1).padStart(2, '0');
			const bucketKey = `${y}-${monthStr}`;
			const monthName = INDO_MONTH_NAMES[m] ?? 'Bln';
			const shortYear = String(y).slice(-2);
			const label = multiYear ? `${monthName} ${shortYear}` : monthName;

			buckets.push({
				bucket: bucketKey,
				label,
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

/**
 * Resolves which bucket a given occurredAt date belongs to under the given granularity.
 */
export function getBucketKeyForDate(occurredAt: string, granularity: AnalyticsGranularity): string {
	const d = new Date(occurredAt);
	if (isNaN(d.getTime())) return '';

	if (granularity === 'day') {
		return toUtcDateString(d);
	}
	if (granularity === 'week') {
		const monday = getUtcMonday(d);
		return toUtcDateString(monday);
	}
	if (granularity === 'month') {
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, '0');
		return `${y}-${m}`;
	}

	return '';
}
