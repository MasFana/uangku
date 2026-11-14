import { describe, it, expect } from 'vitest';
import type { SyncPushMutation } from '../../src/lib/shared/sync-contract';

export interface MockOutboxRecord extends SyncPushMutation {
	id: string;
	createdAt: string;
	retryCount: number;
}

/**
 * Pure memory implementation of squashing rules for unit testing without browser IDB.
 */
export function squashMutations(
	outbox: MockOutboxRecord[],
	mutation: SyncPushMutation,
	isNewLocalEntity: boolean = false
): MockOutboxRecord[] {
	const existing = outbox.filter((item) => item.entityId === mutation.entityId);
	let remaining = outbox.filter((item) => item.entityId !== mutation.entityId);

	if (mutation.op === 'DELETE') {
		if (isNewLocalEntity) {
			// Created offline and deleted offline -> purge completely
			return remaining;
		} else {
			// Existed on server -> convert to soft-delete
			remaining.push({
				...mutation,
				id: 'mock-id-' + Math.random(),
				createdAt: new Date().toISOString(),
				retryCount: 0
			});
			return remaining;
		}
	} else {
		// UPSERT: merge with latest existing if present
		const latestExisting = existing[existing.length - 1];
		const mergedPayload = latestExisting
			? {
					...(latestExisting.payload as Record<string, unknown>),
					...(mutation.payload as Record<string, unknown>)
				}
			: (mutation.payload as Record<string, unknown>);

		remaining.push({
			...mutation,
			id: 'mock-id-' + Math.random(),
			payload: mergedPayload,
			createdAt: new Date().toISOString(),
			retryCount: 0
		});
		return remaining;
	}
}

describe('Outbox Squashing Invariants', () => {
	it('merges multiple UPSERT mutations on same local entity into one', () => {
		let outbox: MockOutboxRecord[] = [];

		outbox = squashMutations(
			outbox,
			{
				entityId: 'e1',
				table: 'transactions',
				op: 'UPSERT',
				hlc: 'hlc-1',
				payload: { amount: 10000, note: 'Draft' }
			},
			true
		);

		outbox = squashMutations(
			outbox,
			{
				entityId: 'e1',
				table: 'transactions',
				op: 'UPSERT',
				hlc: 'hlc-2',
				payload: { note: 'Final' }
			},
			true
		);

		expect(outbox.length).toBe(1);
		expect(outbox[0].entityId).toBe('e1');
		expect(outbox[0].hlc).toBe('hlc-2');
		expect(outbox[0].payload).toEqual({ amount: 10000, note: 'Final' });
	});

	it('deletes offline-only local item if deleted before syncing (0 network ops)', () => {
		let outbox: MockOutboxRecord[] = [];

		outbox = squashMutations(
			outbox,
			{
				entityId: 'e2',
				table: 'transactions',
				op: 'UPSERT',
				hlc: 'hlc-1',
				payload: { amount: 50000 }
			},
			true
		);

		// Now user deletes it while still offline
		outbox = squashMutations(
			outbox,
			{
				entityId: 'e2',
				table: 'transactions',
				op: 'DELETE',
				hlc: 'hlc-2',
				payload: { id: 'e2' }
			},
			true
		);

		expect(outbox.length).toBe(0);
	});

	it('converts to soft-delete UPSERT if entity already exists on server', () => {
		let outbox: MockOutboxRecord[] = [];

		outbox = squashMutations(
			outbox,
			{
				entityId: 'server-tx-123',
				table: 'transactions',
				op: 'DELETE',
				hlc: 'hlc-del',
				payload: { id: 'server-tx-123', deletedAt: '2025-01-01' }
			},
			false // existed on server
		);

		expect(outbox.length).toBe(1);
		expect(outbox[0].op).toBe('DELETE');
		expect(outbox[0].entityId).toBe('server-tx-123');
	});
});
