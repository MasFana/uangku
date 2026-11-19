/**
 * Deterministic Hybrid Logical Clock (HLC) Implementation
 * Format: `${timestampMs.toString(36).padStart(9, '0')}-${counter.toString(36).padStart(4, '0')}-${nodeId}`
 * Resolves Last-Write-Wins (LWW) conflict per row across offline clients and server.
 */

export interface HLCState {
	nodeId: string;
	lastPhysicalMs: number;
	counter: number;
	/**
	 * Correction applied on top of the device clock when stamping. Learned from the
	 * server clock on every successful sync, so a device whose clock is fast or slow
	 * does not win (or lose) every future conflict. 0 = trust the device clock.
	 */
	clockOffsetMs: number;
}

export function createHLCState(nodeId: string): HLCState {
	// Sanitize nodeId to alphanumeric
	const cleanNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'node0';
	return {
		nodeId: cleanNodeId,
		lastPhysicalMs: 0,
		counter: 0,
		clockOffsetMs: 0
	};
}

/** Device clock corrected by the learned server offset; the default stamping time. */
export function clockNow(state: HLCState): number {
	return Date.now() + state.clockOffsetMs;
}

function formatHLC(timestampMs: number, counter: number, nodeId: string): string {
	const tsStr = Math.max(0, timestampMs).toString(36).padStart(9, '0');
	const cntStr = Math.max(0, counter).toString(36).padStart(4, '0');
	return `${tsStr}-${cntStr}-${nodeId}`;
}

export function parseHLC(hlc: string): { timestampMs: number; counter: number; nodeId: string } | null {
	if (!hlc || typeof hlc !== 'string') return null;
	const parts = hlc.split('-');
	if (parts.length < 3) return null;
	const timestampMs = parseInt(parts[0], 36);
	const counter = parseInt(parts[1], 36);
	const nodeId = parts.slice(2).join('-');
	if (isNaN(timestampMs) || isNaN(counter)) return null;
	return { timestampMs, counter, nodeId };
}

export function nowHLC(state: HLCState, physicalNowMs: number = clockNow(state)): string {
	const pt = physicalNowMs;
	if (pt > state.lastPhysicalMs) {
		state.lastPhysicalMs = pt;
		state.counter = 0;
	} else {
		state.counter++;
	}
	return formatHLC(state.lastPhysicalMs, state.counter, state.nodeId);
}

export function receiveHLC(state: HLCState, remoteHlc: string, physicalNowMs: number = clockNow(state)): string {
	const parsed = parseHLC(remoteHlc);
	if (!parsed) {
		return nowHLC(state, physicalNowMs);
	}

	const pt = physicalNowMs;
	const maxTs = Math.max(pt, state.lastPhysicalMs, parsed.timestampMs);

	if (maxTs === state.lastPhysicalMs && maxTs === parsed.timestampMs) {
		state.counter = Math.max(state.counter, parsed.counter) + 1;
	} else if (maxTs === state.lastPhysicalMs) {
		state.counter++;
	} else if (maxTs === parsed.timestampMs) {
		state.counter = parsed.counter + 1;
	} else {
		state.counter = 0;
	}

	state.lastPhysicalMs = maxTs;
	return formatHLC(state.lastPhysicalMs, state.counter, state.nodeId);
}

/**
 * Compare two HLC strings lexicographically.
 * Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compareHLC(a: string, b: string): -1 | 0 | 1 {
	if (a === b) return 0;
	if (!a) return -1;
	if (!b) return 1;
	return a < b ? -1 : 1;
}

/**
 * How far ahead of the server clock a client stamp may be before the server folds it back.
 * A real clock drifts by seconds, so a minute of tolerance is plenty; a larger window would
 * park accepted stamps in the future for that whole window.
 */
export const MAX_HLC_FUTURE_SKEW_MS = 60_000;

/**
 * Fold a stamp whose physical time is more than `maxSkewMs` past `serverNowMs` back to
 * `serverNowMs` itself, keeping counter and node id so the tie-break stays stable.
 *
 * The fold target is the server clock, not the tolerance ceiling. A stamp parked at the
 * ceiling sits in the future for the rest of the window, so every normal edit of that same
 * row during that window compares older, loses the LWW guard and is rejected as stale —
 * the row would stay unwritable for the length of the window.
 *
 * An unparseable or in-range stamp is returned unchanged.
 */
export function canonicalizeHLC(
	hlc: string,
	serverNowMs: number,
	maxSkewMs: number = MAX_HLC_FUTURE_SKEW_MS
): string {
	const parsed = parseHLC(hlc);
	if (!parsed || parsed.timestampMs <= serverNowMs + maxSkewMs) return hlc;
	return formatHLC(serverNowMs, parsed.counter, parsed.nodeId);
}
