import { describe, expect, it } from 'vitest';
import type { CategoryDTO, TransactionDTO, WalletDTO } from '../../src/lib/shared/sync-contract';
import {
	deriveAnalytics,
	deriveDashboard,
	deriveWalletBalances,
	filterTransactions,
	sumBalances
} from '../../src/lib/client/derive';

const NOW = new Date('2026-11-15T09:30:00.000Z');

function wallet(id: string, initialBalance: number, overrides: Partial<WalletDTO> = {}): WalletDTO {
	return {
		id,
		userId: 'u1',
		name: `Dompet ${id}`,
		type: 'cash',
		initialBalance,
		currentBalance: initialBalance,
		icon: null,
		archived: false,
		hlc: `hlc-${id}`,
		serverUpdatedAt: 1,
		deletedAt: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

function category(id: string, kind: CategoryDTO['kind'], overrides: Partial<CategoryDTO> = {}): CategoryDTO {
	return {
		id,
		userId: 'u1',
		name: `Kategori ${id}`,
		kind,
		icon: null,
		color: null,
		archived: false,
		hlc: `hlc-${id}`,
		serverUpdatedAt: 1,
		deletedAt: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

function tx(
	input: {
		id: string;
		walletId: string;
		type: TransactionDTO['type'];
		amount: number;
		occurredAt: string;
	} & Partial<TransactionDTO>
): TransactionDTO {
	return {
		userId: 'u1',
		categoryId: null,
		transferWalletId: null,
		note: null,
		receiptKey: null,
		hlc: `hlc-${input.id}`,
		serverUpdatedAt: 1,
		deletedAt: null,
		createdAt: input.occurredAt,
		updatedAt: input.occurredAt,
		...input
	};
}

describe('deriveWalletBalances', () => {
	it('returns initial balances for an empty dataset', () => {
		const balances = deriveWalletBalances([wallet('w1', 100_000), wallet('w2', 0)], []);
		expect(balances.get('w1')).toBe(100_000);
		expect(balances.get('w2')).toBe(0);
		expect(sumBalances(balances)).toBe(100_000);
	});

	it('applies income and expense on the primary wallet', () => {
		const balances = deriveWalletBalances(
			[wallet('w1', 100_000)],
			[
				tx({ id: 't1', walletId: 'w1', type: 'income', amount: 250_000, occurredAt: '2026-11-02T10:00:00.000Z' }),
				tx({ id: 't2', walletId: 'w1', type: 'expense', amount: 40_000, occurredAt: '2026-11-03T10:00:00.000Z' })
			]
		);
		expect(balances.get('w1')).toBe(310_000);
	});

	it('debits the source and credits the destination of a transfer', () => {
		const balances = deriveWalletBalances(
			[wallet('w1', 100_000), wallet('w2', 50_000)],
			[
				tx({
					id: 't1',
					walletId: 'w1',
					type: 'transfer',
					amount: 30_000,
					transferWalletId: 'w2',
					occurredAt: '2026-11-04T10:00:00.000Z'
				})
			]
		);
		expect(balances.get('w1')).toBe(70_000);
		expect(balances.get('w2')).toBe(80_000);
		expect(sumBalances(balances)).toBe(150_000);
	});

	it('ignores soft-deleted rows and unknown wallet ids', () => {
		const balances = deriveWalletBalances(
			[wallet('w1', 100_000)],
			[
				tx({
					id: 't1',
					walletId: 'w1',
					type: 'expense',
					amount: 25_000,
					occurredAt: '2026-11-05T10:00:00.000Z',
					deletedAt: '2026-11-06T00:00:00.000Z'
				}),
				tx({ id: 't2', walletId: 'ghost', type: 'expense', amount: 999_000, occurredAt: '2026-11-05T10:00:00.000Z' })
			]
		);
		expect(balances.get('w1')).toBe(100_000);
		expect(balances.size).toBe(1);
	});
});

describe('filterTransactions periods', () => {
	const dataset = [
		tx({ id: 'a', walletId: 'w1', type: 'expense', amount: 1_000, occurredAt: '2026-10-31T23:59:59.999Z' }),
		tx({ id: 'b', walletId: 'w1', type: 'expense', amount: 2_000, occurredAt: '2026-11-01T00:00:00.000Z' }),
		tx({ id: 'c', walletId: 'w1', type: 'expense', amount: 3_000, occurredAt: '2026-11-15T12:00:00.000Z' }),
		tx({ id: 'd', walletId: 'w1', type: 'expense', amount: 4_000, occurredAt: '2026-11-30T23:59:59.999Z' }),
		tx({ id: 'e', walletId: 'w1', type: 'expense', amount: 5_000, occurredAt: '2026-12-01T00:00:00.000Z' })
	];

	it('includes the first and last millisecond of the month only', () => {
		const result = filterTransactions(dataset, { period: '2026-11' }, NOW);
		expect(result.items.map((t) => t.id)).toEqual(['d', 'c', 'b']);
		expect(result.total).toBe(3);
	});

	it('treats "all" as unbounded', () => {
		expect(filterTransactions(dataset, { period: 'all' }, NOW).total).toBe(5);
	});

	it('swaps inverted custom bounds and falls back to the current UTC month', () => {
		const inverted = filterTransactions(
			dataset,
			{ period: 'custom', startDate: '2026-11-30', endDate: '2026-11-01' },
			NOW
		);
		expect(inverted.total).toBe(3);
		expect(inverted.items.map((t) => t.id)).toEqual(['d', 'c', 'b']);
		expect(filterTransactions(dataset, { period: 'nope' }, NOW).total).toBe(3);
	});

	it('filters by type, wallet, category, search and pages desc by occurredAt/id', () => {
		const rows = [
			tx({
				id: 'z1',
				walletId: 'w1',
				type: 'income',
				amount: 10_000,
				categoryId: 'c1',
				note: 'Gaji November',
				occurredAt: '2026-11-02T08:00:00.000Z'
			}),
			tx({
				id: 'z2',
				walletId: 'w2',
				type: 'expense',
				amount: 20_000,
				categoryId: 'c2',
				note: 'Kopi',
				occurredAt: '2026-11-02T08:00:00.000Z'
			}),
			tx({
				id: 'a9',
				walletId: 'w2',
				type: 'expense',
				amount: 30_000,
				categoryId: 'c2',
				note: 'kopi susu',
				occurredAt: '2026-11-02T08:00:00.000Z'
			})
		];

		expect(filterTransactions(rows, { period: '2026-11', type: 'income' }, NOW).items.map((t) => t.id)).toEqual(['z1']);
		expect(filterTransactions(rows, { period: '2026-11', walletId: 'w2' }, NOW).items.map((t) => t.id)).toEqual(['z2', 'a9']);
		expect(filterTransactions(rows, { period: '2026-11', categoryId: 'c2' }, NOW).total).toBe(2);
		expect(filterTransactions(rows, { period: '2026-11', search: 'KOPI' }, NOW).total).toBe(2);
		expect(filterTransactions(rows, { period: '2026-11', pageSize: 1 }, NOW).items.map((t) => t.id)).toEqual(['z2']);
		expect(
			filterTransactions(rows, { period: '2026-11', page: 2, pageSize: 1 }, NOW).items.map((t) => t.id)
		).toEqual(['z1']);
		expect(
			filterTransactions(rows, { period: '2026-11', page: 3, pageSize: 1 }, NOW).items.map((t) => t.id)
		).toEqual(['a9']);
		expect(filterTransactions(rows, { period: '2026-11', pageSize: 999 }, NOW).total).toBe(3);
	});
});

describe('deriveAnalytics', () => {
	const wallets = [wallet('w1', 0), wallet('w2', 0), wallet('w3', 0, { archived: true })];
	const categories = [
		category('c1', 'expense', { name: 'Makan', color: '#111111' }),
		category('c2', 'income')
	];
	const transactions = [
		tx({ id: 'i1', walletId: 'w1', type: 'income', amount: 1_000_000, categoryId: 'c2', occurredAt: '2026-11-01T00:00:00.000Z' }),
		tx({ id: 'e1', walletId: 'w1', type: 'expense', amount: 300_000, categoryId: 'c1', occurredAt: '2026-11-01T23:59:59.999Z' }),
		tx({ id: 'e2', walletId: 'w2', type: 'expense', amount: 100_000, categoryId: 'c1', occurredAt: '2026-11-02T05:00:00.000Z' }),
		tx({
			id: 't1',
			walletId: 'w1',
			type: 'transfer',
			amount: 50_000,
			transferWalletId: 'w2',
			occurredAt: '2026-11-02T06:00:00.000Z'
		}),
		tx({ id: 'gone', walletId: 'w1', type: 'expense', amount: 900_000, categoryId: 'c1', occurredAt: '2026-11-03T00:00:00.000Z', deletedAt: '2026-11-04T00:00:00.000Z' })
	];

	it('summarises a custom range without transfers in income/expense', () => {
		const result = deriveAnalytics(
			transactions,
			wallets,
			categories,
			{ range: 'custom', from: '2026-11-01', to: '2026-11-30', granularity: 'day' },
			NOW
		);

		expect(result.filters.range).toBe('custom');
		expect(result.filters.from).toBe('2026-11-01');
		expect(result.filters.to).toBe('2026-11-30');
		expect(result.filters.granularity).toBe('day');
		expect(result.summary).toEqual({
			income: 1_000_000,
			expense: 400_000,
			net: 600_000,
			count: 4,
			transferCount: 1,
			// 400.000 pengeluaran dibagi 15 hari (1-15 Nov, sampai hari ini).
			avgPerDay: 26_667,
			avgPerDayBasis: 'expense',
			largest: {
				amount: 1_000_000,
				type: 'income',
				occurredAt: '2026-11-01T00:00:00.000Z',
				note: null,
				categoryName: 'Kategori c2',
				walletId: 'w1',
				walletName: 'Dompet w1'
			}
		});
		expect(result.series[0]).toEqual({ bucket: '2026-11-01', label: '1/11', month: '1/11', income: 1_000_000, expense: 300_000 });
		expect(result.series[1]).toEqual({ bucket: '2026-11-02', label: '2/11', month: '2/11', income: 0, expense: 100_000 });
		expect(result.series).toHaveLength(30);
		// Kartu kategori memakai basis pengeluaran: pemasukan tidak boleh ikut.
		expect(result.filters.categoriesBasis).toBe('expense');
		expect(result.categories).toEqual([
			{ categoryId: 'c1', name: 'Makan', total: 400_000, count: 2, color: '#111111', share: 1 }
		]);
		expect(result.wallets).toEqual([
			{
				walletId: 'w1',
				name: 'Dompet w1',
				income: 1_000_000,
				expense: 300_000,
				transferIn: 0,
				transferOut: 50_000,
				net: 700_000,
				netChange: 650_000,
				count: 3
			},
			{
				walletId: 'w2',
				name: 'Dompet w2',
				income: 0,
				expense: 100_000,
				transferIn: 50_000,
				transferOut: 0,
				net: -100_000,
				netChange: -50_000,
				count: 2
			}
		]);
		// Dompet arsip tetap tersedia sebagai opsi filter (riwayatnya masih bisa dilihat).
		expect(result.options.wallets).toEqual([
			{ id: 'w1', name: 'Dompet w1', archived: false },
			{ id: 'w2', name: 'Dompet w2', archived: false },
			{ id: 'w3', name: 'Dompet w3', archived: true }
		]);
		expect(result.options.categories.map((c) => c.id)).toEqual(['c2', 'c1']);
		expect(result.range).toEqual({ from: '2026-11-01', to: '2026-11-30' });
	});

	it('returns zeroed totals, buckets and a null largest for an empty period', () => {
		const result = deriveAnalytics([], wallets, categories, { range: 'custom', from: '2026-01-01', to: '2026-01-03' }, NOW);
		expect(result.summary).toEqual({
			income: 0,
			expense: 0,
			net: 0,
			count: 0,
			transferCount: 0,
			avgPerDay: 0,
			avgPerDayBasis: 'expense',
			largest: null
		});
		expect(result.series).toHaveLength(3);
		expect(result.series.every((s) => s.income === 0 && s.expense === 0)).toBe(true);
		expect(result.categories).toEqual([]);
		expect(result.wallets).toEqual([]);
		expect(result.previous).not.toBeNull();
	});

	it('excludes soft-deleted rows from the previous-period comparison', () => {
		const rows = [
			...transactions,
			tx({ id: 'p1', walletId: 'w1', type: 'income', amount: 500_000, occurredAt: '2026-10-20T00:00:00.000Z' }),
			tx({ id: 'p2', walletId: 'w1', type: 'income', amount: 700_000, occurredAt: '2026-10-21T00:00:00.000Z', deletedAt: '2026-10-22T00:00:00.000Z' })
		];
		const result = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		expect(result.previous?.income).toBe(500_000);
		expect(result.previous?.expense).toBe(0);
	});
});

describe('deriveDashboard', () => {
	it('recomputes balances, current month, trend and recent rows from local DTOs', () => {
		const wallets = [wallet('w1', 1_000), wallet('w2', 2_000), wallet('w3', 3_000, { archived: true })];
		const categories = [category('c1', 'expense', { name: 'Makan', color: '#abc' })];
		const transactions = [
			tx({ id: 'r1', walletId: 'w1', type: 'income', amount: 500_000, occurredAt: '2026-11-20T10:00:00.000Z' }),
			tx({ id: 'r2', walletId: 'w1', type: 'expense', amount: 120_000, categoryId: 'c1', occurredAt: '2026-11-20T11:00:00.000Z' }),
			tx({ id: 'r3', walletId: 'w2', type: 'expense', amount: 30_000, categoryId: 'c1', occurredAt: '2026-11-21T11:00:00.000Z' }),
			tx({ id: 'r4', walletId: 'w2', type: 'transfer', amount: 10_000, transferWalletId: 'w1', occurredAt: '2026-11-22T11:00:00.000Z' }),
			tx({ id: 'r5', walletId: 'w1', type: 'expense', amount: 900_000, occurredAt: '2026-10-05T11:00:00.000Z' }),
			tx({ id: 'r6', walletId: 'w1', type: 'expense', amount: 55_000, occurredAt: '2026-11-23T11:00:00.000Z', deletedAt: '2026-11-24T00:00:00.000Z' })
		];

		const summary = deriveDashboard(transactions, wallets, categories, NOW);

		expect(summary.wallets.map((w) => [w.id, w.currentBalance])).toEqual([
			['w1', -509_000],
			['w2', -38_000]
		]);
		expect(summary.totalBalance).toBe(-547_000);
		expect(summary.currentMonth).toEqual({ income: 500_000, expense: 150_000, net: 350_000 });
		expect(summary.recentTransactions.map((t) => t.id)).toEqual(['r4', 'r3', 'r2', 'r1', 'r5']);
		expect(summary.recentTransactions[0]).toEqual({
			id: 'r4',
			walletId: 'w2',
			categoryId: null,
			type: 'transfer',
			amount: 10_000,
			transferWalletId: 'w1',
			note: null,
			occurredAt: '2026-11-22T11:00:00.000Z'
		});
		expect(summary.categoryBreakdown).toEqual([
			{ categoryId: 'c1', categoryName: 'Makan', total: 150_000, color: '#abc' }
		]);
		expect(summary.sixMonthTrend.map((m) => m.month)).toEqual([
			'2026-06',
			'2026-07',
			'2026-08',
			'2026-09',
			'2026-10',
			'2026-11'
		]);
		expect(summary.sixMonthTrend[4]).toEqual({ month: '2026-10', income: 0, expense: 900_000 });
		expect(summary.sixMonthTrend[5]).toEqual({ month: '2026-11', income: 500_000, expense: 150_000 });
	});
});
