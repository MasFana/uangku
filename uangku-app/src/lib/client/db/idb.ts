import type { WalletDTO, CategoryDTO, TransactionDTO, SyncPushMutation } from '$lib/shared/sync-contract';

/**
 * Legacy shared database. Pre-per-user builds wrote every account's rows here
 * with no user scoping, so it is abandoned (deleted best-effort, see
 * `dropLegacySharedDb`) rather than migrated.
 */
export const LEGACY_IDB_NAME = 'uangku_pwa_ledger';
export const IDB_VERSION = 1;

/** One database per user id: account switching cannot surface another user's rows. */
export function ledgerDbName(userId: string): string {
	return `uangku_pwa_ledger_${userId}`;
}

const LEGACY_CLEANUP_FLAG = 'legacy_shared_db_removed';

export interface SyncMetaRecord {
	key: string;
	value: any;
}

export interface OutboxRecord extends SyncPushMutation {
	id: string; // uuid or ulid of mutation
	createdAt: string;
	retryCount: number;
}

export function openLedgerDB(userId: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB not available in current environment'));
			return;
		}

		const request = indexedDB.open(ledgerDbName(userId), IDB_VERSION);

		request.onupgradeneeded = (event) => {
			const db = request.result;

			// 1. Wallets Store
			if (!db.objectStoreNames.contains('wallets')) {
				const store = db.createObjectStore('wallets', { keyPath: 'id' });
				store.createIndex('by_user', 'userId', { unique: false });
				store.createIndex('by_deleted', 'deletedAt', { unique: false });
			}

			// 2. Categories Store
			if (!db.objectStoreNames.contains('categories')) {
				const store = db.createObjectStore('categories', { keyPath: 'id' });
				store.createIndex('by_user', 'userId', { unique: false });
				store.createIndex('by_kind', 'kind', { unique: false });
			}

			// 3. Transactions Store
			if (!db.objectStoreNames.contains('transactions')) {
				const store = db.createObjectStore('transactions', { keyPath: 'id' });
				store.createIndex('by_user_occurred', ['userId', 'occurredAt'], { unique: false });
				store.createIndex('by_wallet', 'walletId', { unique: false });
				store.createIndex('by_category', 'categoryId', { unique: false });
			}

			// 4. Outbox Store (Mutations queued for sync)
			if (!db.objectStoreNames.contains('outbox')) {
				const store = db.createObjectStore('outbox', { keyPath: 'id' });
				store.createIndex('by_entity', 'entityId', { unique: false });
				store.createIndex('by_created', 'createdAt', { unique: false });
			}

			// 5. Sync Meta Store (cursor, clock offset)
			if (!db.objectStoreNames.contains('sync_meta')) {
				db.createObjectStore('sync_meta', { keyPath: 'key' });
			}
		};

		request.onsuccess = () => {
			resolve(request.result);
			void dropLegacySharedDb(request.result);
		};
		request.onerror = () => reject(request.error);
	});
}

/**
 * ponytail: delete, don't migrate — the legacy DB has no per-row attribution, so
 * its rows cannot be safely claimed by any single user. Runs once per user DB,
 * tracked by a `sync_meta` flag; upgrade path is read/attribute/write if those
 * rows ever need salvaging.
 */
async function dropLegacySharedDb(db: IDBDatabase): Promise<void> {
	try {
		const alreadyDone = await idbGet<SyncMetaRecord>(db, 'sync_meta', LEGACY_CLEANUP_FLAG);
		if (alreadyDone) return;

		const { promise, resolve } = Promise.withResolvers<boolean>();
		const request = indexedDB.deleteDatabase(LEGACY_IDB_NAME);
		request.onsuccess = () => resolve(true);
		request.onerror = () => resolve(false);
		// Blocked = an older tab still holds the legacy DB open; retry on a later open.
		request.onblocked = () => resolve(false);
		if (!(await promise)) return;

		await idbPut(db, 'sync_meta', { key: LEGACY_CLEANUP_FLAG, value: true });
	} catch {
		// Best effort: a failed cleanup must never block the ledger from opening.
	}
}

export function idbGet<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly');
		const store = tx.objectStore(storeName);
		const req = store.get(key);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly');
		const store = tx.objectStore(storeName);
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function idbPut<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite');
		const store = tx.objectStore(storeName);
		const req = store.put(value);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

export function idbDelete(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite');
		const store = tx.objectStore(storeName);
		const req = store.delete(key);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

export function idbClear(db: IDBDatabase, storeName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite');
		const store = tx.objectStore(storeName);
		const req = store.clear();
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}
