import { describe, expect, it } from 'vitest';
import {
	canonicalizeHLC,
	clockNow,
	compareHLC,
	createHLCState,
	MAX_HLC_FUTURE_SKEW_MS,
	nowHLC,
	parseHLC,
	receiveHLC
} from '../../src/lib/shared/hlc';
import { clockOffsetFrom, pickClockSample, rejectionNotice } from '../../src/lib/client/sync/merge';
import type { SyncRejectedMutation } from '../../src/lib/shared/sync-contract';

const CEILING = 1_700_000_000_000;

function stamp(tsMs: number, counter = 1, nodeId = 'nodeA'): string {
	return `${tsMs.toString(36).padStart(9, '0')}-${counter.toString(36).padStart(4, '0')}-${nodeId}`;
}

function stampTimestamp(hlc: string): number {
	const parsed = parseHLC(hlc);
	if (!parsed) throw new Error('unparseable test stamp: ' + hlc);
	return parsed.timestampMs;
}

describe('clockNow', () => {
	it('is the device clock when the offset is 0', () => {
		const state = createHLCState('c0');
		expect(state.clockOffsetMs).toBe(0);
		const before = Date.now();
		const value = clockNow(state);
		const after = Date.now();
		expect(value).toBeGreaterThanOrEqual(before);
		expect(value).toBeLessThanOrEqual(after);
	});

	it('adds a positive offset and subtracts a negative one', () => {
		const state = createHLCState('c1');
		state.clockOffsetMs = 60_000;
		const before = Date.now();
		const ahead = clockNow(state);
		expect(ahead).toBeGreaterThanOrEqual(before + 60_000);
		expect(ahead).toBeLessThanOrEqual(Date.now() + 60_000);

		state.clockOffsetMs = -60_000;
		const behind = clockNow(state);
		expect(behind).toBeLessThanOrEqual(Date.now() - 60_000);
		expect(behind).toBeGreaterThanOrEqual(before - 60_000);
	});
});

describe('nowHLC with a learned clock offset', () => {
	it('stamps ahead of the device clock for a positive offset', () => {
		const state = createHLCState('c1');
		state.clockOffsetMs = 90_000;
		const before = Date.now();
		const hlc = nowHLC(state);
		const after = Date.now();
		expect(stampTimestamp(hlc)).toBeGreaterThanOrEqual(before + 90_000);
		expect(stampTimestamp(hlc)).toBeLessThanOrEqual(after + 90_000);
	});

	it('stamps behind the device clock for a negative offset', () => {
		const state = createHLCState('c1');
		state.clockOffsetMs = -90_000;
		const before = Date.now();
		const hlc = nowHLC(state);
		const after = Date.now();
		expect(stampTimestamp(hlc)).toBeGreaterThanOrEqual(before - 90_000);
		expect(stampTimestamp(hlc)).toBeLessThanOrEqual(after - 90_000);
	});

	it('keeps stamps monotonic while the offset is negative', () => {
		const state = createHLCState('c1');
		state.clockOffsetMs = -3_600_000;
		let prev = nowHLC(state);
		for (let i = 0; i < 5; i++) {
			const next = nowHLC(state);
			expect(compareHLC(prev, next)).toBe(-1);
			expect(stampTimestamp(next)).toBeGreaterThanOrEqual(stampTimestamp(prev));
			prev = next;
		}
	});

	it('increments the counter when the corrected clock stands still', () => {
		const state = createHLCState('c1');
		const first = parseHLC(nowHLC(state, 5_000));
		const second = parseHLC(nowHLC(state, 5_000));
		const third = parseHLC(nowHLC(state, 5_000));
		if (!first || !second || !third) throw new Error('unparseable stamps');
		expect([first.counter, second.counter, third.counter]).toEqual([0, 1, 2]);
	});
});

describe('receiveHLC with a learned clock offset', () => {
	it('uses the corrected clock when the remote stamp is unparseable', () => {
		const state = createHLCState('c1');
		state.clockOffsetMs = 120_000;
		const before = Date.now();
		const hlc = receiveHLC(state, 'not-an-hlc');
		expect(stampTimestamp(hlc)).toBeGreaterThanOrEqual(before + 120_000);
		expect(stampTimestamp(hlc)).toBeLessThanOrEqual(Date.now() + 120_000);
	});
});

