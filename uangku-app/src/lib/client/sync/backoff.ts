/**
 * Pure (runes-free) sync resilience policy: exponential backoff with full jitter,
 * bounded sync cycles, lock acquisition, cheap/idempotent triggers, and retry.
 *
 * Kept free of Svelte/$state and of DOM globals (except safe defaults) so it is
 * unit-testable under plain Vitest with fake timers. `engine.svelte.ts` is the
 * thin reactive shell over this coordinator.
 */

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/** Hard ceiling for one sync cycle (fetch + blob upload + IDB commit). */
export const CYCLE_TIMEOUT_MS = 15_000;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 60_000;
/** Skip a trigger when outbox is empty and the last success was this recent. */
export const MIN_PULL_INTERVAL_MS = 30_000;
/** Periodic pull cadence while the tab is visible. */
export const SYNC_PERIOD_MS = 30_000;

export interface BackoffOptions {
	baseMs?: number;
	capMs?: number;
	/** Injectable RNG for deterministic tests; must return [0, 1). */
	random?: () => number;
}

/**
 * Delay before retry N (0-based): exponential, full-jitter in [step/2, step],
 * never above `capMs`. Growth saturates at the cap.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions = {}): number {
	const base = opts.baseMs ?? BACKOFF_BASE_MS;
	const cap = opts.capMs ?? BACKOFF_CAP_MS;
	const random = opts.random ?? Math.random;
	const step = Math.min(cap, base * 2 ** Math.max(0, Math.floor(attempt)));
	return Math.round(step / 2 + random() * (step / 2));
}

/**
 * Schedulers are injected as "schedule and hand back a cancel function" so the
 * coordinator never handles a platform timer handle directly — browsers return a
 * number, node returns an object, and mixing the two produces unassignable types.
 * Default implementations use the globals of whatever runtime they run in.
 */
export interface SyncCoordinatorDeps {
	/** One full cycle: flush blobs, push, pull, commit. Rejects on failure; must honor `signal`. */
	runCycle: (signal: AbortSignal) => Promise<void>;
	/** Authoritative outbox depth (cheap IDB count). */
	readPendingCount: () => Promise<number> | number;
	isOnline?: () => boolean;
	isVisible?: () => boolean;
	/** Wrap a cycle in the cross-tab lock. Default: run directly. */
	acquireLock?: (task: () => Promise<void>) => Promise<void>;
	onStatus?: (status: SyncStatus) => void;
	onPendingCount?: (count: number) => void;
	onLastError?: (message: string | null) => void;
	timeoutMs?: number;
	minPullIntervalMs?: number;
	syncPeriodMs?: number;
	backoff?: BackoffOptions;
	now?: () => number;
	scheduleOnce?: (fn: () => void, ms: number) => () => void;
	scheduleRepeating?: (fn: () => void, ms: number) => () => void;
}

export class SyncCoordinator {
	status: SyncStatus = 'idle';
	pendingCount = 0;
	lastError: string | null = null;

	private inFlight = false;
	private queued = false;
	private rerun = false;
	private attempt = 0;
	private lastSuccessAt = 0;
	private epoch = 0;
	private cancelRetry: (() => void) | null = null;
	private cancelInterval: (() => void) | null = null;
	private disposed = false;

	private readonly isOnline: () => boolean;
	private readonly isVisible: () => boolean;
	private readonly now: () => number;
	private readonly timeoutMs: number;
	private readonly minPullIntervalMs: number;
	private readonly syncPeriodMs: number;
	private readonly scheduleOnce: (fn: () => void, ms: number) => () => void;
	private readonly scheduleRepeating: (fn: () => void, ms: number) => () => void;

	constructor(private deps: SyncCoordinatorDeps) {
		this.isOnline = deps.isOnline ?? (() => true);
		this.isVisible = deps.isVisible ?? (() => true);
		this.now = deps.now ?? Date.now;
		this.timeoutMs = deps.timeoutMs ?? CYCLE_TIMEOUT_MS;
		this.minPullIntervalMs = deps.minPullIntervalMs ?? MIN_PULL_INTERVAL_MS;
		this.syncPeriodMs = deps.syncPeriodMs ?? SYNC_PERIOD_MS;
		this.scheduleOnce =
			deps.scheduleOnce ??
			((fn, ms) => {
				const handle = setTimeout(fn, ms);
				return () => clearTimeout(handle);
			});
		this.scheduleRepeating =
			deps.scheduleRepeating ??
			((fn, ms) => {
				const handle = setInterval(fn, ms);
				return () => clearInterval(handle);
			});
	}

