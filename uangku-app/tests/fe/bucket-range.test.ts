import { describe, expect, it } from 'vitest';
import { bucketLabel, bucketRange, monthKeyShortLabel } from '../../src/lib/shared/dates';

describe('bucketRange', () => {
	it('memetakan kunci harian ke satu hari', () => {
		expect(bucketRange('2026-11-03', 'day')).toEqual({
			startDate: '2026-11-03',
			endDate: '2026-11-03'
		});
	});

	it('memetakan kunci mingguan ke Senin sampai Minggu', () => {
		expect(bucketRange('2026-11-02', 'week')).toEqual({
			startDate: '2026-11-02',
			endDate: '2026-11-08'
		});
	});

	it('memetakan kunci bulanan ke hari terakhir bulan itu', () => {
		expect(bucketRange('2026-02', 'month')).toEqual({
			startDate: '2026-02-01',
			endDate: '2026-02-28'
		});
		expect(bucketRange('2024-02', 'month')).toEqual({
			startDate: '2024-02-01',
			endDate: '2024-02-29'
		});
	});

	it('menolak kunci yang tidak sesuai granularitas', () => {
		expect(bucketRange('2026-11-03', 'month')).toBeNull();
		expect(bucketRange('2026-11', 'day')).toBeNull();
		expect(bucketRange('2026-02-31', 'day')).toBeNull();
		expect(bucketRange('', 'week')).toBeNull();
	});

	it('melewati batas bulan dan tahun tanpa mundur satu hari', () => {
		expect(bucketRange('2026-12-31', 'week')).toEqual({
			startDate: '2026-12-31',
			endDate: '2027-01-06'
		});
	});
});

describe('monthKeyShortLabel', () => {
	it('mengubah kunci bulanan jadi nama bulan ringkas', () => {
		expect(monthKeyShortLabel('2026-09')).toBe('Sep');
		expect(monthKeyShortLabel('2026-01')).toBe('Jan');
		expect(monthKeyShortLabel('2026-12')).toBe('Des');
	});

	it('mengembalikan kunci apa adanya bila bukan kunci bulanan', () => {
		expect(monthKeyShortLabel('2026-13')).toBe('2026-13');
		expect(monthKeyShortLabel('3/11')).toBe('3/11');
		expect(monthKeyShortLabel('')).toBe('');
	});
});

describe('bucketLabel', () => {
	it('memakai nama hari-bulan-tahun untuk titik harian', () => {
		expect(bucketLabel('2026-11-03', 'day')).toBe('3 Nov 2026');
	});

	it('menyebut tahun sekali bila minggu tidak melewati tahun', () => {
		expect(bucketLabel('2026-11-02', 'week')).toBe('2 Nov - 8 Nov 2026');
	});

	it('menyebut kedua tahun bila minggu melewati tahun', () => {
		expect(bucketLabel('2026-12-31', 'week')).toBe('31 Des 2026 - 6 Jan 2027');
	});

	it('memakai nama bulan penuh untuk titik bulanan', () => {
		expect(bucketLabel('2026-11', 'month')).toBe('November 2026');
	});

	it('kembali ke kunci mentah bila kunci tidak sah', () => {
		expect(bucketLabel('2026-11', 'day')).toBe('2026-11');
	});
});
