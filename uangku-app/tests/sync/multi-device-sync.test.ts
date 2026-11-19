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

describe('mergeDelta — tombstones', () => {
	it('drops the row from the active set when another device tombstones it newer', () => {
		const local = localState({ wallets: [wallet('w1', HLC_A)] });
		const tombstone = wallet('w1', HLC_B, { deletedAt: '2025-02-01T00:00:00.000Z' });

		const { merged, changedIds } = mergeDelta(local, localState({ wallets: [tombstone] }));

		// Tombstone is stored like any other row; the active set is the filtered view.
		expect(merged.wallets).toEqual([tombstone]);
		expect(merged.wallets[0].deletedAt).not.toBeNull();
		expect(active(merged.wallets)).toEqual([]);
		expect(changedIds).toEqual([{ table: 'wallets', id: 'w1' }]);
	});

	it('keeps a locally deleted row when the incoming live row is older', () => {
		const local = localState({
			transactions: [tx('t1', HLC_B, { deletedAt: '2025-02-01T00:00:00.000Z' })]
		});
		const staleLiveRow = tx('t1', HLC_A, { amount: 777 });

		const { merged, changedIds } = mergeDelta(local, localState({ transactions: [staleLiveRow] }));

		expect(merged.transactions[0].deletedAt).not.toBeNull();
		expect(active(merged.transactions)).toEqual([]);
		expect(changedIds).toEqual([]);
	});
});

describe('mergeDelta — inserts and changedIds', () => {
	it('inserts unknown ids from every table', () => {
		const local = localState();
		const incoming = localState({
			wallets: [wallet('w-new', HLC_A)],
			categories: [category('c-new', HLC_B)],
			transactions: [tx('t-new', HLC_A)]
		});

		const { merged, changedIds } = mergeDelta(local, incoming);

		expect(merged.wallets).toEqual(incoming.wallets);
		expect(merged.categories).toEqual(incoming.categories);
		expect(merged.transactions).toEqual(incoming.transactions);
		expect(changedIds).toEqual([
			{ table: 'wallets', id: 'w-new' },
			{ table: 'categories', id: 'c-new' },
			{ table: 'transactions', id: 't-new' }
		]);
	});

	it('reports exactly the overwritten and inserted rows, tagged by table', () => {
		const local = localState({
			wallets: [wallet('w-win', HLC_A), wallet('w-lose', HLC_B)],
			transactions: [tx('t-win', HLC_A), tx('t-lose', HLC_B)]
		});

		const { changedIds } = mergeDelta(
			local,
			localState({
				wallets: [
					wallet('w-win', HLC_B, { name: 'updated' }),
					wallet('w-lose', HLC_A, { name: 'stale' })
				],
				transactions: [
					tx('t-insert', HLC_A),
					tx('t-win', HLC_B, { amount: 123 }),
					tx('t-lose', HLC_A, { amount: 456 })
				]
			})
		);

		expect(changedIds).toEqual([
			{ table: 'wallets', id: 'w-win' },
			{ table: 'transactions', id: 't-insert' },
			{ table: 'transactions', id: 't-win' }
		]);
	});
});

describe('mergeDelta — forced adoption of the server version', () => {
	it('overrides a newer local HLC: the rejected push must lose to the server row', () => {
		// The rejected push carries the newer HLC (that is why the server refused it
		// as stale), so plain LWW would keep the pushed content forever.
		const local = localState({
			wallets: [wallet('w1', HLC_B, { name: 'PUSHED', currentBalance: 999 })]
		});
		const serverRow = wallet('w1', HLC_A, {
			name: 'Server',
			currentBalance: 100,
			serverUpdatedAt: 1795000000000
		});

		const { merged, changedIds, adoptedForceIds } = mergeDelta(
			local,
			localState({ wallets: [serverRow] }),
			new Set(['w1'])
		);

		expect(merged.wallets).toEqual([serverRow]);
		// Metadata too, not just the content columns.
		expect(merged.wallets[0].serverUpdatedAt).toBe(1795000000000);
		// Reported changed so the caller persists the adopted row.
		expect(changedIds).toEqual([{ table: 'wallets', id: 'w1' }]);
		expect(adoptedForceIds).toEqual(['w1']);
	});

	it('adopts the server tombstone when the server row itself is deleted', () => {
		const local = localState({ transactions: [tx('t1', HLC_B, { amount: 75000 })] });
		const serverTombstone = tx('t1', HLC_A, {
			deletedAt: '2025-02-01T00:00:00.000Z',
			serverUpdatedAt: 1795000000000
		});

		const { merged, adoptedForceIds } = mergeDelta(
			local,
			localState({ transactions: [serverTombstone] }),
			new Set(['t1'])
		);

		expect(merged.transactions).toEqual([serverTombstone]);
		expect(active(merged.transactions)).toEqual([]);
		expect(adoptedForceIds).toEqual(['t1']);
	});

	it('replaces content even when the HLC is equal (plain merge keeps local content)', () => {
		const local = localState({ wallets: [wallet('w1', HLC_B, { name: 'PUSHED' })] });
		const serverRow = wallet('w1', HLC_B, { name: 'Server' });

		const { merged, adoptedForceIds } = mergeDelta(
			local,
			localState({ wallets: [serverRow] }),
			new Set(['w1'])
		);

		expect(merged.wallets[0].name).toBe('Server');
		expect(adoptedForceIds).toEqual(['w1']);
	});

	it('leaves unforced ids in the same delta on the LWW path', () => {
		const local = localState({
			wallets: [wallet('w-forced', HLC_B, { name: 'PUSHED' }), wallet('w-plain', HLC_B, { name: 'Lokal' })]
		});

		const { merged, changedIds, adoptedForceIds } = mergeDelta(
			local,
			localState({
				wallets: [
					wallet('w-forced', HLC_A, { name: 'Server' }),
					wallet('w-plain', HLC_A, { name: 'Stale' })
				]
			}),
			new Set(['w-forced'])
		);

		expect(merged.wallets.map((w) => w.name)).toEqual(['Server', 'Lokal']);
		expect(changedIds).toEqual([{ table: 'wallets', id: 'w-forced' }]);
		expect(adoptedForceIds).toEqual(['w-forced']);
	});

	it('reports no adoption for a forced id absent from the delta', () => {
		// Nothing to adopt this cycle: the id must stay in the persisted set (the
		// caller then forces a full re-pull) rather than be silently dropped.
		const { adoptedForceIds, changedIds } = mergeDelta(
			localState({ wallets: [wallet('w1', HLC_B)] }),
			localState({ wallets: [wallet('w2', HLC_A)] }),
			new Set(['w-missing'])
		);

		expect(adoptedForceIds).toEqual([]);
		expect(changedIds).toEqual([{ table: 'wallets', id: 'w2' }]);
	});

	it('is inert without a force set', () => {
		const local = localState({ wallets: [wallet('w1', HLC_B, { name: 'Lokal' })] });

		const { merged, adoptedForceIds } = mergeDelta(
			local,
			localState({ wallets: [wallet('w1', HLC_A, { name: 'Stale' })] })
		);

		expect(merged.wallets[0].name).toBe('Lokal');
		expect(adoptedForceIds).toEqual([]);
	});
});