	/** Periodic pull, only while the tab is visible. Idempotent. */
	startPeriodic(): void {
		if (this.cancelInterval !== null || this.disposed) return;
		this.cancelInterval = this.scheduleRepeating(() => {
			if (!this.isVisible()) return;
			void this.trigger();
		}, this.syncPeriodMs);
	}

	stopPeriodic(): void {
		this.cancelInterval?.();
		this.cancelInterval = null;
	}

	dispose(): void {
		this.disposed = true;
		this.stopPeriodic();
		this.cancelRetry?.();
		this.cancelRetry = null;
	}

	/** Set the authoritative outbox depth. Clamped to a non-negative integer. */
	setPendingCount(count: number): void {
		const next = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
		if (next === this.pendingCount) return;
		this.pendingCount = next;
		this.deps.onPendingCount?.(next);
	}

	/**
	 * Idempotent, cheap trigger. Coalesces concurrent calls (sets `rerun`), and
	 * skips work when the outbox is empty and the last successful pull is fresh.
	 */
	async trigger(): Promise<void> {
		if (this.disposed) return;
		if (this.inFlight || this.queued) {
			this.rerun = true;
			return;
		}
		if (!this.isOnline()) {
			this.setStatus('offline');
			return;
		}
		this.queued = true;
		try {
			const depth = await this.deps.readPendingCount();
			this.setPendingCount(typeof depth === 'number' ? depth : this.pendingCount);
			const fresh = this.now() - this.lastSuccessAt < this.minPullIntervalMs;
			if (this.pendingCount === 0 && fresh) return;
			const acquire = this.deps.acquireLock ?? ((task: () => Promise<void>) => task());
			await acquire(() => this.runGuarded());
		} catch (err) {
			this.setLastError(err instanceof Error ? err.message : String(err));
		} finally {
			this.queued = false;
			if (this.rerun && !this.disposed) {
				this.rerun = false;
				void this.trigger();
			}
		}
	}

	private async runGuarded(): Promise<void> {
		if (this.inFlight || this.disposed) return;
		this.inFlight = true;
		const epoch = ++this.epoch;
		const controller = new AbortController();
		this.setStatus('syncing');
		try {
			await this.raceTimeout(this.deps.runCycle(controller.signal), controller);
			if (epoch !== this.epoch) return;
			this.attempt = 0;
			this.lastSuccessAt = this.now();
			this.setLastError(null);
			this.setStatus('idle');
			this.setPendingCount(await this.safePendingCount());
		} catch (err) {
			if (epoch !== this.epoch) return;
			controller.abort();
			this.attempt += 1;
			this.setPendingCount(await this.safePendingCount());
			this.setLastError(err instanceof Error ? err.message : String(err));
			const online = this.isOnline();
			this.setStatus(online ? 'error' : 'offline');
			if (online) this.scheduleRetry();
		} finally {
			if (epoch === this.epoch) this.inFlight = false;
		}
	}

	/** Bound a cycle: on timeout the fetch is aborted and the caller moves on. */
	private raceTimeout(cycle: Promise<void>, controller: AbortController): Promise<void> {
		const timeout = this.timeoutMs;
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const cancel = this.scheduleOnce(() => {
			controller.abort();
			reject(new Error(`Sync cycle timed out after ${timeout}ms`));
		}, timeout);
		cycle.then(
			() => {
				cancel();
				resolve();
			},
			(err) => {
				cancel();
				reject(err);
			}
		);
		return promise;
	}

	private scheduleRetry(): void {
		if (this.cancelRetry !== null || this.disposed) return;
		const delay = backoffDelay(this.attempt - 1, this.deps.backoff);
		this.cancelRetry = this.scheduleOnce(() => {
			this.cancelRetry = null;
			void this.trigger();
		}, delay);
	}

	private async safePendingCount(): Promise<number> {
		try {
			return await this.deps.readPendingCount();
		} catch {
			return this.pendingCount;
		}
	}

	private setStatus(status: SyncStatus): void {
		if (status === this.status) return;
		this.status = status;
		this.deps.onStatus?.(status);
	}

	private setLastError(message: string | null): void {
		if (message === this.lastError) return;
		this.lastError = message;
		this.deps.onLastError?.(message);
	}
}
