import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
	SyncWalletUpsertSchema,
	SyncCategoryUpsertSchema,
	SyncTransactionUpsertSchema,
	SyncDeletePayloadSchema,
	SyncMutationEnvelopeSchema,
	parseSyncMutation
} from '../../src/lib/server/validation';

describe('SyncWalletUpsertSchema', () => {
	it('accepts a valid wallet upsert', () => {
		const result = v.safeParse(SyncWalletUpsertSchema, {
			id: 'w1',
			name: 'BCA Utama',
			type: 'bank',
			initialBalance: 500_000,
			icon: 'wallet-icon',
			archived: false,
			createdAt: '2026-11-12T10:00:00.000Z'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.id).toBe('w1');
			expect(result.output.initialBalance).toBe(500_000);
			expect(result.output.archived).toBe(false);
		}
	});

	it('requires a non-empty id', () => {
		const result = v.safeParse(SyncWalletUpsertSchema, {
			id: '',
			name: 'Tunai',
			type: 'cash',
			initialBalance: 0
		});
		expect(result.success).toBe(false);
	});

	it('rejects an empty name', () => {
		const result = v.safeParse(SyncWalletUpsertSchema, {
			id: 'w1',
			name: '',
			type: 'cash',
			initialBalance: 0
		});
		expect(result.success).toBe(false);
	});

	it('rejects an invalid wallet type', () => {
		const result = v.safeParse(SyncWalletUpsertSchema, {
			id: 'w1',
			name: 'Crypto',
			type: 'crypto_wallet',
			initialBalance: 0
		});
		expect(result.success).toBe(false);
	});

	it('rejects non-integer and negative initialBalance', () => {
		const float = v.safeParse(SyncWalletUpsertSchema, {
			id: 'w1',
			name: 'Gojek',
			type: 'ewallet',
			initialBalance: 1234.56
		});
		expect(float.success).toBe(false);

		const negative = v.safeParse(SyncWalletUpsertSchema, {
			id: 'w1',
			name: 'Gojek',
			type: 'ewallet',
			initialBalance: -1
		});
		expect(negative.success).toBe(false);
	});
});

describe('SyncCategoryUpsertSchema', () => {
	it('accepts a valid category upsert', () => {
		const result = v.safeParse(SyncCategoryUpsertSchema, {
			id: 'c1',
			name: 'Investasi',
			kind: 'expense',
			color: '#ff0000'
		});
		expect(result.success).toBe(true);
	});

	it('rejects an invalid kind', () => {
		const result = v.safeParse(SyncCategoryUpsertSchema, {
			id: 'c1',
			name: 'Investasi',
			kind: 'transfer'
		});
		expect(result.success).toBe(false);
	});

	it('rejects an empty name', () => {
		const result = v.safeParse(SyncCategoryUpsertSchema, {
			id: 'c1',
			name: '',
			kind: 'expense'
		});
		expect(result.success).toBe(false);
	});

	it('rejects a color longer than 20 chars', () => {
		const result = v.safeParse(SyncCategoryUpsertSchema, {
			id: 'c1',
			name: 'Investasi',
			kind: 'expense',
			color: 'x'.repeat(21)
		});
		expect(result.success).toBe(false);
	});
});

describe('SyncTransactionUpsertSchema', () => {
	it('accepts a valid transaction upsert', () => {
		const result = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			categoryId: 'c1',
			type: 'expense',
			amount: 45_000,
			note: 'Makan siang',
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output.amount).toBe(45_000);
			expect(result.output.categoryId).toBe('c1');
		}
	});

	it('accepts null/omitted categoryId and transferWalletId', () => {
		const result = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			categoryId: null,
			type: 'income',
			amount: 100_000,
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(result.success).toBe(true);
	});

	it('rejects an invalid type', () => {
		const result = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			type: 'refund',
			amount: 45_000,
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(result.success).toBe(false);
	});

	it('requires walletId and occurredAt', () => {
		const missingWallet = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: '',
			type: 'expense',
			amount: 45_000,
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(missingWallet.success).toBe(false);

		const missingDate = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			type: 'expense',
			amount: 45_000,
			occurredAt: ''
		});
		expect(missingDate.success).toBe(false);
	});

	it('rejects non-integer and negative amounts', () => {
		const float = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			type: 'expense',
			amount: 15_000.5,
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(float.success).toBe(false);

		const negative = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			type: 'expense',
			amount: -10_000,
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(negative.success).toBe(false);
	});

	it('rejects a note longer than 200 chars', () => {
		const result = v.safeParse(SyncTransactionUpsertSchema, {
			id: 'tx1',
			walletId: 'w1',
			type: 'expense',
			amount: 45_000,
			note: 'x'.repeat(201),
			occurredAt: '2026-11-12T10:00:00.000Z'
		});
		expect(result.success).toBe(false);
	});
});

