import type { WalletDTO, CategoryDTO, TransactionDTO, SyncPushMutation } from '$lib/shared/sync-contract';

export const IDB_NAME = 'uangku_pwa_ledger';
export const IDB_VERSION = 1;

export interface SyncMetaRecord {
	key: string;
	value: any;
}

export interface PendingBlobRecord {
	id: string; // receiptKey
	blob: Blob;
	contentType: string;
	createdAt: string;
}

export interface OutboxRecord extends SyncPushMutation {
	id: string; // uuid or ulid of mutation
	createdAt: string;
	retryCount: number;
}

export function openLedgerDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB not available in current environment'));
			return;
		}

		const request = indexedDB.open(IDB_NAME, IDB_VERSION);

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

			// 5. Pending Blobs Store (Receipt images awaiting R2 upload)
			if (!db.objectStoreNames.contains('pending_blobs')) {
				const store = db.createObjectStore('pending_blobs', { keyPath: 'id' });
				store.createIndex('by_created', 'createdAt', { unique: false });
			}

			// 6. Sync Meta Store (cursor, lastSyncAt, nodeId)
			if (!db.objectStoreNames.contains('sync_meta')) {
				db.createObjectStore('sync_meta', { keyPath: 'key' });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
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
