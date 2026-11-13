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

export const INDO_MONTH_SHORT = [
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

export interface ResolvedPeriod {
	period: string; // 'YYYY-MM' | 'all' | 'custom'
	label: string; // "November 2026", "Semua", "12 Nov – 15 Nov 2026"
	startDate: string; // 'YYYY-MM-DD' or ''
	endDate: string; // 'YYYY-MM-DD' or ''
	periodNav: {
		prev: string | null; // 'YYYY-MM' or null
		next: string | null; // 'YYYY-MM' or null
		isCurrent: boolean;
	};
}

/**
 * Normalizes Date to start of UTC month (YYYY-MM-01).
 */
export function getUtcMonthStart(year: number, monthIndex: number): Date {
	return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

/**
 * Returns last day of UTC month (e.g. 28, 29, 30, 31).
 */
export function getUtcMonthEndDay(year: number, monthIndex: number): number {
	// Day 0 of next month is the last day of monthIndex
	return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Formats YYYY-MM as Indonesian month label: "November 2026"
 */
export function formatMonthLabel(year: number, monthIndex: number): string {
	const name = INDO_MONTH_FULL[monthIndex] ?? '';
	return `${name} ${year}`;
}

/**
 * Formats custom range label: e.g. "12 Nov – 15 Nov 2026" or "31 Des 2025 – 2 Jan 2026"
 */
export function formatCustomRangeLabel(startIso: string, endIso: string): string {
	const [sy, sm, sd] = startIso.split('-').map(Number);
	const [ey, em, ed] = endIso.split('-').map(Number);

	const sMonth = INDO_MONTH_SHORT[sm - 1] ?? '';
	const eMonth = INDO_MONTH_SHORT[em - 1] ?? '';

	if (sy === ey) {
		if (sm === em && sd === ed) {
			return `${sd} ${sMonth} ${sy}`;
		}
		return `${sd} ${sMonth} – ${ed} ${eMonth} ${sy}`;
	}

	return `${sd} ${sMonth} ${sy} – ${ed} ${eMonth} ${ey}`;
}

/**
 * Resolves period parameters into normalized dates and navigation state.
 * Fallbacks to current month if period is invalid or empty.
 */
export function resolveTransactionPeriod(
	periodParam?: string | null,
	startDateParam?: string | null,
	endDateParam?: string | null,
	now: Date = new Date()
): ResolvedPeriod {
	const nowYear = now.getUTCFullYear();
	const nowMonth = now.getUTCMonth(); // 0-indexed
	const currentPeriodStr = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}`;

	const rawPeriod = (periodParam ?? '').trim();

	// 1. All period
	if (rawPeriod === 'all') {
		return {
			period: 'all',
			label: 'Semua',
			startDate: '',
			endDate: '',
			periodNav: {
				prev: null,
				next: null,
				isCurrent: false
			}
		};
	}

	// 2. Custom period
	if (rawPeriod === 'custom') {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		let s = (startDateParam ?? '').trim();
		let e = (endDateParam ?? '').trim();

		const validS = dateRegex.test(s);
		const validE = dateRegex.test(e);

		if (!validS && !validE) {
			// Fallback: current month
			s = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}-01`;
			e = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}-${String(getUtcMonthEndDay(nowYear, nowMonth)).padStart(2, '0')}`;
		} else if (!validS && validE) {
			s = e;
		} else if (validS && !validE) {
			e = s;
		}

		// Ensure start <= end
		if (s > e) {
			const temp = s;
			s = e;
			e = temp;
		}

		return {
			period: 'custom',
			label: formatCustomRangeLabel(s, e),
			startDate: s,
			endDate: e,
			periodNav: {
				prev: null,
				next: null,
				isCurrent: false
			}
		};
	}

	// 3. YYYY-MM period or fallback
	let year = nowYear;
	let month = nowMonth;
	let isValidMonth = false;

	if (/^\d{4}-\d{2}$/.test(rawPeriod)) {
		const [py, pm] = rawPeriod.split('-').map(Number);
		if (pm >= 1 && pm <= 12 && py >= 1970 && py <= 2100) {
			year = py;
			month = pm - 1;
			isValidMonth = true;
		}
	}

	// If not valid, falls back to current month
	if (!isValidMonth) {
		year = nowYear;
		month = nowMonth;
	}

	const periodStr = `${year}-${String(month + 1).padStart(2, '0')}`;
	const lastDay = getUtcMonthEndDay(year, month);
	const startDate = `${periodStr}-01`;
	const endDate = `${periodStr}-${String(lastDay).padStart(2, '0')}`;

	// Check if period is current or in the future
	const isCurrent = year === nowYear && month === nowMonth;
	const isFuture = year > nowYear || (year === nowYear && month > nowMonth);

	// Prev month
	const prevDate = new Date(Date.UTC(year, month - 1, 1));
	const prevStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

	// Next month (null if current or future)
	let nextStr: string | null = null;
	if (!isCurrent && !isFuture) {
		const nextDate = new Date(Date.UTC(year, month + 1, 1));
		nextStr = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	return {
		period: periodStr,
		label: formatMonthLabel(year, month),
		startDate,
		endDate,
		periodNav: {
			prev: prevStr,
			next: nextStr,
			isCurrent
		}
	};
}
