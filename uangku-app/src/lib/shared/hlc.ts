/**
 * Deterministic Hybrid Logical Clock (HLC) Implementation
 * Format: `${timestampMs.toString(36).padStart(9, '0')}-${counter.toString(36).padStart(4, '0')}-${nodeId}`
 * Resolves Last-Write-Wins (LWW) conflict per row across offline clients and server.
 */

export interface HLCState {
	nodeId: string;
	lastPhysicalMs: number;
	counter: number;
}

export function createHLCState(nodeId: string): HLCState {
	// Sanitize nodeId to alphanumeric
	const cleanNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'node0';
	return {
		nodeId: cleanNodeId,
		lastPhysicalMs: 0,
		counter: 0
	};
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

export function nowHLC(state: HLCState, physicalNowMs: number = Date.now()): string {
	const pt = physicalNowMs;
	if (pt > state.lastPhysicalMs) {
		state.lastPhysicalMs = pt;
		state.counter = 0;
	} else {
		state.counter++;
	}
	return formatHLC(state.lastPhysicalMs, state.counter, state.nodeId);
}

export function receiveHLC(state: HLCState, remoteHlc: string, physicalNowMs: number = Date.now()): string {
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
