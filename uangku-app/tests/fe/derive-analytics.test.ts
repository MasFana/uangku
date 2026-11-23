import { describe, expect, it } from 'vitest';
import { deriveAnalytics, MAX_SERIES_BUCKETS } from '../../src/lib/client/derive/aggregates';
import type { CategoryDTO, TransactionDTO, WalletDTO } from '../../src/lib/shared/sync-contract';

const cat = (id: string, name: string, kind = 'expense') =>
	({ id, userId: 'u1', name, kind, color: null, icon: null, archived: false, deletedAt: null, createdAt: '', updatedAt: '' }) as unknown as CategoryDTO;
const w = (id: string, name: string, archived = false) =>
	({ id, userId: 'u1', name, type: 'cash', initialBalance: 0, currency: 'IDR', archived, deletedAt: null, createdAt: '', updatedAt: '' }) as unknown as WalletDTO;
const t = (
	id: string,
	amount: number,
	occurredAt: string,
	walletId: string,
	categoryId: string | null,
	type = 'expense',
	transferWalletId: string | null = null
) =>
	({ id, userId: 'u1', walletId, categoryId, transferWalletId, type, amount, note: null, occurredAt, receiptKey: null, deletedAt: null, createdAt: occurredAt, updatedAt: occurredAt }) as unknown as TransactionDTO;

const NOW = new Date('2026-07-15T10:00:00.000Z'); // 15 Juli 17:00 WIB
const wallets = [w('w1', 'Dompet Utama'), w('w2', 'Dompet Lama')];
const categories = [cat('c1', 'Makan'), cat('c2', 'Gaji', 'income')];

describe('A kategori', () => {
	it('kartu pengeluaran tidak memuat pemasukan', () => {
		const rows = [t('gaji', 10_000_000, '2026-07-05T00:00:00.000Z', 'w1', 'c2', 'income'), t('makan', 1_000_000, '2026-07-06T00:00:00.000Z', 'w1', 'c1')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		expect(r.filters.categoriesBasis).toBe('expense');
		expect(r.categories.map((c) => [c.name, c.total, c.share])).toEqual([['Makan', 1_000_000, 1]]);
	});
	it('filter pemasukan -> rincian pemasukan, basis income', () => {
		const rows = [t('gaji', 10_000_000, '2026-07-05T00:00:00.000Z', 'w1', 'c2', 'income'), t('makan', 1_000_000, '2026-07-06T00:00:00.000Z', 'w1', 'c1')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'month', type: 'income' }, NOW);
		expect(r.filters.categoriesBasis).toBe('income');
		expect(r.categories.map((c) => [c.name, c.total, c.share])).toEqual([['Gaji', 10_000_000, 1]]);
	});
});

describe('B largest', () => {
	it('menyimpan jenis, dompet, dan mengabaikan amount 0', () => {
		const rows = [
			t('inc', 5_000_000, '2026-07-05T00:00:00.000Z', 'w1', 'c2', 'income'),
			t('exp', 900_000, '2026-07-06T00:00:00.000Z', 'w1', 'c1'),
			t('zero', 0, '2026-07-07T00:00:00.000Z', 'w1', 'c1'),
			t('tf', 3_000_000, '2026-07-08T00:00:00.000Z', 'w1', null, 'transfer', 'w2')
		];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		expect(r.summary.largest).toEqual({
			amount: 5_000_000,
			type: 'income',
			occurredAt: '2026-07-05T00:00:00.000Z',
			note: null,
			categoryName: 'Gaji',
			walletId: 'w1',
			walletName: 'Dompet Utama'
		});
	});
	it('amount 0 saja -> null', () => {
		const r = deriveAnalytics([t('zero', 0, '2026-07-07T00:00:00.000Z', 'w1', 'c1')], wallets, categories, { range: 'month' }, NOW);
		expect(r.summary.largest).toBeNull();
	});
});

describe('C avgPerDay', () => {
	it('mengikuti filter jenis', () => {
		const rows = [t('inc', 3_000_000, '2026-07-05T00:00:00.000Z', 'w1', 'c2', 'income'), t('exp', 300_000, '2026-07-06T00:00:00.000Z', 'w1', 'c1')];
		const all = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		const inc = deriveAnalytics(rows, wallets, categories, { range: 'month', type: 'income' }, NOW);
		expect(all.summary.avgPerDayBasis).toBe('expense');
		expect(all.filters.daysCount).toBe(15);
		expect(all.summary.avgPerDay).toBe(20_000);
		expect(inc.summary.avgPerDayBasis).toBe('income');
		expect(inc.summary.avgPerDay).toBe(200_000);
	});
	it('range=all memakai riwayat setelah filter dompet', () => {
		const rows = [t('old', 100_000, '2025-01-01T00:00:00.000Z', 'w2', 'c1'), t('new', 300_000, '2026-07-10T00:00:00.000Z', 'w1', 'c1')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'all', walletId: 'w1' }, NOW);
		expect(r.range.from).toBe('2026-07-10');
		expect(r.summary.avgPerDay).toBe(50_000);
	});
});

