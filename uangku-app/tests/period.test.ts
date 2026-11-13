import { describe, it, expect } from 'vitest';
import {
	resolveTransactionPeriod,
	getUtcMonthStart,
	getUtcMonthEndDay,
	formatMonthLabel,
	formatCustomRangeLabel
} from '../src/lib/server/period';

describe('Transaction Period Resolution Unit Tests', () => {
	// Fixed test anchor: Wednesday 2026-11-18T10:00:00.000Z
	const fixedNow = new Date('2026-11-18T10:00:00.000Z');

	it('resolves current month by default when periodParam is omitted or null', () => {
		const resNull = resolveTransactionPeriod(null, null, null, fixedNow);
		expect(resNull.period).toBe('2026-11');
		expect(resNull.label).toBe('November 2026');
		expect(resNull.startDate).toBe('2026-11-01');
		expect(resNull.endDate).toBe('2026-11-30');
		expect(resNull.periodNav.isCurrent).toBe(true);
		expect(resNull.periodNav.prev).toBe('2026-10');
		expect(resNull.periodNav.next).toBeNull(); // No next month when current

		const resUndefined = resolveTransactionPeriod(undefined, undefined, undefined, fixedNow);
		expect(resUndefined.period).toBe('2026-11');
	});

	it('resolves valid past and future YYYY-MM periods', () => {
		// Past: October 2026
		const resOct = resolveTransactionPeriod('2026-10', null, null, fixedNow);
		expect(resOct.period).toBe('2026-10');
		expect(resOct.label).toBe('Oktober 2026');
		expect(resOct.startDate).toBe('2026-10-01');
		expect(resOct.endDate).toBe('2026-10-31');
		expect(resOct.periodNav.isCurrent).toBe(false);
		expect(resOct.periodNav.prev).toBe('2026-09');
		expect(resOct.periodNav.next).toBe('2026-11');

		// Boundary past: January 2026 prev wraps to 2025-12
		const resJan = resolveTransactionPeriod('2026-01', null, null, fixedNow);
		expect(resJan.period).toBe('2026-01');
		expect(resJan.startDate).toBe('2026-01-01');
		expect(resJan.endDate).toBe('2026-01-31');
		expect(resJan.periodNav.prev).toBe('2025-12');
		expect(resJan.periodNav.next).toBe('2026-02');
	});

	it('handles year boundary transitions: December to January', () => {
		// Past December 2025
		const resDec = resolveTransactionPeriod('2025-12', null, null, fixedNow);
		expect(resDec.period).toBe('2025-12');
		expect(resDec.label).toBe('Desember 2025');
		expect(resDec.startDate).toBe('2025-12-01');
		expect(resDec.endDate).toBe('2025-12-31');
		expect(resDec.periodNav.prev).toBe('2025-11');
		expect(resDec.periodNav.next).toBe('2026-01');
	});

	it('computes correct month end day for February leap and non-leap years', () => {
		// 2024 is leap year: Feb 29
		expect(getUtcMonthEndDay(2024, 1)).toBe(29);
		const resLeap = resolveTransactionPeriod('2024-02', null, null, fixedNow);
		expect(resLeap.startDate).toBe('2024-02-01');
		expect(resLeap.endDate).toBe('2024-02-29');

		// 2026 is non-leap year: Feb 28
		expect(getUtcMonthEndDay(2026, 1)).toBe(28);
		const resNonLeap = resolveTransactionPeriod('2026-02', null, null, fixedNow);
		expect(resNonLeap.startDate).toBe('2026-02-01');
		expect(resNonLeap.endDate).toBe('2026-02-28');
	});

	it('gracefully falls back to current month for invalid period inputs without throwing', () => {
		const invalidInputs = ['2026-13', '2026-00', 'abc', '', '  ', '2026/11', 'random-string'];

		for (const input of invalidInputs) {
			const res = resolveTransactionPeriod(input, null, null, fixedNow);
			expect(res.period).toBe('2026-11');
			expect(res.startDate).toBe('2026-11-01');
			expect(res.endDate).toBe('2026-11-30');
			expect(res.periodNav.isCurrent).toBe(true);
			expect(res.periodNav.prev).toBe('2026-10');
			expect(res.periodNav.next).toBeNull();
		}
	});

	it('handles period="all" correctly', () => {
		const res = resolveTransactionPeriod('all', null, null, fixedNow);
		expect(res.period).toBe('all');
		expect(res.label).toBe('Semua');
		expect(res.startDate).toBe('');
		expect(res.endDate).toBe('');
		expect(res.periodNav.prev).toBeNull();
		expect(res.periodNav.next).toBeNull();
		expect(res.periodNav.isCurrent).toBe(false);
	});

	it('handles period="custom" with valid and swapped ranges', () => {
		// Normal custom range
		const resNormal = resolveTransactionPeriod('custom', '2026-11-05', '2026-11-12', fixedNow);
		expect(resNormal.period).toBe('custom');
		expect(resNormal.startDate).toBe('2026-11-05');
		expect(resNormal.endDate).toBe('2026-11-12');
		expect(resNormal.periodNav.prev).toBeNull();
		expect(resNormal.periodNav.next).toBeNull();
		expect(resNormal.periodNav.isCurrent).toBe(false);
		expect(resNormal.label).toBe('5 Nov – 12 Nov 2026');

		// Swapped custom range (start > end)
		const resSwapped = resolveTransactionPeriod('custom', '2026-11-20', '2026-11-10', fixedNow);
		expect(resSwapped.startDate).toBe('2026-11-10');
		expect(resSwapped.endDate).toBe('2026-11-20');

		// Across year custom label
		const resAcrossYear = resolveTransactionPeriod('custom', '2025-12-31', '2026-01-02', fixedNow);
		expect(resAcrossYear.label).toBe('31 Des 2025 – 2 Jan 2026');
	});
});
