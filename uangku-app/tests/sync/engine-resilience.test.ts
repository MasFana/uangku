import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	SyncCoordinator,
	backoffDelay,
	BACKOFF_BASE_MS,
	BACKOFF_CAP_MS,
	CYCLE_TIMEOUT_MS
} from '../../src/lib/client/sync/backoff';

afterEach(() => {
	vi.useRealTimers();
});

describe('backoffDelay', () => {
	it('grows exponentially then saturates at the cap', () => {
		// random()=1 → full step; deterministic and monotone.
		const full = { random: () => 1 };
		const d0 = backoffDelay(0, full);
		const d1 = backoffDelay(1, full);
		const d2 = backoffDelay(2, full);
		expect(d0).toBe(BACKOFF_BASE_MS);
		expect(d1).toBe(BACKOFF_BASE_MS * 2);
		expect(d2).toBe(BACKOFF_BASE_MS * 4);
		expect(d1).toBeGreaterThan(d0);
		expect(d2).toBeGreaterThan(d1);
		// Saturation: never exceeds the cap, no matter how many attempts.
		for (const attempt of [6, 7, 20, 99]) {
			expect(backoffDelay(attempt, full)).toBe(BACKOFF_CAP_MS);
		}
	});

	it('applies full jitter within [step/2, step] and stays above zero', () => {
		expect(backoffDelay(3, { random: () => 0 })).toBe(BACKOFF_BASE_MS * 4);
		expect(backoffDelay(3, { random: () => 1 })).toBe(BACKOFF_BASE_MS * 8);
		for (const attempt of [0, 1, 5, 30]) {
			const delay = backoffDelay(attempt, { random: () => 0.5 });
			expect(delay).toBeGreaterThan(0);
			expect(delay).toBeLessThanOrEqual(BACKOFF_CAP_MS);
		}
	});
});

describe('SyncCoordinator cycle bounding', () => {
	it('abandons a never-resolving cycle within the timeout and accepts the next trigger', async () => {
		vi.useFakeTimers();
		let calls = 0;
		const deps = {
			runCycle: () => {
				calls += 1;
				// First cycle hangs forever (like a stuck fetch/blob upload).
				return calls === 1 ? new Promise<void>(() => { }) : Promise.resolve();
			},
			readPendingCount: () => 1,
			isOnline: () => true,
			timeoutMs: CYCLE_TIMEOUT_MS
		};
		const coordinator = new SyncCoordinator(deps);

		void coordinator.trigger();
		await vi.advanceTimersByTimeAsync(CYCLE_TIMEOUT_MS);
		expect(coordinator.status).toBe('error');
		expect(coordinator.lastError).toMatch(/timed out/i);
		expect(calls).toBe(1);

		// Lock/timeout is not stuck: the next trigger still runs a cycle.
		await coordinator.trigger();
		expect(calls).toBe(2);
		expect(coordinator.status).toBe('idle');
		expect(coordinator.lastError).toBeNull();
		coordinator.dispose();
	});

	it('coalesces concurrent triggers into a single in-flight cycle', async () => {
		let release: () => void = () => { };
		let calls = 0;
		const coordinator = new SyncCoordinator({
			runCycle: () => {
				calls += 1;
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			},
			readPendingCount: () => 1,
			isOnline: () => true
		});

		void coordinator.trigger();
		void coordinator.trigger();
		void coordinator.trigger();
		await Promise.resolve();
		await Promise.resolve();
		expect(calls).toBe(1);
		release();
		await Promise.resolve();
		await Promise.resolve();
		coordinator.dispose();
	});

	it('retries a failed cycle after a backoff delay', async () => {
		vi.useFakeTimers();
		let calls = 0;
		const coordinator = new SyncCoordinator({
			runCycle: async () => {
				calls += 1;
				if (calls === 1) throw new Error('network down');
			},
			readPendingCount: () => 1,
			isOnline: () => true,
			backoff: { baseMs: 1000, capMs: 60000, random: () => 1 }
		});

		void coordinator.trigger();
		await vi.advanceTimersByTimeAsync(0);
		expect(coordinator.status).toBe('error');
		expect(coordinator.lastError).toBe('network down');

		await vi.advanceTimersByTimeAsync(1000);
		expect(calls).toBe(2);
		expect(coordinator.status).toBe('idle');
		coordinator.dispose();
	});
});

describe('SyncCoordinator pendingCount', () => {
	it('decrements after a successful push and never goes negative', async () => {
		const state = { depth: 3, clock: 1_000_000 };
		const coordinator = new SyncCoordinator({
			runCycle: async () => {
				state.depth = Math.max(0, state.depth - 1);
			},
			readPendingCount: () => state.depth,
			now: () => state.clock,
			isOnline: () => true
		});

		coordinator.setPendingCount(3);
		expect(coordinator.pendingCount).toBe(3);

		await coordinator.trigger();
		expect(coordinator.pendingCount).toBe(2);
		await coordinator.trigger();
		expect(coordinator.pendingCount).toBe(1);
		await coordinator.trigger();
		expect(coordinator.pendingCount).toBe(0);

		// A negative authoritative count is clamped.
		coordinator.setPendingCount(-5);
		expect(coordinator.pendingCount).toBe(0);
		coordinator.setPendingCount(Number.NaN);
		expect(coordinator.pendingCount).toBe(0);

		state.depth = -2;
		await coordinator.trigger();
		expect(coordinator.pendingCount).toBe(0);
		coordinator.dispose();
	});
});

describe('SyncCoordinator periodic trigger', () => {
	it('fires only while the tab is visible', async () => {
		vi.useFakeTimers();
		let visible = false;
		let calls = 0;
		const coordinator = new SyncCoordinator({
			runCycle: async () => {
				calls += 1;
			},
			readPendingCount: () => 0,
			isVisible: () => visible,
			isOnline: () => true,
			syncPeriodMs: 30_000
		});

		coordinator.startPeriodic();
		await vi.advanceTimersByTimeAsync(95_000);
		expect(calls).toBe(0);

		visible = true;
		await vi.advanceTimersByTimeAsync(30_000);
		expect(calls).toBeGreaterThan(0);
		coordinator.dispose();
	});

	it('skips a visible tick when the outbox is empty and the last pull is fresh', async () => {
		vi.useFakeTimers();
		const clock = { ms: 10_000_000 };
		let calls = 0;
		const coordinator = new SyncCoordinator({
			runCycle: async () => {
				calls += 1;
			},
			readPendingCount: () => 0,
			isVisible: () => true,
			isOnline: () => true,
			now: () => clock.ms,
			syncPeriodMs: 30_000
		});

		// First tick sees no success yet → pulls.
		await coordinator.trigger();
		expect(calls).toBe(1);
		// Within the fresh window with an empty outbox → no-op.
		clock.ms += 5_000;
		await coordinator.trigger();
		expect(calls).toBe(1);
		// Past the window → pulls again.
		clock.ms += 30_000;
		await coordinator.trigger();
		expect(calls).toBe(2);
		coordinator.dispose();
	});
});
