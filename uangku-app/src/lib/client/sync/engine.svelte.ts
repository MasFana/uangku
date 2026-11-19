import {
	openLedgerDB,
	idbGetAll,
	idbGet,
	idbDelete,
	type OutboxRecord
} from '../db/idb';
import type {
	WalletDTO,
	CategoryDTO,
	TransactionDTO,
	DashboardSummaryDTO,
	SyncRequestPayload,
	SyncResponsePayload
} from '$lib/shared/sync-contract';
import { SYNC_PROTOCOL_VERSION } from '$lib/shared/sync-contract';
import { createHLCState, type HLCState } from '$lib/shared/hlc';
import {
	mergeDelta,
	parseForceServerIds,
	planForceServerIds,
	rejectionNotice,
	clockOffsetFrom,
	pickClockSample,
	type ClockSample,
	type LocalState
} from './merge';
import {
	shouldResetCursor,
	SYNC_PROTOCOL_META_KEY,
	CURSOR_META_KEY
} from './cursor-reset';
import { LocalLedger } from '../db/local-ledger';
import { SyncCoordinator, type SyncStatus } from './backoff';

export type { SyncStatus };

/**
 * Must match `SYNC_TAG` in `src/service-worker.ts` (owned by ServiceWorkerOffline):
 * the worker registers `sync`/`periodicsync` for this tag and relays it to open
 * tabs as a `{ type: 'uangku:sync' }` message. The worker never replays the
 * outbox itself, so a closed tab only flushes on next open.
 */
const BACKGROUND_SYNC_TAG = 'uangku-outbox-sync';

/**
 * `sync_meta` key holding the JSON string array of entity ids the server rejected
 * and whose server version the local row must still adopt (see `merge.ts`). It is
 * persisted because a rejection is only actionable against a delta row that may
 * arrive in a later cycle — an app restart (or an aborted cycle) between the push
 * and that pull must not lose the pending correction.
 */
const FORCE_SERVER_IDS_META_KEY = 'forceServerIds';

/**
 * `sync_meta` key holding the learned server clock offset in ms (number). Persisted so
 * an offline restart keeps stamping with the corrected clock instead of the device one.
 */
const CLOCK_OFFSET_META_KEY = 'clockOffset';

/**
 * Reactive (Svelte 5 runes) shell over the pure `SyncCoordinator`.
 * This class only mirrors coordinator state into `$state` fields and performs
 * the actual I/O of one cycle; all trigger/retry/timeout policy lives in
 * `backoff.ts` so it stays testable without runes.
 */
class ReactiveSyncEngine {
	wallets = $state<WalletDTO[]>([]);
	categories = $state<CategoryDTO[]>([]);
	transactions = $state<TransactionDTO[]>([]);
	dashboardSummary = $state<DashboardSummaryDTO | null>(null);
	/** True once the first local read has populated the reactive arrays. */
	ready = $state(false);
	status = $state<SyncStatus>('idle');
	pendingCount = $state(0);
	lastError = $state<string | null>(null);

	/**
	 * User-visible explanation of the last rejected push, e.g. "2 perubahan ditolak
	 * server; versi server dipakai". Separate from `lastError` (cycle-level failures)
	 * because a rejected write is still a successful cycle: this one survives until a
	 * pull comes back without rejections.
	 */
	conflictNotice = $state<string | null>(null);

	private db: IDBDatabase | null = null;
	/** Ledger owner; the DB is opened per user, so this drives re-init on switch. */
	private userId: string | null = null;
	private hlcState: HLCState = createHLCState('client-' + Math.random().toString(36).slice(2, 8));
	/** Winning clock sample so far; its offset mirrors `hlcState.clockOffsetMs`. */
	private clockSample: ClockSample | null = null;
	private bus: BroadcastChannel | null = null;
	private coordinator: SyncCoordinator | null = null;
	private isInitialized = false;
	/** Bumped by every init/dispose so a slow open for a previous user is discarded. */
	private initToken = 0;