describe('clockOffsetFrom', () => {
	it('is the server clock minus the send time when the round trip is 0', () => {
		expect(clockOffsetFrom(1_000_000, 999_000, 0)).toBe(1_000);
	});

	it('charges half the round trip as the one-way delay', () => {
		expect(clockOffsetFrom(10_000, 9_000, 1_000)).toBe(500);
		expect(clockOffsetFrom(10_000, 9_000, 2_000)).toBe(0);
	});

	it('reports a negative offset for a fast device clock', () => {
		expect(clockOffsetFrom(5_000, 9_000, 500)).toBe(-4_250);
	});
});

describe('pickClockSample', () => {
	it('accepts the first sample', () => {
		const candidate = { offsetMs: 250, rttMs: 120 };
		expect(pickClockSample(null, candidate)).toEqual(candidate);
	});

	it('replaces the current sample only when the round trip is smaller', () => {
		const current = { offsetMs: 100, rttMs: 200 };
		const faster = { offsetMs: 300, rttMs: 199 };
		const slower = { offsetMs: 300, rttMs: 201 };
		expect(pickClockSample(current, faster)).toEqual(faster);
		expect(pickClockSample(current, slower)).toEqual(current);
	});

	it('keeps the current sample on an equal round trip', () => {
		const current = { offsetMs: 100, rttMs: 100 };
		expect(pickClockSample(current, { offsetMs: 999, rttMs: 100 })).toBe(current);
	});
});

describe('canonicalizeHLC boundaries', () => {
	const serverNow = CEILING;
	const boundary = serverNow + MAX_HLC_FUTURE_SKEW_MS;

	it('leaves a stamp exactly at the tolerance boundary untouched', () => {
		const atBoundary = stamp(boundary);
		expect(canonicalizeHLC(atBoundary, serverNow)).toBe(atBoundary);
	});

	it('leaves an in-window stamp untouched', () => {
		const inWindow = stamp(boundary - 1);
		expect(canonicalizeHLC(inWindow, serverNow)).toBe(inWindow);
	});

	it('folds 1 ms past the boundary back to the server clock, keeping counter node id', () => {
		const folded = canonicalizeHLC(stamp(boundary + 1, 5, 'devA'), serverNow);
		expect(folded).toBe(stamp(serverNow, 5, 'devA'));
		const parsed = parseHLC(folded);
		expect(parsed).toEqual({ timestampMs: serverNow, counter: 5, nodeId: 'devA' });
	});

	it('leaves unparseable stamps untouched', () => {
		expect(canonicalizeHLC('', serverNow)).toBe('');
		expect(canonicalizeHLC('garbage', serverNow)).toBe('garbage');
		expect(canonicalizeHLC('zzz-yyy', serverNow)).toBe('zzz-yyy');
	});

	it('defaults to a 60 s tolerance', () => {
		expect(MAX_HLC_FUTURE_SKEW_MS).toBe(60_000);
		expect(canonicalizeHLC(stamp(boundary), serverNow)).toBe(stamp(boundary));
		expect(canonicalizeHLC(stamp(boundary + 1), serverNow)).toBe(stamp(serverNow));
	});
});

describe('rejectionNotice branches', () => {
	const entry = (entityId: string, reason: SyncRejectedMutation['reason']): SyncRejectedMutation => ({
		entityId,
		reason
	});

	it('is null with no entries', () => {
		expect(rejectionNotice([])).toBeNull();
	});

	it('announces the count for stale, forbidden and invalid entries', () => {
		expect(rejectionNotice([entry('w1', 'stale')])).toBe(
			'1 perubahan ditolak server; versi server dipakai'
		);
		expect(rejectionNotice([entry('w1', 'forbidden'), entry('w2', 'invalid')])).toBe(
			'2 perubahan ditolak server; versi server dipakai'
		);
	});

	it('uses the clock wording when at least one entry was clamped', () => {
		expect(rejectionNotice([entry('w1', 'clock_skew')])).toBe(
			'1 perubahan disesuaikan ke jam server (jam perangkat Anda berbeda)'
		);
		expect(rejectionNotice([entry('w1', 'stale'), entry('w2', 'clock_skew')])).toBe(
			'2 perubahan disesuaikan ke jam server (jam perangkat Anda berbeda)'
		);
	});
});