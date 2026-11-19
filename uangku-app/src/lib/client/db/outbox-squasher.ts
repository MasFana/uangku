import type { SyncPushMutation } from '$lib/shared/sync-contract';
import type { OutboxRecord } from './idb';
import { generateULID } from '$lib/shared/ulid';

/**
 * Squashing rules per entity, fewest network ops wins:
 * 1. UPSERT + UPSERT -> one UPSERT, payloads merged (newest wins).
 * 2. UPSERT + DELETE of an entity the server never acked -> purge; nothing queued, nothing sent.
 * 3. UPSERT (server knows the row) + DELETE -> one DELETE carrying `{ id, deletedAt }`.
 * 4. DELETE + UPSERT -> one UPSERT (resurrection drops the tombstone payload).
 * 5. DELETE + DELETE -> no-op.
 */
export interface SquashPlan {
	/** Outbox record ids to remove. */
	deletes: string[];
	/** Outbox records to write. */
	puts: OutboxRecord[];
}

/** Pure decision core of `enqueueMutationWithSquashing`, so the rules are testable without IndexedDB. */
export function planOutboxSquash(
	existing: OutboxRecord[],
	mutation: SyncPushMutation,
	isNewLocalEntity = false
): SquashPlan {
	const ordered = [...existing].sort((a, b) =>
		a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1
	);
	const deletes = ordered.map((r) => r.id);

	if (mutation.op === 'DELETE') {
		// Rule 2: created offline, deleted offline, server never saw it.
		if (isNewLocalEntity) return { deletes, puts: [] };
		// Rule 5: delete twice, the queued tombstone already says it.
		if (ordered.some((r) => r.op === 'DELETE')) return { deletes: [], puts: [] };
		// Rule 3: the tombstone replaces the queued upsert(s).
		return {
			deletes,
			puts: [{ ...mutation, id: generateULID(), createdAt: new Date().toISOString(), retryCount: 0 }]
		};
	}

	// Rules 1 + 4: merge queued upsert payloads only, so a tombstone payload cannot leak back in.
	let payload: Record<string, unknown> = {};
	for (const record of ordered) {
		if (record.op === 'UPSERT') payload = { ...payload, ...(record.payload as Record<string, unknown>) };
	}
	payload = { ...payload, ...(mutation.payload as Record<string, unknown>) };
	return {
		deletes,
		puts: [
			{ ...mutation, payload, id: generateULID(), createdAt: new Date().toISOString(), retryCount: 0 }
		]
	};
}

/** Queue one optimistic mutation, collapsing any queued mutation(s) for the same entity. */
export async function enqueueMutationWithSquashing(
	db: IDBDatabase,
	mutation: SyncPushMutation,
	isNewLocalEntity: boolean = false
): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction('outbox', 'readwrite');
		const store = tx.objectStore('outbox');
		const getReq = store.index('by_entity').getAll(mutation.entityId);

		getReq.onsuccess = () => {
			const plan = planOutboxSquash(getReq.result as OutboxRecord[], mutation, isNewLocalEntity);
			for (const id of plan.deletes) store.delete(id);
			for (const record of plan.puts) store.put(record);
		};

		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}