	// Event-driven only: no periodic poll. Cycles start on a local mutation, on a
	// page load/hard reload (`init`), on reconnect with queued writes, or from the SW.
	private onOnline = () => {
		void this.triggerSync();
	};
	private onServiceWorkerMessage = (event: MessageEvent) => {
		if (event.data?.type === 'uangku:sync') void this.triggerSync();
	};

	async init(userId: string) {
		if (typeof window === 'undefined') return;
		// Same user already live: keep the open connection and its outbox.
		if (this.isInitialized && this.userId === userId) return;
		this.dispose();

		this.userId = userId;
		this.isInitialized = true;
		const token = ++this.initToken;

		try {
			const db = await openLedgerDB(userId);
			// A newer init/dispose landed while we were opening: drop this connection.
			if (token !== this.initToken) {
				db.close();
				return;
			}
			this.db = db;
			// Learned offset from the previous run, so an offline restart keeps stamping corrected.
			await this.loadPersistedClockOffset();
			this.bus = new BroadcastChannel('ledger_sync_bus');
			this.bus.onmessage = (event) => {
				if (event.data?.type !== 'SYNCED') return;
				// Same IndexedDB backs every tab: re-read rows, but skip this tab's own
				// network pull — the tab that just synced already covered it.
				this.coordinator?.noteExternalSync(Number(event.data.at));
				void this.reloadLocalData();
			};

			this.coordinator = new SyncCoordinator({
				runCycle: (signal) => this.executeSyncCycle(signal),
				readPendingCount: () => this.countOutbox(),
				isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
				acquireLock: (task) => this.withSyncLock(task),
				onStatus: (status) => {
					this.status = status;
				},
				onPendingCount: (count) => {
					this.pendingCount = count;
				},
				onLastError: (message) => {
					this.lastError = message;
				}
			});

			window.addEventListener('online', this.onOnline);
			if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
				navigator.serviceWorker.addEventListener('message', this.onServiceWorkerMessage);
			}
			// Before the first cycle can run: a protocol change drops the pull cursor once.
			await this.reconcileCursorWithProtocol();

			await this.reloadLocalData();
			// The one pull every page load gets; everything else is mutation-driven.
			void this.triggerSync();
		} catch (err) {
			console.warn('Sync engine init error:', err);
			// Leave the engine re-init-able so a later run can retry the open.
			if (token === this.initToken) {
				this.isInitialized = false;
				this.userId = null;
			}
		}
	}

	dispose() {
		if (typeof window !== 'undefined') {
			window.removeEventListener('online', this.onOnline);
		}
		if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
			navigator.serviceWorker.removeEventListener('message', this.onServiceWorkerMessage);
		}
		this.coordinator?.dispose();
		this.coordinator = null;
		this.bus?.close();
		this.bus = null;
		// Drop the connection: the next init opens the (possibly different) user's DB.
		this.db?.close();
		this.db = null;
		this.userId = null;
		this.isInitialized = false;
		this.initToken++;
		this.ready = false;
		this.status = 'idle';
		this.wallets = [];
		this.categories = [];
		this.transactions = [];
		this.dashboardSummary = null;
		this.pendingCount = 0;
		this.lastError = null;
		this.conflictNotice = null;
		// The next user's DB has its own offset; `init` loads it.
		this.hlcState.clockOffsetMs = 0;
		this.clockSample = null;
	}

	async reloadLocalData() {
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
		// Keep the outbox depth honest after every enqueue/push/delete.
		this.coordinator?.setPendingCount(outboxItems.length);
		this.ready = true;
	}

	getLocalLedger(): LocalLedger | null {
		if (!this.db) return null;
		return new LocalLedger(this.db, this.hlcState);
	}

	/** Idempotent + cheap: the coordinator coalesces and skips no-op cycles. */
	async triggerSync(): Promise<void> {
		await this.coordinator?.trigger();
	}

	private countOutbox(): Promise<number> {
		if (!this.db) return Promise.resolve(0);
		const db = this.db;
		return new Promise((resolve, reject) => {
			const request = db.transaction('outbox', 'readonly').objectStore('outbox').count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * Cross-tab lock. The task is bounded by the coordinator's cycle timeout,
	 * so a hung fetch can never hold the lock forever.
	 */
	private withSyncLock(task: () => Promise<void>): Promise<void> {
		if (typeof navigator === 'undefined' || !navigator.locks) return task();
		return navigator.locks.request('pwa_ledger_sync_lock', { ifAvailable: true }, async (lock) => {
			if (!lock) return; // another tab is syncing; its cycle pushes our rows too
			await task();
		});
	}

	/** Bounded cycle wrapper: ask the worker for a background retry when work remains. */
	private async executeSyncCycle(signal: AbortSignal): Promise<void> {
		try {
			await this.runSyncCycle(signal);
			if (this.pendingCount > 0) void this.requestBackgroundSync();
		} catch (err) {
			// Failed/offline/aborted: let the OS retry from the worker even if this tab closes.
			void this.requestBackgroundSync();
			throw err;
		}
	}

	/** Best-effort `SyncManager.register`; never throws out of the cycle. */
	private async requestBackgroundSync(): Promise<void> {
		try {
			if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
			const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
				sync?: { register(tag: string): Promise<void> };
			};
			await reg.sync?.register(BACKGROUND_SYNC_TAG);
		} catch {
			// Unsupported browser or denied permission: the in-tab triggers still cover us.
		}
	}

	/**
	 * One-shot per init, before the first cycle: if a cursor exists and the sync
	 * protocol version it was recorded under differs (or was never recorded, i.e. a
	 * DB from before this check), drop the cursor so the next pull re-delivers every
	 * row the cursor had already passed. The outbox is deliberately untouched.
	 *
	 * The version is a protocol constant, not the build version: a deploy that does
	 * not change the row shape or the merge rules must not re-download every ledger.
	 *
	 * Whole body is best-effort: a failed `sync_meta` read/write must never throw out
	 * of `init` (the cursor simply stays as-is and the version is retried next init).
	 */
	private async reconcileCursorWithProtocol(): Promise<void> {
		const db = this.db;
		if (!db) return;
		try {
			const [cursor, stored] = await Promise.all([
				idbGet<{ key: string; value: number }>(db, 'sync_meta', CURSOR_META_KEY),
				idbGet<{ key: string; value: string }>(db, 'sync_meta', SYNC_PROTOCOL_META_KEY)
			]);
			// No cursor yet (fresh install) → nothing to reset; a cursor with no recorded
			// version is a pre-upgrade-check DB and must re-pull in full.
			if (!shouldResetCursor(cursor !== undefined, stored?.value, SYNC_PROTOCOL_VERSION)) return;
			await idbDelete(db, 'sync_meta', CURSOR_META_KEY);
			await idbDelete(db, 'sync_meta', 'appVersion'); // pre-protocol key
			console.log(
				JSON.stringify({
					event: 'sync_cursor_reset',
					from: stored?.value ?? null,
					to: SYNC_PROTOCOL_VERSION
				})
			);
		} catch (err) {
			console.warn('Sync cursor protocol check skipped:', err);
		}
	}

	private async loadPersistedClockOffset(): Promise<void> {
		const db = this.db;
		if (!db) return;
		try {
			const stored = await idbGet<{ key: string; value: unknown }>(
				db,
				'sync_meta',
				CLOCK_OFFSET_META_KEY
			);
			const offsetMs =
				typeof stored?.value === 'number' && Number.isFinite(stored.value) ? stored.value : 0;
			// Unknown RTT: the first freshly measured sample always wins over it.
			this.applyClockSample({ offsetMs, rttMs: Infinity });
		} catch {
			this.applyClockSample({ offsetMs: 0, rttMs: Infinity });
		}
	}

	/**
	 * Mirror the winning sample into the shared HLC state — every later write stamps
	 * with it. Rounded because a stamp is whole milliseconds.
	 */
	private applyClockSample(sample: ClockSample): void {
		const offsetMs = Math.round(sample.offsetMs);
		this.clockSample = { offsetMs, rttMs: sample.rttMs };
		this.hlcState.clockOffsetMs = offsetMs;
	}

	private async runSyncCycle(signal: AbortSignal): Promise<void> {
		if (!this.db) return;

		// 1. Read outbox mutations, cursor, and the forced-adoption set left by an
		// earlier rejected push.
		const outboxItems = await idbGetAll<OutboxRecord>(this.db, 'outbox');
		const cursorMeta = await idbGet<{ key: string; value: number }>(this.db, 'sync_meta', 'cursor');
		const clientCursor = cursorMeta?.value || 0;
		const forcedMeta = await idbGet<{ key: string; value: string }>(
			this.db,
			'sync_meta',
			FORCE_SERVER_IDS_META_KEY
		);
		const forcedIds = new Set(parseForceServerIds(forcedMeta?.value));

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

		// Sent-at and RTT around the request: with the response's `serverNow` they give one
		// clock-offset sample (see `clockOffsetFrom`).
		const sentAtMs = Date.now();
		const requestStartedAt = performance.now();
		const res = await fetch('/api/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal
		});

		if (res.status === 401) {
			throw new Error('Sesi berakhir — masuk kembali untuk menyinkronkan.');
		}
		if (!res.ok) {
			throw new Error('Sync failed with status ' + res.status);
		}

		const data = (await res.json()) as SyncResponsePayload;
		const rttMs = performance.now() - requestStartedAt;

		// 3. Learn the server clock offset BEFORE the commit below, so the next local write
		// already stamps with the corrected clock instead of the device's. Best-of-window:
		// only a smaller round trip replaces the current sample.
		const sample = pickClockSample(this.clockSample, {
			offsetMs: clockOffsetFrom(data.serverNow, sentAtMs, rttMs),
			rttMs
		});
		this.applyClockSample(sample);

		// A clamped (`canonicalized`) row exists server-side with the server's hlc: adopt it
		// outright this cycle, else local LWW keeps our higher stamp and both sides diverge.
		const canonicalizedIds = data.canonicalized.map((entry) => entry.entityId);
		const forceForMerge = new Set(forcedIds);
		for (const id of canonicalizedIds) if (id) forceForMerge.add(id);

		// 4. Commit results to IDB safely
		await this.commitSyncResultToIDB(outboxItems, data, forceForMerge, clientCursor);

		// 5. Surface rejections and clamps as their own field: a rejected write is still a
		// successful cycle, so `lastError` (cycle failures only) stays untouched and this
		// notice lives until a pull comes back with neither.
		this.conflictNotice = rejectionNotice([...data.rejected, ...data.canonicalized]);

		// 6. Notify other tabs. Reactive arrays were already set from the merge result
		// inside `commitSyncResultToIDB`, so no second full read of this tab's stores.
		this.bus?.postMessage({ type: 'SYNCED', at: Date.now() });
	}

	private async commitSyncResultToIDB(
		sentMutations: OutboxRecord[],
		response: SyncResponsePayload,
		/** Ids whose server version must win outright (rejections and clamps). */
		forcedIds: ReadonlySet<string>,
		/** The cursor the server just pulled against: 0 means this delta was already full. */
		clientCursor: number
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

		// B. Read the local rows inside THIS transaction, so a concurrent local write
		// cannot slip between the HLC compare and the put (no lost update window).
		let mergedState: LocalState | null = null;
		const txDone = Promise.withResolvers<LocalState | null>();
		// ponytail: reads all three stores to merge delta rows. Ceiling: O(n) IDB read
		// per cycle. Upgrade: fetch only the delta/forced ids with `getAll(id)` once a
		// ledger grows past ~50k rows; correctness stays identical.
		const walletReq = walletStore.getAll();
		const categoryReq = categoryStore.getAll();
		const txReq = txStore.getAll();
		let pendingReads = 3;
		const applyDeltaWhenLoaded = () => {
			if (--pendingReads > 0) return;
			const { merged, changedIds, adoptedForceIds } = mergeDelta(
				{
					wallets: walletReq.result as WalletDTO[],
					categories: categoryReq.result as CategoryDTO[],
					transactions: txReq.result as TransactionDTO[]
				},
				response.delta,
				forcedIds
			);
			mergedState = merged;
			const changedWallets = new Set<string>();
			const changedCategories = new Set<string>();
			const changedTransactions = new Set<string>();
			for (const changed of changedIds) {
				if (changed.table === 'wallets') changedWallets.add(changed.id);
				else if (changed.table === 'categories') changedCategories.add(changed.id);
				else changedTransactions.add(changed.id);
			}
			for (const w of merged.wallets) if (changedWallets.has(w.id)) walletStore.put(w);
			for (const c of merged.categories) if (changedCategories.has(c.id)) categoryStore.put(c);
			for (const t of merged.transactions) if (changedTransactions.has(t.id)) txStore.put(t);

			// C. Cursor, app version, and the force set — all in this transaction, so an
			// aborted/failed cycle leaves the previous persisted values intact and the
			// correction is simply retried. Writes are issued here, not before the row
			// reads above, because the cursor depends on what the merge actually adopted.
			const plan = planForceServerIds(
				[...forcedIds],
				adoptedForceIds,
				// Rejected and clamped ids alike need the server row adopted; a clamped row
				// already exists server-side under the server's hlc.
				[...response.rejected, ...response.canonicalized].map((entry) => entry.entityId),
				clientCursor
			);
			// Persisted in the same transaction, so the learned offset survives a restart
			// only when the cycle actually committed.
			metaStore.put({ key: CLOCK_OFFSET_META_KEY, value: this.hlcState.clockOffsetMs });
			if (plan.persist.length > 0) {
				metaStore.put({ key: FORCE_SERVER_IDS_META_KEY, value: JSON.stringify(plan.persist) });
			} else {
				metaStore.delete(FORCE_SERVER_IDS_META_KEY);
			}
			if (plan.resetCursor) {
				// The server row we must adopt sits at or below the cursor and would never
				// be re-delivered: drop the cursor so the next pull is a full delta.
				metaStore.delete(CURSOR_META_KEY);
			} else {
				// The protocol marker is stamped only now that a full cycle succeeded: an upgrade
				// that never syncs keeps its cursor reset pending.
				metaStore.put({ key: CURSOR_META_KEY, value: response.newCursor });
				metaStore.put({ key: SYNC_PROTOCOL_META_KEY, value: SYNC_PROTOCOL_VERSION });
			}
		};
		walletReq.onsuccess = applyDeltaWhenLoaded;
		categoryReq.onsuccess = applyDeltaWhenLoaded;
		txReq.onsuccess = applyDeltaWhenLoaded;

		// The cursor/app-version/force-set writes are step C inside `applyDeltaWhenLoaded`:
		// they depend on what the merge adopted, and issuing them here would queue them
		// before those row reads resolved.

		tx.oncomplete = () => txDone.resolve(mergedState);
		tx.onerror = () => txDone.reject(tx.error);

		// D. Reactive arrays are filtered views of the same merge result (single code path).
		const merged = await txDone.promise;
		if (merged) {
			this.wallets = merged.wallets.filter((w) => !w.deletedAt);
			this.categories = merged.categories.filter((c) => !c.deletedAt);
			this.transactions = merged.transactions.filter((t) => !t.deletedAt);
		}
	}
}

export const syncEngine = new ReactiveSyncEngine();
