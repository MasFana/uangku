import { describe, it, expect } from 'vitest';
import {
	endOfUtcDay,
	getUtcMonday,
	jakartaMonthKey,
	lastUtcDayOfMonth,
	pad2,
	parseUtcDateString,
	startOfUtcDay,
	todayInJakarta,
	toUtcDateString,
	daysBetweenUtc
} from '../src/lib/shared/dates';
import { deriveAnalytics } from '../src/lib/client/derive/aggregates';
import type { CategoryDTO, TransactionDTO, WalletDTO } from '../src/lib/shared/sync-contract';
// Anchor: Wednesday 2026-11-12T15:30:00.000Z (22:30 WIB, still 12 November in Jakarta).
const fixedNow = new Date('2026-11-12T15:30:00.000Z');
describe('date helpers (kalender UTC + "hari ini" WIB)', () => {
	it('normalizes UTC day start and end', () => {
		expect(startOfUtcDay(fixedNow).toISOString()).toBe('2026-11-12T00:00:00.000Z');
		expect(endOfUtcDay(fixedNow).toISOString()).toBe('2026-11-12T23:59:59.999Z');
		expect(toUtcDateString(fixedNow)).toBe('2026-11-12');
	});
	it('parses date strings strictly, rejecting impossible dates', () => {
		expect(parseUtcDateString('2026-11-12')?.toISOString()).toBe('2026-11-12T00:00:00.000Z');
		expect(parseUtcDateString('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
		expect(parseUtcDateString('2026-02-31')).toBeNull();
		expect(parseUtcDateString('2026-02-29')).toBeNull();
		expect(parseUtcDateString('2026-13-01')).toBeNull();
		expect(parseUtcDateString('2026-1-1')).toBeNull();
		expect(parseUtcDateString('')).toBeNull();
		expect(parseUtcDateString('besok')).toBeNull();
	});
	it('snaps any day of the week back to its Monday', () => {
		// 2026-11-12 is Thursday, 2026-11-15 Sunday, 2026-11-09 Monday.
		expect(toUtcDateString(getUtcMonday(new Date('2026-11-12T10:00:00.000Z')))).toBe('2026-11-09');
		expect(toUtcDateString(getUtcMonday(new Date('2026-11-15T12:00:00.000Z')))).toBe('2026-11-09');
		expect(toUtcDateString(getUtcMonday(new Date('2026-11-09T08:00:00.000Z')))).toBe('2026-11-09');
		expect(getUtcMonday(fixedNow).toISOString()).toBe('2026-11-09T00:00:00.000Z');
	});
	it('takes "today" from the Jakarta calendar, not the UTC calendar', () => {
		// 00:30 WIB on 13 November is still 17:30 UTC on 12 November.
		const earlyJakarta = new Date('2026-11-12T17:30:00.000Z');
		expect(toUtcDateString(todayInJakarta(earlyJakarta))).toBe('2026-11-13');
		expect(toUtcDateString(todayInJakarta(new Date('2026-11-12T16:59:00.000Z')))).toBe('2026-11-12');
		expect(jakartaMonthKey(new Date('2026-10-31T20:00:00.000Z'))).toBe('2026-11');
		expect(jakartaMonthKey(new Date('2026-10-31T16:00:00.000Z'))).toBe('2026-10');
	});
	it('counts whole days between two UTC days', () => {
		expect(daysBetweenUtc(new Date('2026-11-01T00:00:00.000Z'), new Date('2026-11-12T00:00:00.000Z'))).toBe(11);
		expect(daysBetweenUtc(new Date('2026-11-12T00:00:00.000Z'), new Date('2026-11-12T00:00:00.000Z'))).toBe(0);
		expect(pad2(3)).toBe('03');
		expect(lastUtcDayOfMonth(2026, 1)).toBe(28);
	});
});
function wallet(id: string): WalletDTO {
	return {
		id,
		userId: 'u1',
		name: `Dompet ${id}`,
		type: 'cash',
		initialBalance: 0,
		currentBalance: 0,
		icon: null,
		archived: false,
		hlc: `hlc-${id}`,
		serverUpdatedAt: 1,
		deletedAt: null,
		createdAt: '2026-01-01T00:00:00.000Z'
	};
}
function category(id: string): CategoryDTO {
	return {
		id,
		userId: 'u1',
		name: `Kategori ${id}`,
		kind: 'expense',
		icon: null,
		color: null,
		archived: false,
		hlc: `hlc-${id}`,
		serverUpdatedAt: 1,
		deletedAt: null,
		createdAt: '2026-01-01T00:00:00.000Z'
	};
}
function tx(id: string, type: TransactionDTO['type'], amount: number, ymd: string): TransactionDTO {
	return {
		id,
		userId: 'u1',
		walletId: 'w1',
		categoryId: type === 'transfer' ? null : 'c1',
		type,
		amount,
		transferWalletId: type === 'transfer' ? 'w2' : null,
		note: null,
		occurredAt: `${ymd}T00:00:00.000Z`,
		receiptKey: null,
		hlc: `hlc-${id}`,
		serverUpdatedAt: 1,
		deletedAt: null,
		createdAt: `${ymd}T00:00:00.000Z`,
		updatedAt: `${ymd}T00:00:00.000Z`
	};
}
const wallets = [wallet('w1'), wallet('w2')];
const categories = [category('c1')];
describe('series buckets from deriveAnalytics', () => {
	it('fills every day of the range, including days without transactions', () => {
		const txs = [
			tx('t1', 'income', 100_000, '2026-11-02'),
			tx('t2', 'expense', 40_000, '2026-11-05'),
			tx('t3', 'expense', 10_000, '2026-11-05')
		];
		const result = deriveAnalytics(txs, wallets, categories, { range: 'month' }, fixedNow);
		expect(result.series).toHaveLength(30);
		expect(result.series[0]).toMatchObject({ bucket: '2026-11-01', income: 0, expense: 0 });
		expect(result.series[1]).toMatchObject({ bucket: '2026-11-02', income: 100_000, expense: 0 });
		expect(result.series[4]).toMatchObject({ bucket: '2026-11-05', income: 0, expense: 50_000 });
		expect(result.series[29]).toMatchObject({ bucket: '2026-11-30', income: 0, expense: 0 });
		// Transaksi tanggal depan tetap tampil karena rentang memakai batas kalender.
		expect(result.filters.endDate).toBe('2026-11-30');
	});
	it('groups weekly buckets by the Monday of each ISO week', () => {
		const txs = [
			tx('t1', 'expense', 10_000, '2026-11-09'),
			tx('t2', 'expense', 20_000, '2026-11-15'),
			tx('t3', 'expense', 30_000, '2026-11-16')
		];
		const result = deriveAnalytics(
			txs,
			wallets,
			categories,
			{ range: 'custom', from: '2026-11-09', to: '2026-11-22', granularity: 'week' },
			fixedNow
		);
		expect(result.series.map((s) => s.bucket)).toEqual(['2026-11-09', '2026-11-16']);
		expect(result.series.map((s) => s.expense)).toEqual([30_000, 30_000]);
	});
	it('labels multi-year month buckets with a two-digit year', () => {
		const txs = [tx('t1', 'expense', 10_000, '2026-01-15')];
		const result = deriveAnalytics(
			txs,
			wallets,
			categories,
			{ range: 'custom', from: '2025-11-01', to: '2026-02-28', granularity: 'month' },
			fixedNow
		);
		expect(result.series.map((s) => s.bucket)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
		expect(result.series.map((s) => s.label)).toEqual(['Nov 25', 'Des 25', 'Jan 26', 'Feb 26']);
		expect(result.series[2].expense).toBe(10_000);
	});
});
