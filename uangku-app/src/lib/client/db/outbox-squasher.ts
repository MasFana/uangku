import type { SyncPushMutation } from '$lib/shared/sync-contract';
import type { OutboxRecord } from './idb';
import { generateULID } from '$lib/shared/ulid';

/**
 * Squashes queued mutations for the same entity to minimize network roundtrips:
 * 1. UPSERT (new local) + UPSERT -> Single merged UPSERT.
 * 2. UPSERT (new local) + DELETE -> Remove from outbox entirely (0 network ops).
 * 3. UPSERT (synced on server) + DELETE -> Convert to Soft-Delete UPSERT.
 */
export async function enqueueMutationWithSquashing(
	db: IDBDatabase,
	mutation: SyncPushMutation,
	isNewLocalEntity: boolean = false
): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction('outbox', 'readwrite');
		const store = tx.objectStore('outbox');
		const entityIndex = store.index('by_entity');

		const getReq = entityIndex.getAll(mutation.entityId);

		getReq.onsuccess = () => {
			const existingItems: OutboxRecord[] = getReq.result;

			if (existingItems.length === 0) {
				// No existing queued mutation for this entity
				const newRecord: OutboxRecord = {
					...mutation,
					id: generateULID(),
					createdAt: new Date().toISOString(),
					retryCount: 0
				};
				store.put(newRecord);
				return;
			}

			// We have existing outbox item(s) for this entity
			const latestExisting = existingItems[existingItems.length - 1];

			if (mutation.op === 'DELETE') {
				if (isNewLocalEntity) {
					// Rule 2: Created offline and deleted offline before ever reaching server -> purge from outbox!
					for (const item of existingItems) {
						store.delete(item.id);
					}
				} else {
					// Rule 3: Existed on server or needs soft-delete tombstone
					for (const item of existingItems) {
						store.delete(item.id);
					}
					const deleteRecord: OutboxRecord = {
						...mutation,
						id: generateULID(),
						createdAt: new Date().toISOString(),
						retryCount: 0
					};
					store.put(deleteRecord);
				}
			} else {
				// Rule 1: New UPSERT overwriting previous UPSERT
				for (const item of existingItems) {
					store.delete(item.id);
				}
				const mergedPayload = {
					...(latestExisting.payload as Record<string, unknown>),
					...(mutation.payload as Record<string, unknown>)
				};
				const mergedRecord: OutboxRecord = {
					...mutation,
					id: generateULID(),
					payload: mergedPayload,
					createdAt: new Date().toISOString(),
					retryCount: 0
				};
				store.put(mergedRecord);
			}
		};

		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
