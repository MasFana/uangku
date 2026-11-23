import { describe, it, expect } from 'vitest';
import { resolvePeriodBounds } from '../src/lib/client/derive/filters';
import { lastUtcDayOfMonth } from '../src/lib/shared/dates';
describe('resolvePeriodBounds (client, single implementation)', () => {
	// Fixed anchor: Wednesday 2026-11-18T10:00:00.000Z (17:00 WIB).
	const fixedNow = new Date('2026-11-18T10:00:00.000Z');
	it('defaults to the current month when the period is omitted, null or empty', () => {
		for (const input of [undefined, null, '', '   ']) {
			const res = resolvePeriodBounds(input, null, null, fixedNow);
			expect(res.period).toBe('2026-11');
			expect(res.startDate).toBe('2026-11-01');
			expect(res.endDate).toBe('2026-11-30');
		}
	});
	it('resolves valid past and future YYYY-MM periods', () => {
		const oct = resolvePeriodBounds('2026-10', null, null, fixedNow);
		expect(oct).toEqual({ period: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31' });
		const jan = resolvePeriodBounds('2026-01', null, null, fixedNow);
		expect(jan).toEqual({ period: '2026-01', startDate: '2026-01-01', endDate: '2026-01-31' });
		const dec = resolvePeriodBounds('2025-12', null, null, fixedNow);
		expect(dec).toEqual({ period: '2025-12', startDate: '2025-12-01', endDate: '2025-12-31' });
	});
	it('uses the real last day of the month, including leap February', () => {
		expect(lastUtcDayOfMonth(2024, 1)).toBe(29);
		expect(resolvePeriodBounds('2024-02', null, null, fixedNow)).toEqual({
			period: '2024-02',
			startDate: '2024-02-01',
			endDate: '2024-02-29'
		});
		expect(lastUtcDayOfMonth(2026, 1)).toBe(28);
		expect(resolvePeriodBounds('2026-02', null, null, fixedNow)).toEqual({
			period: '2026-02',
			startDate: '2026-02-01',
			endDate: '2026-02-28'
		});
	});
	it('falls back to the current month for invalid input without throwing', () => {
		for (const input of ['2026-13', '2026-00', 'abc', '2026/11', '1969-05', '2101-01']) {
			const res = resolvePeriodBounds(input, null, null, fixedNow);
			expect(res.period).toBe('2026-11');
			expect(res.startDate).toBe('2026-11-01');
			expect(res.endDate).toBe('2026-11-30');
		}
	});
	it('uses the Jakarta calendar for the current month', () => {
		// 2026-10-31T20:00Z is already 1 November 2026 in Jakarta (03:00 WIB).
		const jakarta = resolvePeriodBounds(null, null, null, new Date('2026-10-31T20:00:00.000Z'));
		expect(jakarta.startDate).toBe('2026-11-01');
		expect(jakarta.endDate).toBe('2026-11-30');
		// 2026-10-31T16:00Z is 23:00 WIB, still October.
		const utc = resolvePeriodBounds(null, null, null, new Date('2026-10-31T16:00:00.000Z'));
		expect(utc.startDate).toBe('2026-10-01');
	});
	it('handles period="all" with empty bounds', () => {
		expect(resolvePeriodBounds('all', null, null, fixedNow)).toEqual({
			period: 'all',
			startDate: '',
			endDate: ''
		});
	});
	it('handles period="custom" with valid, swapped and half-filled ranges', () => {
		expect(resolvePeriodBounds('custom', '2026-11-05', '2026-11-12', fixedNow)).toEqual({
			period: 'custom',
			startDate: '2026-11-05',
			endDate: '2026-11-12'
		});
		expect(resolvePeriodBounds('custom', '2026-11-20', '2026-11-10', fixedNow)).toEqual({
			period: 'custom',
			startDate: '2026-11-10',
			endDate: '2026-11-20'
		});
		// Hanya satu sisi yang valid: sisi itu dipakai untuk keduanya, sama seperti derive.
		expect(resolvePeriodBounds('custom', 'bukan-tanggal', '2026-10-03', fixedNow)).toEqual({
			period: 'custom',
			startDate: '2026-10-03',
			endDate: '2026-10-03'
		});
		expect(resolvePeriodBounds('custom', '2026-10-03', '2026-13-99', fixedNow)).toEqual({
			period: 'custom',
			startDate: '2026-10-03',
			endDate: '2026-10-03'
		});
		expect(resolvePeriodBounds('custom', 'bukan-tanggal', '2026-13-99', fixedNow)).toEqual({
			period: 'custom',
			startDate: '2026-11-01',
			endDate: '2026-11-30'
		});
	});
});
