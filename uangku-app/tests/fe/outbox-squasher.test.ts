import { describe, expect, it } from 'vitest';
import { planOutboxSquash } from '../../src/lib/client/db/outbox-squasher';
import type { OutboxRecord } from '../../src/lib/client/db/idb';
import type { SyncPushMutation } from '../../src/lib/shared/sync-contract';

function rec(
	mutation: SyncPushMutation,
	createdAt: string,
	id = `${mutation.entityId}:${createdAt}`
): OutboxRecord {
	return { ...mutation, id, createdAt, retryCount: 0 };
}

function upsert(
	entityId: string,
	payload: Record<string, unknown>,
	hlc: string
): SyncPushMutation {
	return { entityId, table: 'transactions', op: 'UPSERT', hlc, payload };
}

function del(entityId: string, deletedAt: string, hlc: string): SyncPushMutation {
	return { entityId, table: 'transactions', op: 'DELETE', hlc, payload: { id: entityId, deletedAt } };
}

describe('planOutboxSquash', () => {
	it('queues a lone mutation untouched when nothing is queued for the entity', () => {
		const plan = planOutboxSquash([], upsert('e1', { amount: 5000 }, 'hlc-1'));

		expect(plan.deletes).toEqual([]);
		expect(plan.puts).toHaveLength(1);
		expect(plan.puts[0].op).toBe('UPSERT');
		expect(plan.puts[0].entityId).toBe('e1');
		expect(plan.puts[0].hlc).toBe('hlc-1');
		expect(plan.puts[0].payload).toEqual({ amount: 5000 });
		expect(plan.puts[0].retryCount).toBe(0);
	});

	it('rule 1: UPSERT + UPSERT collapses to one UPSERT with merged payload (newest wins)', () => {
		const queued = rec(upsert('e1', { id: 'e1', amount: 10000, note: 'Draft' }, 'hlc-1'), 't1');
		const plan = planOutboxSquash([queued], upsert('e1', { id: 'e1', note: 'Final' }, 'hlc-2'));

		expect(plan.deletes).toEqual([queued.id]);
		expect(plan.puts).toHaveLength(1);
		expect(plan.puts[0].hlc).toBe('hlc-2');
		expect(plan.puts[0].payload).toEqual({ id: 'e1', amount: 10000, note: 'Final' });
	});

	it('rule 2: UPSERT + DELETE of a never-acked entity purges the outbox (0 network ops)', () => {
		const queued = rec(upsert('e1', { id: 'e1' }, 'hlc-1'), 't1');
		const plan = planOutboxSquash([queued], del('e1', '2026-01-01T00:00:00.000Z', 'hlc-2'), true);

		expect(plan.deletes).toEqual([queued.id]);
		expect(plan.puts).toEqual([]);
	});

	it('rule 3: DELETE of a server-known entity replaces the upsert with `{ id, deletedAt }`', () => {
		const queued = rec(upsert('e1', { id: 'e1', note: 'x' }, 'hlc-1'), 't1');
		const plan = planOutboxSquash([queued], del('e1', '2026-01-01T00:00:00.000Z', 'hlc-2'), false);

		expect(plan.deletes).toEqual([queued.id]);
		expect(plan.puts).toHaveLength(1);
		expect(plan.puts[0].op).toBe('DELETE');
		expect(plan.puts[0].payload).toEqual({ id: 'e1', deletedAt: '2026-01-01T00:00:00.000Z' });
	});

	it('rule 3: collapses several queued upserts into a single tombstone', () => {
		const first = rec(upsert('e1', { amount: 1 }, 'hlc-1'), 't1');
		const second = rec(upsert('e1', { amount: 2 }, 'hlc-2'), 't2');
		const plan = planOutboxSquash(
			[first, second],
			del('e1', '2026-01-01T00:00:00.000Z', 'hlc-3'),
			false
		);

		expect(plan.deletes).toEqual([first.id, second.id]);
		expect(plan.puts).toHaveLength(1);
		expect(plan.puts[0].op).toBe('DELETE');
	});

	it('rule 4: DELETE + UPSERT converges to one UPSERT without leaking the tombstone', () => {
		const queued = rec(del('e1', '2026-01-01T00:00:00.000Z', 'hlc-1'), 't1');
		const plan = planOutboxSquash(
			[queued],
			upsert('e1', { id: 'e1', amount: 5000, deletedAt: null }, 'hlc-2'),
			false
		);

		expect(plan.deletes).toEqual([queued.id]);
		expect(plan.puts).toHaveLength(1);
		expect(plan.puts[0].op).toBe('UPSERT');
		expect(plan.puts[0].payload).toEqual({ id: 'e1', amount: 5000, deletedAt: null });
	});

	it('rule 5: delete twice is a no-op (queued tombstone kept as-is)', () => {
		const queued = rec(del('e1', '2026-01-01T00:00:00.000Z', 'hlc-1'), 't1');
		const plan = planOutboxSquash(
			[queued],
			del('e1', '2026-01-02T00:00:00.000Z', 'hlc-2'),
			false
		);

		expect(plan.deletes).toEqual([]);
		expect(plan.puts).toEqual([]);
	});

	it('queues a tombstone when deleting an entity unknown to the outbox', () => {
		const plan = planOutboxSquash([], del('server-row', '2026-01-01T00:00:00.000Z', 'hlc-1'), false);

		expect(plan.deletes).toEqual([]);
		expect(plan.puts).toHaveLength(1);
		expect(plan.puts[0].op).toBe('DELETE');
		expect(plan.puts[0].entityId).toBe('server-row');
	});

	it('only rewrites records belonging to the mutated entity (caller scopes by the `by_entity` index)', () => {
		const obsolete = rec(upsert('e1', { amount: 1 }, 'hlc-1'), 't1');
		const plan = planOutboxSquash([obsolete], upsert('e1', { amount: 2 }, 'hlc-2'));

		expect(plan.deletes).toEqual([obsolete.id]);
		expect(plan.puts.map((r) => r.entityId)).toEqual(['e1']);
	});
});
