import { describe, expect, it } from 'vitest';
import {
	mergeDelta,
	parseForceServerIds,
	planForceServerIds,
	rejectionNotice,
	type LocalState
} from '../../src/lib/client/sync/merge';
import type {
	CategoryDTO,
	SyncRejectedMutation,
	TransactionDTO,
	WalletDTO
} from '../../src/lib/shared/sync-contract';

// Two HLCs that differ only by timestamp: A is skewed behind, B is on time.
const HLC_A = '0000000a0-0000-devA';
const HLC_B = '0000000f0-0000-devB';

function wallet(id: string, hlc: string, patch: Partial<WalletDTO> = {}): WalletDTO {
	return {
		id,
		userId: 'u1',
		hlc,
		serverUpdatedAt: 0,
		deletedAt: null,
		createdAt: '2025-01-01T00:00:00.000Z',
		name: id,
		type: 'cash',
		initialBalance: 0,
		currentBalance: 0,
		icon: null,
		archived: false,
		...patch
	};
}

function category(id: string, hlc: string, patch: Partial<CategoryDTO> = {}): CategoryDTO {
	return {
		id,
		userId: 'u1',
		hlc,
		serverUpdatedAt: 0,
		deletedAt: null,
		createdAt: '2025-01-01T00:00:00.000Z',
		name: id,
		kind: 'expense',
		icon: null,
		color: null,
		archived: false,
		...patch
	};
}

function tx(id: string, hlc: string, patch: Partial<TransactionDTO> = {}): TransactionDTO {
	return {
		id,
		userId: 'u1',
		hlc,
		serverUpdatedAt: 0,
		deletedAt: null,
		createdAt: '2025-01-01T00:00:00.000Z',
		walletId: 'w1',
		categoryId: null,
		type: 'expense',
		amount: 10000,
		transferWalletId: null,
		note: null,
		occurredAt: '2025-01-01T00:00:00.000Z',
		receiptKey: null,
		updatedAt: '2025-01-01T00:00:00.000Z',
		...patch
	};
}

function localState(partial: Partial<LocalState> = {}): LocalState {
	return { wallets: [], categories: [], transactions: [], ...partial };
}

/** The active set the reactive arrays expose: stored rows minus tombstones. */
function active<T extends { deletedAt: string | null }>(rows: T[]): T[] {
	return rows.filter((row) => !row.deletedAt);
}

describe('mergeDelta — HLC last-write-wins', () => {
	it('never clobbers a newer local optimistic write with an older server row (clock skew)', () => {
		// Device A (clock 15 min behind) edits offline, so its HLC sorts lower even
		// though the server delivered it after device B's local write.
		const local = localState({ transactions: [tx('t1', HLC_B, { amount: 75000 })] });
		const skewedServerRow = tx('t1', HLC_A, { amount: 50000 });

		const { merged, changedIds } = mergeDelta(local, localState({ transactions: [skewedServerRow] }));

		expect(merged.transactions).toEqual([tx('t1', HLC_B, { amount: 75000 })]);
		expect(changedIds).toEqual([]);
	});

	it('applies a newer server row over an older local row', () => {
		const local = localState({ transactions: [tx('t1', HLC_A, { amount: 50000 })] });
		const serverRow = tx('t1', HLC_B, { amount: 99000 });

		const { merged, changedIds } = mergeDelta(local, localState({ transactions: [serverRow] }));

		expect(merged.transactions).toEqual([serverRow]);
		expect(changedIds).toEqual([{ table: 'transactions', id: 't1' }]);
	});

	it('treats an equal HLC as a no-op', () => {
		const local = localState({ wallets: [wallet('w1', HLC_B, { name: 'Tunai' })] });
		// Same clock value (already-synced row echoed back) but different body:
		// equality means the stored row stays, so the result is deterministic.
		const echo = wallet('w1', HLC_B, { name: 'DIFFERENT' });

		const { merged, changedIds } = mergeDelta(local, localState({ wallets: [echo] }));

		expect(merged.wallets).toEqual([wallet('w1', HLC_B, { name: 'Tunai' })]);
		expect(changedIds).toEqual([]);
	});

	it('adopts the server ack stamp when the delta echoes an equal HLC', () => {
		// Locally created wallet: HLC already known to the server, but no ack stamp yet.
		const local = localState({
			wallets: [wallet('w1', HLC_B, { name: 'Tunai', currentBalance: 500000 })]
		});
		const ack = wallet('w1', HLC_B, { name: 'IGNORED', serverUpdatedAt: 1795000000000 });

		const { merged, changedIds } = mergeDelta(local, localState({ wallets: [ack] }));

		expect(merged.wallets[0].serverUpdatedAt).toBe(1795000000000);
		// Content still comes from the local row (equal HLC is not a content win)...
		expect(merged.wallets[0].name).toBe('Tunai');
		expect(merged.wallets[0].currentBalance).toBe(500000);
		// ...but the stamp must be persisted, so the row is reported as changed.
		expect(changedIds).toEqual([{ table: 'wallets', id: 'w1' }]);
	});

	it('leaves a locally-created row pending when the delta row is older', () => {
		const local = localState({ wallets: [wallet('w1', HLC_B, { name: 'Tunai' })] });
		const stale = wallet('w1', HLC_A, { name: 'STALE', serverUpdatedAt: 1795000000000 });

		const { merged, changedIds } = mergeDelta(local, localState({ wallets: [stale] }));

		expect(merged.wallets[0].serverUpdatedAt).toBe(0);
		expect(merged.wallets[0].name).toBe('Tunai');
		expect(changedIds).toEqual([]);
	});

	it('leaves ids absent from the delta untouched and aliases untouched tables', () => {
		const kept = tx('t-keep', HLC_A);
		const local = localState({ transactions: [kept], categories: [category('c1', HLC_A)] });

		const { merged, changedIds } = mergeDelta(
			local,
			localState({ transactions: [tx('t-other', HLC_B)] })
		);

		expect(merged.categories).toBe(local.categories);
		expect(merged.transactions).toContain(kept);
		expect(merged.transactions).toHaveLength(2);
		expect(changedIds).toEqual([{ table: 'transactions', id: 't-other' }]);
	});

	it('treats an empty delta as a total no-op', () => {
		const local = localState({
			wallets: [wallet('w1', HLC_A)],
			categories: [category('c1', HLC_A)],
			transactions: [tx('t1', HLC_A)]
		});

		const { merged, changedIds } = mergeDelta(local, localState());

		expect(merged.wallets).toBe(local.wallets);
		expect(merged.categories).toBe(local.categories);
		expect(merged.transactions).toBe(local.transactions);
		expect(changedIds).toEqual([]);
	});

	it('does not mutate the inputs', () => {
		const localTx = tx('t1', HLC_A);
		const local = localState({ transactions: [localTx] });
		const incoming = tx('t1', HLC_B, { amount: 4242 });

		mergeDelta(local, localState({ transactions: [incoming] }));

		expect(local.transactions).toEqual([tx('t1', HLC_A)]);
		expect(incoming.amount).toBe(4242);
	});
});