describe('SyncDeletePayloadSchema', () => {
	it('accepts an empty payload, a plain id and a timestamp', () => {
		expect(v.safeParse(SyncDeletePayloadSchema, {}).success).toBe(true);
		expect(v.safeParse(SyncDeletePayloadSchema, { id: 'w1' }).success).toBe(true);
		expect(
			v.safeParse(SyncDeletePayloadSchema, {
				id: 'w1',
				deletedAt: '2026-11-12T10:00:00.000Z'
			}).success
		).toBe(true);
		expect(v.safeParse(SyncDeletePayloadSchema, { deletedAt: null }).success).toBe(true);
	});

	it('rejects an empty-string deletedAt', () => {
		const result = v.safeParse(SyncDeletePayloadSchema, { deletedAt: '' });
		expect(result.success).toBe(false);
	});
});

describe('SyncMutationEnvelopeSchema', () => {
	it('accepts a well-formed envelope', () => {
		const result = v.safeParse(SyncMutationEnvelopeSchema, {
			entityId: 'w1',
			table: 'wallets',
			op: 'UPSERT',
			hlc: '2026-11-12T10:00:00.000Z-0000-srv',
			payload: { id: 'w1' }
		});
		expect(result.success).toBe(true);
	});

	it('rejects unknown table, op and empty hlc', () => {
		const base = {
			entityId: 'w1',
			table: 'wallets',
			op: 'UPSERT',
			hlc: '2026-11-12T10:00:00.000Z-0000-srv'
		};
		expect(v.safeParse(SyncMutationEnvelopeSchema, { ...base, table: 'ledgers' }).success).toBe(
			false
		);
		expect(v.safeParse(SyncMutationEnvelopeSchema, { ...base, op: 'PATCH' }).success).toBe(false);
		expect(v.safeParse(SyncMutationEnvelopeSchema, { ...base, hlc: '' }).success).toBe(false);
	});
});

describe('parseSyncMutation', () => {
	const envelope = (table: string, op: string, entityId: string) => ({
		entityId,
		table,
		op,
		hlc: '2026-11-12T10:00:00.000Z-0000-srv'
	});

	it('parses a wallet upsert', () => {
		const parsed = parseSyncMutation({
			...envelope('wallets', 'UPSERT', 'w1'),
			payload: { id: 'w1', name: 'Tunai', type: 'cash', initialBalance: 0 }
		});
		expect(parsed).not.toBeNull();
		expect(parsed?.table).toBe('wallets');
		expect(parsed?.op).toBe('UPSERT');
		expect(parsed?.entityId).toBe('w1');
		expect(parsed?.payload.name).toBe('Tunai');
	});

	it('parses a category upsert', () => {
		const parsed = parseSyncMutation({
			...envelope('categories', 'UPSERT', 'c1'),
			payload: { id: 'c1', name: 'Investasi', kind: 'expense' }
		});
		expect(parsed?.table).toBe('categories');
		expect(parsed?.payload.kind).toBe('expense');
	});

	it('parses a transaction upsert', () => {
		const parsed = parseSyncMutation({
			...envelope('transactions', 'UPSERT', 'tx1'),
			payload: {
				id: 'tx1',
				walletId: 'w1',
				type: 'expense',
				amount: 45_000,
				occurredAt: '2026-11-12T10:00:00.000Z'
			}
		});
		expect(parsed?.table).toBe('transactions');
		expect(parsed?.payload.amount).toBe(45_000);
	});

	it('parses a delete with an empty payload object', () => {
		const parsed = parseSyncMutation({ ...envelope('wallets', 'DELETE', 'w1'), payload: {} });
		expect(parsed).not.toBeNull();
		expect(parsed?.op).toBe('DELETE');
		expect(parsed?.payload).toEqual({});
	});

	it('parses a delete tombstone payload', () => {
		const parsed = parseSyncMutation({
			...envelope('wallets', 'DELETE', 'w1'),
			payload: { id: 'w1', deletedAt: '2026-11-12T10:00:00.000Z' }
		});
		expect(parsed?.payload.deletedAt).toBe('2026-11-12T10:00:00.000Z');
	});

	it('rejects an envelope without the payload key', () => {
		expect(parseSyncMutation(envelope('wallets', 'DELETE', 'w1'))).toBeNull();
	});

	it('returns null for a malformed payload', () => {
		expect(
			parseSyncMutation({
				...envelope('transactions', 'UPSERT', 'tx1'),
				payload: { id: 'tx1', walletId: 'w1', type: 'expense', amount: 10.5, occurredAt: '' }
			})
		).toBeNull();
	});

	it('returns null when payload.id disagrees with entityId', () => {
		expect(
			parseSyncMutation({
				...envelope('wallets', 'UPSERT', 'w1'),
				payload: { id: 'w2', name: 'Tunai', type: 'cash', initialBalance: 0 }
			})
		).toBeNull();
	});

	it('returns null for a malformed envelope', () => {
		expect(parseSyncMutation({ entityId: 'w1', table: 'wallets', op: 'UPSERT', hlc: '' })).toBeNull();
		expect(parseSyncMutation('nope')).toBeNull();
	});
});
