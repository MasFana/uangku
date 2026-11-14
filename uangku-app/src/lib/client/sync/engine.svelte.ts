import {
	openLedgerDB,
	idbGetAll,
	idbGet,
	idbPut,
	idbDelete,
	type OutboxRecord,
	type PendingBlobRecord
} from '../db/idb';
import type {
	WalletDTO,
	CategoryDTO,
	TransactionDTO,
	DashboardSummaryDTO,
	SyncRequestPayload,
	SyncResponsePayload
} from '$lib/shared/sync-contract';
import { createHLCState, nowHLC, receiveHLC, compareHLC, type HLCState } from '$lib/shared/hlc';
import { LocalLedger } from '../db/local-ledger';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'auth_required';

class ReactiveSyncEngine {
	wallets = $state<WalletDTO[]>([]);
	categories = $state<CategoryDTO[]>([]);
	transactions = $state<TransactionDTO[]>([]);
	dashboardSummary = $state<DashboardSummaryDTO | null>(null);
	syncStatus = $state<SyncStatus>('idle');
	pendingCount = $state<number>(0);

	private db: IDBDatabase | null = null;
	private hlcState: HLCState = createHLCState('client-' + Math.random().toString(36).slice(2, 8));
	private bus: BroadcastChannel | null = null;
	private isInitialized = false;

	async init(userId: string) {
		if (this.isInitialized || typeof window === 'undefined') return;
		this.isInitialized = true;

		try {
			this.db = await openLedgerDB();
			this.bus = new BroadcastChannel('ledger_sync_bus');
			this.bus.onmessage = (event) => {
				if (event.data?.type === 'RELOAD_LOCAL_DATA') {
					this.loadLocalData();
				}
			};

			await this.loadLocalData();

			window.addEventListener('online', () => {
				this.triggerSync();
			});

			// Trigger initial sync in background
			this.triggerSync();
		} catch (err) {
			console.warn('Sync engine init error:', err);
		}
	}

	async loadLocalData() {
		if (!this.db) return;
		const [wList, cList, txList, outboxItems] = await Promise.all([
			idbGetAll<WalletDTO>(this.db, 'wallets'),
			idbGetAll<CategoryDTO>(this.db, 'categories'),
			idbGetAll<TransactionDTO>(this.db, 'transactions'),
			idbGetAll<OutboxRecord>(this.db, 'outbox')
		]);

		this.wallets = wList.filter((w) => !w.deletedAt);
		this.categories = cList.filter((c) => !c.deletedAt);
		this.transactions = txList.filter((t) => !t.deletedAt);
		this.pendingCount = outboxItems.length;
	}

	getLocalLedger(): LocalLedger | null {
		if (!this.db) return null;
		return new LocalLedger(this.db, this.hlcState);
	}

	async triggerSync(): Promise<void> {
		if (!this.db || typeof navigator === 'undefined' || !navigator.onLine) {
			this.syncStatus = 'offline';
			return;
		}

		if (navigator.locks) {
			await navigator.locks.request('pwa_ledger_sync_lock', { ifAvailable: true }, async (lock) => {
				if (!lock) {
					// Another tab is currently syncing
					return;
				}
				await this.executeSyncCycle();
			});
		} else {
			await this.executeSyncCycle();
		}
	}

	private async executeSyncCycle(): Promise<void> {
		if (!this.db) return;
		this.syncStatus = 'syncing';

		try {
			// 1. Flush pending receipt blobs to R2
			await this.flushPendingReceiptBlobs();

			// 2. Read outbox mutations and cursor
			const outboxItems = await idbGetAll<OutboxRecord>(this.db, 'outbox');
			const cursorMeta = await idbGet<{ key: string; value: number }>(this.db, 'sync_meta', 'cursor');
			const clientCursor = cursorMeta?.value || 0;

			const payload: SyncRequestPayload = {
				cursor: clientCursor,
				mutations: outboxItems.map((item) => ({
					entityId: item.entityId,
					table: item.table,
					op: item.op,
					hlc: item.hlc,
					payload: item.payload
				}))
			};

			const res = await fetch('/api/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (res.status === 401) {
				this.syncStatus = 'auth_required';
				return;
			}
			if (!res.ok) {
				throw new Error('Sync failed with status ' + res.status);
			}

			const data = (await res.json()) as SyncResponsePayload;

			// 3. Commit results to IDB safely
			await this.commitSyncResultToIDB(outboxItems, data);

			// 4. Update reactive state & notify other tabs
			await this.loadLocalData();
			this.bus?.postMessage({ type: 'RELOAD_LOCAL_DATA' });

			this.syncStatus = 'idle';
		} catch (err) {
			console.warn('Sync cycle failed:', err);
			this.syncStatus = navigator.onLine ? 'idle' : 'offline';
		}
	}

	private async flushPendingReceiptBlobs(): Promise<void> {
		if (!this.db) return;
		const blobs = await idbGetAll<PendingBlobRecord>(this.db, 'pending_blobs');
		for (const item of blobs) {
			try {
				const formData = new FormData();
				formData.append('key', item.id);
				formData.append('file', item.blob);

				const res = await fetch('/api/receipts/upload', {
					method: 'POST',
					body: formData
				});
				if (res.ok) {
					await idbDelete(this.db, 'pending_blobs', item.id);
				}
			} catch {
				// Retry on next cycle
			}
		}
	}

	private async commitSyncResultToIDB(
		sentMutations: OutboxRecord[],
		response: SyncResponsePayload
	): Promise<void> {
		if (!this.db) return;

		const tx = this.db.transaction(
			['outbox', 'wallets', 'categories', 'transactions', 'sync_meta'],
			'readwrite'
		);
		const outboxStore = tx.objectStore('outbox');
		const walletStore = tx.objectStore('wallets');
		const categoryStore = tx.objectStore('categories');
		const txStore = tx.objectStore('transactions');
		const metaStore = tx.objectStore('sync_meta');

		// A. Remove successfully synced outbox entries ONLY IF HLC matches (mid-flight edit safety)
		for (const sent of sentMutations) {
			const currentReq = outboxStore.get(sent.id);
			currentReq.onsuccess = () => {
				const current: OutboxRecord | undefined = currentReq.result;
				if (current && current.hlc === sent.hlc) {
					outboxStore.delete(sent.id);
				}
			};
		}

		// B. Apply delta wallets
		for (const w of response.delta.wallets) {
			const localReq = walletStore.get(w.id);
			localReq.onsuccess = () => {
				const local: WalletDTO | undefined = localReq.result;
				if (!local || compareHLC(w.hlc, local.hlc) > 0) {
					walletStore.put(w);
				}
			};
		}

		// C. Apply delta categories
		for (const c of response.delta.categories) {
			const localReq = categoryStore.get(c.id);
			localReq.onsuccess = () => {
				const local: CategoryDTO | undefined = localReq.result;
				if (!local || compareHLC(c.hlc, local.hlc) > 0) {
					categoryStore.put(c);
				}
			};
		}

		// D. Apply delta transactions
		for (const t of response.delta.transactions) {
			const localReq = txStore.get(t.id);
			localReq.onsuccess = () => {
				const local: TransactionDTO | undefined = localReq.result;
				if (!local || compareHLC(t.hlc, local.hlc) > 0) {
					txStore.put(t);
				}
			};
		}

		// E. Update cursor
		metaStore.put({ key: 'cursor', value: response.newCursor });

		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}

export const syncEngine = new ReactiveSyncEngine();
