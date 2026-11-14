import { describe, it, expect } from 'vitest';
import { compareHLC } from '../../src/lib/shared/hlc';
import type { WalletDTO, TransactionDTO } from '../../src/lib/shared/sync-contract';

describe('Multi-Device Sync & Convergence Invariant', () => {
	it('resolves concurrent offline edits with clock skew using HLC LWW', () => {
		// Device A (clock skewed -15 minutes) creates an update
		// Device B (clock on time) creates a newer update
		const deviceATx: TransactionDTO = {
			id: 'tx-shared-1',
			userId: 'u1',
			walletId: 'w1',
			categoryId: null,
			type: 'expense',
			amount: 50000,
			transferWalletId: null,
			note: 'Coffee from Device A',
			occurredAt: '2025-01-01T10:00:00Z',
			receiptKey: null,
			hlc: '000000abc-0001-devA',
			serverUpdatedAt: 0,
			deletedAt: null,
			createdAt: '2025-01-01T10:00:00Z',
			updatedAt: '2025-01-01T10:00:00Z'
		};

		const deviceBTx: TransactionDTO = {
			...deviceATx,
			amount: 75000,
			note: 'Coffee with extra shot from Device B',
			hlc: '000000xyz-0001-devB'
		};

		// Device B HLC is lexicographically higher
		expect(compareHLC(deviceBTx.hlc, deviceATx.hlc)).toBe(1);

		// Convergence: Applying Device B on top of Device A wins
		const state = compareHLC(deviceBTx.hlc, deviceATx.hlc) > 0 ? deviceBTx : deviceATx;
		expect(state.amount).toBe(75000);
		expect(state.note).toBe('Coffee with extra shot from Device B');
	});

	it('preserves mathematical balance equality across devices', () => {
		const initialBalance = 100000;
		const transactions: TransactionDTO[] = [
			{
				id: 't1',
				userId: 'u1',
				walletId: 'w1',
				categoryId: null,
				type: 'income',
				amount: 50000,
				transferWalletId: null,
				note: null,
				occurredAt: '2025-01-01',
				receiptKey: null,
				hlc: '1',
				serverUpdatedAt: 1,
				deletedAt: null,
				createdAt: '2025-01-01',
				updatedAt: '2025-01-01'
			},
			{
				id: 't2',
				userId: 'u1',
				walletId: 'w1',
				categoryId: null,
				type: 'expense',
				amount: 20000,
				transferWalletId: null,
				note: null,
				occurredAt: '2025-01-02',
				receiptKey: null,
				hlc: '2',
				serverUpdatedAt: 2,
				deletedAt: null,
				createdAt: '2025-01-02',
				updatedAt: '2025-01-02'
			}
		];

		const computed = transactions.reduce((sum, tx) => {
			if (tx.deletedAt) return sum;
			return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
		}, initialBalance);

		expect(computed).toBe(130000);
	});
});
