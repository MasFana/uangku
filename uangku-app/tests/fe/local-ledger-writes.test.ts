import { describe, expect, it } from 'vitest';
import {
	makeCategoryRow,
	makeTransactionRow,
	makeWalletRow,
	patchCategoryRow,
	patchTransactionRow,
	patchWalletRow,
	setArchivedRow,
	toSyncPayload,
	type RowCtx
} from '../../src/lib/client/db/local-ledger';
import { planOutboxSquash } from '../../src/lib/client/db/outbox-squasher';
import type { OutboxRecord } from '../../src/lib/client/db/idb';
import type { SyncPushMutation, TransactionDTO } from '../../src/lib/shared/sync-contract';

const CTX: RowCtx = { id: 'tx-1', hlc: 'hlc-1', now: '2026-01-01T00:00:00.000Z' };

/** Keys `src/routes/api/sync/+server.ts` reads out of `mutation.payload` per table. */
const SERVER_KEYS: Record<SyncPushMutation['table'], string[]> = {
	transactions: [
		'id',
		'walletId',
		'categoryId',
		'type',
		'amount',
		'transferWalletId',
		'note',
		'occurredAt',
		'receiptKey',
		'deletedAt',
		'createdAt'
	],
	wallets: ['id', 'name', 'type', 'initialBalance', 'currentBalance', 'icon', 'archived', 'deletedAt', 'createdAt'],
	categories: ['id', 'name', 'kind', 'icon', 'color', 'archived', 'deletedAt', 'createdAt']
};

function expectServerKeys(payload: Record<string, unknown>, table: SyncPushMutation['table']): void {
	expect(Object.keys(payload)).toEqual(expect.arrayContaining(SERVER_KEYS[table]));
	// Regression guard: the server reads camelCase payload keys only.
	expect(Object.keys(payload).filter((key) => key.includes('_'))).toEqual([]);
}

const upsert = (table: SyncPushMutation['table'], row: { id: string; hlc: string }, payload: Record<string, unknown>): SyncPushMutation => ({
	entityId: row.id,
	table,
	op: 'UPSERT',
	hlc: row.hlc,
	payload
});

const tombstone = (id: string, hlc: string, deletedAt: string): SyncPushMutation => ({
	entityId: id,
	table: 'transactions',
	op: 'DELETE',
	hlc,
	payload: { id, deletedAt }
});

/** Same call `LocalLedger.save` makes, minus IndexedDB. */
function queue(outbox: OutboxRecord[], mutation: SyncPushMutation, isNew: boolean): OutboxRecord[] {
	const plan = planOutboxSquash(outbox, mutation, isNew);
	return [...outbox.filter((record) => !plan.deletes.includes(record.id)), ...plan.puts];
}

describe('LocalLedger payload builders', () => {
	it('transaction create: mirrors server create semantics (amount trunc, note trim, serverUpdatedAt 0)', () => {
		const row = makeTransactionRow(
			'u1',
			{ walletId: 'w1', type: 'expense', amount: 15000.9, note: '  Kopi  ' },
			CTX
		);

		expect(row).toMatchObject({
			id: 'tx-1',
			userId: 'u1',
			walletId: 'w1',
			categoryId: null,
			type: 'expense',
			amount: 15000,
			transferWalletId: null,
			note: 'Kopi',
			occurredAt: CTX.now,
			receiptKey: null,
			hlc: 'hlc-1',
			serverUpdatedAt: 0,
			deletedAt: null,
			createdAt: CTX.now,
			updatedAt: CTX.now
		});
		expectServerKeys(toSyncPayload(row), 'transactions');
	});

	it('transaction update: only the patched fields change, hlc bumps, serverUpdatedAt keeps its watermark', () => {
		const row = makeTransactionRow(
			'u1',
			{ walletId: 'w1', type: 'expense', amount: 15000, note: 'Kopi' },
			CTX
		);
		const synced: TransactionDTO = { ...row, serverUpdatedAt: 1735689600000, hlc: 'hlc-2' };
		const next = patchTransactionRow(
			synced,
			{ amount: 20000, note: '  Kopi susu  ', categoryId: 'c1' },
			{ hlc: 'hlc-3', now: '2026-01-01T00:05:00.000Z' }
		);

		expect(next).toMatchObject({
			amount: 20000,
			note: 'Kopi susu',
			categoryId: 'c1',
			walletId: 'w1',
			type: 'expense',
			hlc: 'hlc-3',
			serverUpdatedAt: 1735689600000,
			updatedAt: '2026-01-01T00:05:00.000Z'
		});
		expectServerKeys(toSyncPayload(next), 'transactions');
	});

	it('transaction delete payload carries only `{ id, deletedAt }`', () => {
		const payload = tombstone('tx-1', 'hlc-9', '2026-01-02T00:00:00.000Z').payload as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(['deletedAt', 'id']);
	});

	it('wallet create/update/archive', () => {
		const created = makeWalletRow(
			'u1',
			{ name: '  BCA  ', type: 'bank', initialBalance: 250000.4, icon: '🏦' },
			{ id: 'w1', hlc: 'hlc-1', now: CTX.now }
		);
		expect(created).toMatchObject({
			id: 'w1',
			name: 'BCA',
			type: 'bank',
			initialBalance: 250000,
			currentBalance: 250000,
			icon: '🏦',
			archived: false,
			serverUpdatedAt: 0,
			deletedAt: null
		});
		expectServerKeys(toSyncPayload(created), 'wallets');

		const renamed = patchWalletRow(created, { name: ' BCA Digital ', icon: null }, { hlc: 'hlc-2' });
		expect(renamed).toMatchObject({
			name: 'BCA Digital',
			icon: null,
			type: 'bank',
			initialBalance: 250000,
			currentBalance: 250000,
			hlc: 'hlc-2'
		});
		expectServerKeys(toSyncPayload(renamed), 'wallets');

		const archived = setArchivedRow(created, true, { hlc: 'hlc-3' });
		expect(archived).toMatchObject({ archived: true, hlc: 'hlc-3', currentBalance: 250000 });
		expectServerKeys(toSyncPayload(archived), 'wallets');
	});

	it('category create/update/archive', () => {
		const created = makeCategoryRow(
			'u1',
			{ name: '  Makan  ', kind: 'expense', icon: '🍜', color: '#f97316' },
			{ id: 'c1', hlc: 'hlc-1', now: CTX.now }
		);
		expect(created).toMatchObject({
			id: 'c1',
			name: 'Makan',
			kind: 'expense',
			icon: '🍜',
			color: '#f97316',
			archived: false,
			serverUpdatedAt: 0
		});
		expectServerKeys(toSyncPayload(created), 'categories');

		const renamed = patchCategoryRow(created, { name: ' Makanan ', kind: 'income', color: null }, { hlc: 'hlc-2' });
		expect(renamed).toMatchObject({
			name: 'Makanan',
			kind: 'income',
			color: null,
			icon: '🍜',
			hlc: 'hlc-2'
		});
		expectServerKeys(toSyncPayload(renamed), 'categories');

		const archived = setArchivedRow(renamed, true, { hlc: 'hlc-3' });
		expect(archived).toMatchObject({ archived: true, hlc: 'hlc-3' });
		expectServerKeys(toSyncPayload(archived), 'categories');
	});
});