describe('D transfer', () => {
	it('masuk tabel dompet dan dihitung terpisah', () => {
		const rows = [t('tf', 500_000, '2026-07-08T00:00:00.000Z', 'w1', null, 'transfer', 'w2')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		expect(r.summary.count).toBe(1);
		expect(r.summary.transferCount).toBe(1);
		expect(r.summary.income).toBe(0);
		expect(r.wallets.map((x) => [x.walletId, x.transferOut, x.transferIn, x.netChange])).toEqual([
			['w2', 0, 500_000, 500_000],
			['w1', 500_000, 0, -500_000]
		]);
	});
});

describe('E tanggal depan', () => {
	it('transaksi dalam periode berjalan tetap dihitung', () => {
		const rows = [t('past', 100_000, '2026-07-05T00:00:00.000Z', 'w1', 'c1'), t('future', 250_000, '2026-07-28T00:00:00.000Z', 'w1', 'c1')];
		const month = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		expect(month.summary.expense).toBe(350_000);
		expect(month.range).toEqual({ from: '2026-07-01', to: '2026-07-31' });
		const all = deriveAnalytics(rows, wallets, categories, { range: 'all' }, NOW);
		expect(all.summary.expense).toBe(350_000);
		expect(all.range.to).toBe('2026-07-28');
	});
});

describe('F zona waktu WIB', () => {
	it('pukul 06:30 WIB tanggal 1 sudah masuk bulan baru', () => {
		const rows = [t('tx1', 500_000, '2026-07-01T00:00:00.000Z', 'w1', 'c1')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'month' }, new Date('2026-06-30T23:30:00.000Z'));
		expect(r.filters.label).toBe('Juli 2026');
		expect(r.range).toEqual({ from: '2026-07-01', to: '2026-07-31' });
		expect(r.summary.count).toBe(1);
	});
	it('awal minggu dihitung dari Senin kalender WIB', () => {
		const r = deriveAnalytics([], wallets, categories, { range: 'week' }, new Date('2026-07-19T20:00:00.000Z')); // 20 Juli 03:00 WIB, Senin
		expect(r.range).toEqual({ from: '2026-07-20', to: '2026-07-26' });
	});
});

describe('G tanggal mustahil', () => {
	it('2026-02-31 ditolak, pakai default awal bulan', () => {
		const r = deriveAnalytics([], wallets, categories, { range: 'custom', from: '2026-02-31', to: '2026-03-05' }, NOW);
		expect(r.range.from).toBe('2026-03-05');
		expect(r.range.to).toBe('2026-03-05');
	});
});

describe('H batas titik grafik', () => {
	it('harian untuk rentang panjang dinaikkan otomatis', () => {
		const rows = [t('a', 1_000, '2025-01-01T00:00:00.000Z', 'w1', 'c1'), t('b', 1_000, '2026-07-10T00:00:00.000Z', 'w1', 'c1')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'all', granularity: 'day' }, NOW);
		expect(r.filters.granularityAdjusted).toBe(true);
		expect(r.filters.granularity).toBe('week');
		expect(r.series.length).toBeLessThanOrEqual(MAX_SERIES_BUCKETS);
		expect(r.series.length).toBe(81);
	});
	it('45 hari tetap harian (di bawah batas)', () => {
		const r = deriveAnalytics([], wallets, categories, { range: 'custom', from: '2026-06-01', to: '2026-07-15', granularity: 'day' }, NOW);
		expect(r.filters.granularityAdjusted).toBe(false);
		expect(r.series.length).toBe(45);
	});
});

describe('I periode sebelumnya', () => {
	it('bulan ini dibanding bulan lalu penuh', () => {
		const rows = [t('a', 1_000_000, '2026-06-05T00:00:00.000Z', 'w1', 'c1'), t('b', 200_000, '2026-07-02T00:00:00.000Z', 'w1', 'c1')];
		const r = deriveAnalytics(rows, wallets, categories, { range: 'month' }, NOW);
		expect(r.previous?.from).toBe('2026-06-01T00:00:00.000Z');
		expect(r.previous?.to).toBe('2026-06-30T23:59:59.999Z');
		expect(r.previous?.label).toBe('bulan lalu');
		expect(r.previous?.expense).toBe(1_000_000);
	});
	it('custom memakai jendela sepanjang sama sebelumnya', () => {
		const r = deriveAnalytics([], wallets, categories, { range: 'custom', from: '2026-07-10', to: '2026-07-12' }, NOW);
		expect(r.previous?.from).toBe('2026-07-07T00:00:00.000Z');
		expect(r.previous?.to).toBe('2026-07-09T23:59:59.999Z');
	});
});

describe('J opsi arsip', () => {
	it('dompet/kategori arsip tetap tersedia sebagai opsi terfilter', () => {
		const r = deriveAnalytics([], [wallets[0], w('w2', 'Dompet Lama', true)], [categories[0]], { range: 'month' }, NOW);
		expect(r.options.wallets).toEqual([
			{ id: 'w2', name: 'Dompet Lama', archived: true },
			{ id: 'w1', name: 'Dompet Utama', archived: false }
		]);
	});
});
