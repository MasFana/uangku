import { describe, it, expect } from 'vitest';
import { CSV_HEADER, escapeCsvCell, formatTransactionRow } from '../src/lib/server/csv';
import { streamTransactionsCsv } from '../src/lib/server/services/export';
import { wallets, categories } from '../src/lib/server/db/schema';
import type { AppEvent } from '../src/lib/server/types';

describe('CSV Pure Builder', () => {
	it('has correct CSV header columns', () => {
		expect(CSV_HEADER).toBe('tanggal,tipe,dompet,kategori,jumlah,catatan');
	});

	it('escapes cells containing commas, quotes, and newlines per RFC 4180', () => {
		expect(escapeCsvCell('biasa')).toBe('biasa');
		expect(escapeCsvCell('ada,koma')).toBe('"ada,koma"');
		expect(escapeCsvCell('ada "kutip"')).toBe('"ada ""kutip"""');
		expect(escapeCsvCell('ada\nbaris baru')).toBe('"ada\nbaris baru"');
		expect(escapeCsvCell('ada,koma dan "kutip"')).toBe('"ada,koma dan ""kutip"""');
		expect(escapeCsvCell(null)).toBe('');
		expect(escapeCsvCell(undefined)).toBe('');
	});

	it('formats integer rupiah without decimals or floating point artifacts', () => {
		expect(escapeCsvCell(150000)).toBe('150000');
		expect(escapeCsvCell(12500.9)).toBe('12500');

		const row = formatTransactionRow({
			occurredAt: '2026-11-12T10:00:00.000Z',
			type: 'expense',
			walletName: 'BCA',
			categoryName: 'Makan',
			amount: 50000,
			note: 'Nasi padang'
		});
		expect(row).toBe('2026-11-12T10:00:00.000Z,expense,BCA,Makan,50000,Nasi padang');
	});

	it('formats transfer row with target wallet name in category column', () => {
		const transferRow = formatTransactionRow({
			occurredAt: '2026-11-12T12:00:00.000Z',
			type: 'transfer',
			walletName: 'BCA',
			targetWalletName: 'GoPay',
			amount: 250000,
			note: 'Top up'
		});
		expect(transferRow).toBe('2026-11-12T12:00:00.000Z,transfer,BCA,-> GoPay,250000,Top up');
	});

	it('escapes note containing quotes and commas correctly in row format', () => {
		const row = formatTransactionRow({
			occurredAt: '2026-11-12T15:00:00.000Z',
			type: 'income',
			walletName: 'Dompet Tunai',
			categoryName: 'Gaji, Bonus',
			amount: 1000000,
			note: 'Bonus "proyek", tgl 12'
		});
		expect(row).toBe(
			'2026-11-12T15:00:00.000Z,income,Dompet Tunai,"Gaji, Bonus",1000000,"Bonus ""proyek"", tgl 12"'
		);
	});
});

describe('streamTransactionsCsv Service', () => {
	it('streams UTF-8 BOM, header, and rows according to batch generator', async () => {
		const mockTxs = [
			{
				id: 'tx-1',
				userId: 'user-1',
				walletId: 'w-1',
				categoryId: 'c-1',
				type: 'expense' as const,
				amount: 45000,
				transferWalletId: null,
				note: 'Makan, sate',
				occurredAt: '2026-11-12T08:00:00.000Z',
				receiptKey: null,
				createdAt: '2026-11-12T08:00:00.000Z',
				updatedAt: '2026-11-12T08:00:00.000Z'
			},
			{
				id: 'tx-2',
				userId: 'user-1',
				walletId: 'w-1',
				categoryId: null,
				type: 'transfer' as const,
				amount: 100000,
				transferWalletId: 'w-2',
				note: 'Pindah dana',
				occurredAt: '2026-11-12T09:00:00.000Z',
				receiptKey: null,
				createdAt: '2026-11-12T09:00:00.000Z',
				updatedAt: '2026-11-12T09:00:00.000Z'
			}
		];

		let txQueried = false;
		const mockDb = {
			select(fields?: unknown) {
				return {
					from(table: unknown) {
						return {
							where() {
								if (table === wallets) {
									return Promise.resolve([
										{ id: 'w-1', name: 'BCA Utama', initialBalance: 0, archived: false },
										{ id: 'w-2', name: 'GoPay', initialBalance: 0, archived: false }
									]);
								}
								if (table === categories) {
									return Promise.resolve([
										{ id: 'c-1', name: 'Makanan & Minuman', archived: false }
									]);
								}
								if (fields && typeof fields === 'object') {
									// userTransactions query in WalletsRepo.list
									return Promise.resolve([]);
								}
								// TransactionsRepo.list query
								return {
									orderBy() {
										return {
											limit() {
												if (!txQueried) {
													txQueried = true;
													return Promise.resolve(mockTxs);
												}
												return Promise.resolve([]);
											}
										};
									}
								};
							}
						};
					}
				};
			}
		};

		const mockEvent: AppEvent = {
			locals: {
				user: { id: 'user-1' },
				db: mockDb as unknown as AppEvent['locals']['db']
			}
		};

		const stream = streamTransactionsCsv(mockEvent);
		const reader = stream.getReader();
		const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
		let fullOutput = '';
		let firstChunk = true;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (firstChunk && value) {
				// Byte check BOM UTF-8: 0xEF, 0xBB, 0xBF
				expect(value[0]).toBe(0xef);
				expect(value[1]).toBe(0xbb);
				expect(value[2]).toBe(0xbf);
				firstChunk = false;
			}
			fullOutput += decoder.decode(value, { stream: true });
		}
		fullOutput += decoder.decode();

		// Check UTF-8 BOM character
		expect(fullOutput.charCodeAt(0)).toBe(0xfeff);

		// Remove BOM for split testing
		const cleanOutput = fullOutput.replace('\uFEFF', '');
		const lines = cleanOutput.trim().split(/\r\n|\n/);

		expect(lines[0]).toBe('tanggal,tipe,dompet,kategori,jumlah,catatan');
		expect(lines).toHaveLength(3); // Header + 2 data rows
		expect(lines[1]).toBe(
			'2026-11-12T08:00:00.000Z,expense,BCA Utama,Makanan & Minuman,45000,"Makan, sate"'
		);
		expect(lines[2]).toBe(
			'2026-11-12T09:00:00.000Z,transfer,BCA Utama,-> GoPay,100000,Pindah dana'
		);
	});
});