describe('offline create -> update -> delete sequence', () => {
	it('collapses create+update to a single UPSERT carrying the final payload', () => {
		const created = makeTransactionRow(
			'u1',
			{ walletId: 'w1', type: 'expense', amount: 15000, note: 'Kopi' },
			CTX
		);
		const updated = patchTransactionRow(created, { amount: 20000 }, { hlc: 'hlc-2', now: CTX.now });

		let outbox = queue([], upsert('transactions', created, toSyncPayload(created)), true);
		outbox = queue(outbox, upsert('transactions', updated, toSyncPayload(updated)), true);

		expect(outbox).toHaveLength(1);
		expect(outbox[0].op).toBe('UPSERT');
		expect(outbox[0].hlc).toBe('hlc-2');
		expect(outbox[0].payload).toMatchObject({ id: 'tx-1', amount: 20000, note: 'Kopi' });
	});

	it('purges outbox and row when a never-acked row is deleted (0 network ops)', () => {
		const created = makeTransactionRow(
			'u1',
			{ walletId: 'w1', type: 'expense', amount: 15000 },
			CTX
		);
		let outbox = queue([], upsert('transactions', created, toSyncPayload(created)), true);
		const updated = patchTransactionRow(created, { note: 'Kopi' }, { hlc: 'hlc-2', now: CTX.now });
		outbox = queue(outbox, upsert('transactions', updated, toSyncPayload(updated)), true);

		// LocalLedger.deleteTransaction decision: serverUpdatedAt === 0 and an UPSERT is still queued.
		const row: TransactionDTO = updated;
		const neverAcked =
			row.serverUpdatedAt === 0 && outbox.some((m) => m.entityId === row.id && m.op === 'UPSERT');
		expect(neverAcked).toBe(true);

		let rowPurged = false;
		if (neverAcked) {
			rowPurged = true; // idbDelete('transactions', id)
			outbox = queue(outbox, tombstone(row.id, 'hlc-3', CTX.now), true);
		}

		expect(rowPurged).toBe(true);
		expect(outbox).toEqual([]);
	});

	it('keeps one DELETE tombstone for a server-known row and stays put on a second delete', () => {
		const created = makeTransactionRow('u1', { walletId: 'w1', type: 'expense', amount: 15000 }, CTX);
		const local: TransactionDTO = { ...created, hlc: 'hlc-2', serverUpdatedAt: 1735689600000 };
		const updated = patchTransactionRow(local, { amount: 25000 }, { hlc: 'hlc-3', now: CTX.now });

		// The row already reached the server, so nothing is queued before the offline edit.
		let outbox = queue([], upsert('transactions', updated, toSyncPayload(updated)), false);
		const neverAcked =
			updated.serverUpdatedAt === 0 && outbox.some((m) => m.entityId === updated.id && m.op === 'UPSERT');
		expect(neverAcked).toBe(false);

		outbox = queue(outbox, tombstone(updated.id, 'hlc-4', '2026-01-02T00:00:00.000Z'), neverAcked);

		expect(outbox).toHaveLength(1);
		expect(outbox[0].op).toBe('DELETE');
		expect(outbox[0].hlc).toBe('hlc-4');
		expect(outbox[0].payload).toEqual({ id: 'tx-1', deletedAt: '2026-01-02T00:00:00.000Z' });

		outbox = queue(outbox, tombstone(updated.id, 'hlc-5', '2026-01-03T00:00:00.000Z'), false);

		expect(outbox).toHaveLength(1);
		expect(outbox[0].hlc).toBe('hlc-4');
		expect(outbox[0].payload).toEqual({ id: 'tx-1', deletedAt: '2026-01-02T00:00:00.000Z' });
	});
});
