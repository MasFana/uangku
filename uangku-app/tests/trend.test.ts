import { describe, it, expect } from 'vitest';
import {
	startOfUtcDay,
	endOfUtcDay,
	toUtcDateString,
	parseUtcDateString,
	getUtcMonday,
	resolveAnalyticsRange,
	resolveGranularity,
	generateBuckets,
	getBucketKeyForDate
} from '../src/lib/server/stats';

describe('Analytics Date & Range Preset Logic', () => {
	// Fixed anchor point: Wednesday, 2026-11-12T15:30:00.000Z
	const fixedNow = new Date('2026-11-12T15:30:00.000Z');

	it('normalizes UTC day start and end', () => {
		const start = startOfUtcDay(fixedNow);
		expect(start.toISOString()).toBe('2026-11-12T00:00:00.000Z');

		const end = endOfUtcDay(fixedNow);
		expect(end.toISOString()).toBe('2026-11-12T23:59:59.999Z');
	});

	it('formats and parses UTC YYYY-MM-DD date strings', () => {
		expect(toUtcDateString(fixedNow)).toBe('2026-11-12');

		const parsed = parseUtcDateString('2026-05-01');
		expect(parsed).not.toBeNull();
		expect(parsed?.toISOString()).toBe('2026-05-01T00:00:00.000Z');

		expect(parseUtcDateString('invalid-date')).toBeNull();
		expect(parseUtcDateString('2026-11')).toBeNull();
		expect(parseUtcDateString('not-a-date')).toBeNull();
	});

	it('computes UTC Monday correctly for various days of the week', () => {
		// 2026-11-12 is Thursday -> Monday is 2026-11-09
		const monFromThu = getUtcMonday(new Date('2026-11-12T10:00:00.000Z'));
		expect(toUtcDateString(monFromThu)).toBe('2026-11-09');

		// 2026-11-15 is Sunday -> Monday is 2026-11-09
		const monFromSun = getUtcMonday(new Date('2026-11-15T12:00:00.000Z'));
		expect(toUtcDateString(monFromSun)).toBe('2026-11-09');

		// 2026-11-09 is already Monday -> stays Monday 2026-11-09
		const monFromMon = getUtcMonday(new Date('2026-11-09T08:00:00.000Z'));
		expect(toUtcDateString(monFromMon)).toBe('2026-11-09');
	});

	describe('resolveAnalyticsRange with fixed now', () => {
		it('resolves "week" range (Monday 00:00:00 to today 23:59:59.999) with previous period', () => {
			const res = resolveAnalyticsRange('week', null, null, null, fixedNow);
			expect(res.range).toBe('week');
			expect(res.from).toBe('2026-11-09T00:00:00.000Z');
			expect(res.to).toBe('2026-11-12T23:59:59.999Z');
			expect(res.fromDateStr).toBe('2026-11-09');
			expect(res.toDateStr).toBe('2026-11-12');
			expect(res.daysCount).toBe(4); // 9, 10, 11, 12 = 4 days
			expect(res.previous).not.toBeNull();
			expect(res.previous?.to).toBe('2026-11-08T23:59:59.999Z');
		});

		it('resolves "month" range (1st of month 00:00:00 to today 23:59:59.999)', () => {
			const res = resolveAnalyticsRange('month', null, null, null, fixedNow);
			expect(res.range).toBe('month');
			expect(res.from).toBe('2026-11-01T00:00:00.000Z');
			expect(res.to).toBe('2026-11-12T23:59:59.999Z');
			expect(res.fromDateStr).toBe('2026-11-01');
			expect(res.toDateStr).toBe('2026-11-12');
			expect(res.daysCount).toBe(12);
			expect(res.previous).not.toBeNull();
			expect(res.previous?.to).toBe('2026-10-31T23:59:59.999Z');
		});

		it('resolves "year" range (Jan 1st 00:00:00 to today 23:59:59.999)', () => {
			const res = resolveAnalyticsRange('year', null, null, null, fixedNow);
			expect(res.range).toBe('year');
			expect(res.from).toBe('2026-01-01T00:00:00.000Z');
			expect(res.to).toBe('2026-11-12T23:59:59.999Z');
			expect(res.fromDateStr).toBe('2026-01-01');
			expect(res.toDateStr).toBe('2026-11-12');
			expect(res.previous).not.toBeNull();
			expect(res.previous?.to).toBe('2025-12-31T23:59:59.999Z');
		});

		it('resolves "all" range using earliest transaction date with previous = null', () => {
			const earliest = '2025-06-15T08:00:00.000Z';
			const res = resolveAnalyticsRange('all', null, null, earliest, fixedNow);
			expect(res.range).toBe('all');
			expect(res.from).toBe('2025-06-15T00:00:00.000Z');
			expect(res.to).toBe('2026-11-12T23:59:59.999Z');
			expect(res.fromDateStr).toBe('2025-06-15');
			expect(res.toDateStr).toBe('2026-11-12');
			expect(res.previous).toBeNull();
		});

		it('resolves "custom" range with valid bounds and previous period', () => {
			const res = resolveAnalyticsRange('custom', '2026-10-01', '2026-10-15', null, fixedNow);
			expect(res.range).toBe('custom');
			expect(res.from).toBe('2026-10-01T00:00:00.000Z');
			expect(res.to).toBe('2026-10-15T23:59:59.999Z');
			expect(res.daysCount).toBe(15);
			expect(res.previous).not.toBeNull();
			expect(res.previous?.to).toBe('2026-09-30T23:59:59.999Z');
		});

		it('handles inverted custom range by swapping start and end gracefully', () => {
			const res = resolveAnalyticsRange('custom', '2026-10-20', '2026-10-10', null, fixedNow);
			expect(res.from).toBe('2026-10-10T00:00:00.000Z');
			expect(res.to).toBe('2026-10-20T23:59:59.999Z');
			expect(res.daysCount).toBe(11);
		});
	});

	describe('resolveGranularity defaults', () => {
		it('derives default granularity according to range and duration', () => {
			expect(resolveGranularity('week')).toBe('day');
			expect(resolveGranularity('month')).toBe('day');
			expect(resolveGranularity('year')).toBe('month');
			expect(resolveGranularity('all')).toBe('month');

			// Custom durations
			expect(resolveGranularity('custom', null, 30)).toBe('day');
			expect(resolveGranularity('custom', null, 90)).toBe('week');
			expect(resolveGranularity('custom', null, 300)).toBe('month');

			// Explicit override
			expect(resolveGranularity('month', 'week')).toBe('week');
		});
	});

	describe('generateBuckets & gap filling', () => {
		it('generates ascending daily buckets with 0 initial values and no gaps', () => {
			const buckets = generateBuckets('2026-11-01T00:00:00.000Z', '2026-11-05T23:59:59.999Z', 'day');
			expect(buckets).toHaveLength(5);
			expect(buckets.map((b) => b.bucket)).toEqual([
				'2026-11-01',
				'2026-11-02',
				'2026-11-03',
				'2026-11-04',
				'2026-11-05'
			]);
			expect(buckets.every((b) => b.income === 0 && b.expense === 0)).toBe(true);
		});

		it('generates weekly buckets starting on Mondays', () => {
			const buckets = generateBuckets('2026-11-01T00:00:00.000Z', '2026-11-20T23:59:59.999Z', 'week');
			expect(buckets.length).toBeGreaterThanOrEqual(3);
			// First bucket Monday is 2026-10-26 (since 2026-11-01 is Sunday)
			expect(buckets[0].bucket).toBe('2026-10-26');
			expect(buckets[1].bucket).toBe('2026-11-02');
		});

		it('generates monthly buckets in Indonesian label names', () => {
			const buckets = generateBuckets('2026-08-01T00:00:00.000Z', '2026-11-30T23:59:59.999Z', 'month');
			expect(buckets.map((b) => b.bucket)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
			expect(buckets.map((b) => b.label)).toEqual(['Agu', 'Sep', 'Okt', 'Nov']);
		});

		it('appends 2-digit year to month label when spanning multiple years', () => {
			const buckets = generateBuckets('2025-11-01T00:00:00.000Z', '2026-02-28T23:59:59.999Z', 'month');
			expect(buckets.map((b) => b.label)).toEqual(['Nov 25', 'Des 25', 'Jan 26', 'Feb 26']);
		});
	});

	describe('getBucketKeyForDate', () => {
		const sampleTx = '2026-11-12T14:30:00.000Z'; // Thursday
		it('maps timestamp to correct day, week (Monday), and month keys', () => {
			expect(getBucketKeyForDate(sampleTx, 'day')).toBe('2026-11-12');
			expect(getBucketKeyForDate(sampleTx, 'week')).toBe('2026-11-09');
			expect(getBucketKeyForDate(sampleTx, 'month')).toBe('2026-11');
		});
	});
});