describe('force server id set plan', () => {
	const CURSOR = 1_700_000_000_000;

	it('drops the id once its server row was adopted', () => {
		expect(planForceServerIds(['w1'], ['w1'], [], CURSOR)).toEqual({
			persist: [],
			resetCursor: false
		});
	});

	it('lets adoption beat a re-rejection of the same id in the same cycle', () => {
		// `stale`: the rejection is what bumped the server row this delta delivered.
		expect(planForceServerIds(['w1'], ['w1'], ['w1'], CURSOR)).toEqual({
			persist: [],
			resetCursor: false
		});
	});

	it('persists unresolved ids (union with this cycle rejections) and holds the cursor back', () => {
		expect(planForceServerIds(['w-old'], [], ['w-new'], CURSOR)).toEqual({
			persist: ['w-old', 'w-new'],
			resetCursor: true
		});
	});

	it('keeps ids across a cycle that aborts before committing', () => {
		// A cycle that throws never opens the commit transaction, so the JSON the
		// previous cycle wrote is exactly what the next cycle reads back.
		const persisted = JSON.stringify(planForceServerIds(['w1'], [], ['w2'], CURSOR).persist);

		expect(persisted).toBe('["w1","w2"]');
		expect(parseForceServerIds(persisted)).toEqual(['w1', 'w2']);
		expect(planForceServerIds(parseForceServerIds(persisted), [], [], CURSOR)).toEqual({
			persist: ['w1', 'w2'],
			resetCursor: true
		});
	});

	it('drops ids the server provably has no row for after a full pull', () => {
		// Cursor 0 means the delta was already complete: holding them again would
		// reset the cursor on every cycle forever.
		expect(planForceServerIds(['w1'], [], [], 0)).toEqual({
			persist: [],
			resetCursor: false
		});
	});

	it('ignores unusable rejections and garbage persisted values', () => {
		// An invalid envelope can carry entityId '' — nothing to adopt.
		expect(planForceServerIds([], [], [''], CURSOR)).toEqual({
			persist: [],
			resetCursor: false
		});
		expect(parseForceServerIds(undefined)).toEqual([]);
		expect(parseForceServerIds('not json')).toEqual([]);
		expect(parseForceServerIds('{"w1":1}')).toEqual([]);
		expect(parseForceServerIds('["w1",42,"",null]')).toEqual(['w1']);
	});
});

describe('conflictNotice text', () => {
	const rejected = (entityId: string, reason: SyncRejectedMutation['reason']) => ({
		entityId,
		reason
	});

	it('announces the rejected count, and is null when the pull carried neither list', () => {
		// The engine assigns this after every cycle that committed a response:
		// `conflictNotice = rejectionNotice([...data.rejected, ...data.canonicalized])` — so a
		// pull with neither list (or a failed cycle, which never reaches that line) is what a
		// null here means: notice set on rejection, cleared by the next clean pull.
		expect(rejectionNotice([])).toBeNull();
		expect(rejectionNotice([rejected('w1', 'stale')])).toBe(
			'1 perubahan ditolak server; versi server dipakai'
		);
		expect(rejectionNotice([rejected('w1', 'stale'), rejected('w2', 'forbidden')])).toBe(
			'2 perubahan ditolak server; versi server dipakai'
		);
	});

	it('uses the clock wording when any entry was clamped', () => {
		expect(rejectionNotice([rejected('w1', 'stale'), rejected('w2', 'clock_skew')])).toBe(
			'2 perubahan disesuaikan ke jam server (jam perangkat Anda berbeda)'
		);
	});
});
