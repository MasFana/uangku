import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
	CreateWalletSchema,
	UpdateWalletSchema,
	CreateCategorySchema,
	UpdateCategorySchema,
	CreateTransactionSchema,
	UpdateTransactionSchema,
	TransferSchema,
	ListTransactionsQuerySchema
} from '../src/lib/server/validation';

describe('CreateWalletSchema', () => {
	it('accepts valid wallet payload', () => {
		const input = {
			name: 'BCA Utama',
			type: 'bank',
			initialBalance: 500_000,
			icon: 'wallet-icon'
		};
		const result = v.safeParse(CreateWalletSchema, input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.name).toBe('BCA Utama');
			expect(result.output.type).toBe('bank');
			expect(result.output.initialBalance).toBe(500_000);
		}
	});

	it('defaults initialBalance to 0 when omitted', () => {
		const input = { name: 'Tunai Dompet', type: 'cash' };
		const result = v.safeParse(CreateWalletSchema, input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.initialBalance).toBe(0);
		}
	});

	it('rejects empty or whitespace-only name', () => {
		const empty = v.safeParse(CreateWalletSchema, { name: '', type: 'cash' });
		expect(empty.success).toBe(false);

		const whitespace = v.safeParse(CreateWalletSchema, { name: '   ', type: 'cash' });
		expect(whitespace.success).toBe(false);
	});

	it('rejects invalid wallet type', () => {
		const result = v.safeParse(CreateWalletSchema, { name: 'Crypto', type: 'crypto_wallet' });
		expect(result.success).toBe(false);
	});

	it('rejects non-integer initialBalance', () => {
		const result = v.safeParse(CreateWalletSchema, {
			name: 'Gojek',
			type: 'ewallet',
			initialBalance: 1234.56
		});
		expect(result.success).toBe(false);
	});
});

describe('UpdateWalletSchema', () => {
	it('accepts partial updates', () => {
		const result = v.safeParse(UpdateWalletSchema, { name: 'BCA Baru' });
		expect(result.success).toBe(true);
	});

	it('rejects empty string name', () => {
		const result = v.safeParse(UpdateWalletSchema, { name: '' });
		expect(result.success).toBe(false);
	});
});

describe('CreateCategorySchema', () => {
	it('accepts valid income and expense category', () => {
		const expense = v.safeParse(CreateCategorySchema, {
			name: 'Makan & Minum',
			kind: 'expense',
			color: '#FF5733'
		});
		expect(expense.success).toBe(true);

		const income = v.safeParse(CreateCategorySchema, {
			name: 'Gaji Bulanan',
			kind: 'income'
		});
		expect(income.success).toBe(true);
	});

	it('rejects invalid category kind', () => {
		const result = v.safeParse(CreateCategorySchema, {
			name: 'Investasi',
			kind: 'transfer'
		});
		expect(result.success).toBe(false);
	});

	it('rejects empty category name', () => {
		const result = v.safeParse(CreateCategorySchema, {
			name: '   ',
			kind: 'expense'
		});
		expect(result.success).toBe(false);
	});
});

describe('CreateTransactionSchema', () => {
	it('accepts valid expense transaction', () => {
		const result = v.safeParse(CreateTransactionSchema, {
			walletId: 'w1',
			categoryId: 'c1',
			type: 'expense',
			amount: 45_000,
			occurredAt: '2026-11-12T10:00:00.000Z',
			note: 'Makan siang'
		});
		expect(result.success).toBe(true);
	});

	it('rejects non-positive amounts (0 or negative)', () => {
		const zero = v.safeParse(CreateTransactionSchema, {
			walletId: 'w1',
			type: 'expense',
			amount: 0
		});
		expect(zero.success).toBe(false);

		const negative = v.safeParse(CreateTransactionSchema, {
			walletId: 'w1',
			type: 'expense',
			amount: -10_000
		});
		expect(negative.success).toBe(false);
	});

	it('rejects non-integer float amounts', () => {
		const result = v.safeParse(CreateTransactionSchema, {
			walletId: 'w1',
			type: 'expense',
			amount: 15_000.5
		});
		expect(result.success).toBe(false);
	});

	it('rejects invalid ISO timestamp for occurredAt', () => {
		const result = v.safeParse(CreateTransactionSchema, {
			walletId: 'w1',
			type: 'income',
			amount: 100_000,
			occurredAt: 'invalid-date'
		});
		expect(result.success).toBe(false);
	});
});

describe('TransferSchema', () => {
	it('accepts valid transfer input', () => {
		const result = v.safeParse(TransferSchema, {
			sourceWalletId: 'w1',
			targetWalletId: 'w2',
			amount: 250_000,
			note: 'Topup e-wallet'
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty source or target wallet', () => {
		const result = v.safeParse(TransferSchema, {
			sourceWalletId: '',
			targetWalletId: 'w2',
			amount: 10_000
		});
		expect(result.success).toBe(false);
	});

	it('rejects zero transfer amount', () => {
		const result = v.safeParse(TransferSchema, {
			sourceWalletId: 'w1',
			targetWalletId: 'w2',
			amount: 0
		});
		expect(result.success).toBe(false);
	});
});

describe('ListTransactionsQuerySchema', () => {
	it('accepts valid query parameters and filters', () => {
		const result = v.safeParse(ListTransactionsQuerySchema, {
			walletId: 'w1',
			type: 'expense',
			limit: 50
		});
		expect(result.success).toBe(true);
	});

	it('rejects limit exceeding 100', () => {
		const result = v.safeParse(ListTransactionsQuerySchema, {
			limit: 150
		});
		expect(result.success).toBe(false);
	});

	it('rejects limit below 1', () => {
		const result = v.safeParse(ListTransactionsQuerySchema, {
			limit: 0
		});
		expect(result.success).toBe(false);
	});
});

describe('nullable id dari form', () => {
	it('mengubah categoryId kosong menjadi null pada CreateTransactionSchema', () => {
		const result = v.parse(CreateTransactionSchema, {
			walletId: 'w1',
			categoryId: '',
			type: 'expense',
			amount: 50000
		});
		expect(result.categoryId).toBeNull();
	});

	it('mengubah categoryId kosong menjadi null pada UpdateTransactionSchema', () => {
		const result = v.parse(UpdateTransactionSchema, { categoryId: '' });
		expect(result.categoryId).toBeNull();
	});

	it('membiarkan categoryId terisi apa adanya', () => {
		const result = v.parse(CreateTransactionSchema, {
			walletId: 'w1',
			categoryId: 'cat-1',
			type: 'income',
			amount: 1000
		});
		expect(result.categoryId).toBe('cat-1');
	});
});
