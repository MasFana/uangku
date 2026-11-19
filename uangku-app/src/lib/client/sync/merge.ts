import { compareHLC } from '$lib/shared/hlc';
import type {
	CategoryDTO,
	SyncRejectedMutation,
	TransactionDTO,
	WalletDTO
} from '$lib/shared/sync-contract';

/** Plain rows for the three synced tables; no IDB, no runes, no I/O. */
export interface LocalState {
	wallets: WalletDTO[];
	categories: CategoryDTO[];
	transactions: TransactionDTO[];
}

export type SyncTable = 'wallets' | 'categories' | 'transactions';

/** One row the merge decided to overwrite, i.e. the rows the caller must persist. */
export interface ChangedRow {
	table: SyncTable;
	id: string;
}

export interface MergeResult {
	merged: LocalState;
	changedIds: ChangedRow[];
	/**
	 * Forced ids whose server version was actually applied this pass (the local store
	 * now holds the server's row). The caller drops exactly these from the persisted
	 * force set; a forced id missing from the delta stays in it for the next pull.
	 */
	adoptedForceIds: string[];
}

interface Row {
	id: string;
	hlc: string;
	serverUpdatedAt: number;
	deletedAt: string | null;
}

/**
 * LWW merge for one table.
 *
 * Rules (deliberate, and the only copy of them in the codebase):
 * - an incoming row wins only when `compareHLC(incoming, local) > 0`, so an older
 *   server row never clobbers a newer local optimistic write that has not synced yet;
 *   a stale server row therefore also leaves `serverUpdatedAt` untouched (still pending);
 * - equal HLC = the same logical write echoed back by the server. Content is NOT
 *   taken, but the server's `serverUpdatedAt` watermark IS adopted: that stamp is the
 *   acknowledgement a locally-created row needs to stop being "pending". Such a row is
 *   reported in `changedIds` (we chose "changedIds = rows the caller must persist",
 *   rather than a second, unconditional write path), and only when the stamp actually
 *   differs — a pure echo with the same `serverUpdatedAt` stays a no-op;
 * - ids absent from the delta are left untouched (the local array is returned as-is,
 *   same reference, so untouched tables cost nothing);
 * - `deletedAt != null` is NOT special-cased: a tombstone is applied like any other
 *   row, and the callers' reactive arrays stay filtered views (`!deletedAt`) so a
 *   tombstone from another device simply drops the row from the active set.
 * - a delta that repeats an id applies the last strictly-newer variant (server deltas
 *   are unique per id; this just keeps the function total).
 * - `forceIds` (ids the server rejected from this client) bypass the clock entirely:
 *   whatever version the server holds IS the truth, so the incoming row replaces the
 *   local one — content and metadata — even when the local hlc is newer. That is the
 *   only rule that can converge a rejected push, because the rejected write by
 *   definition carries the newer hlc and so would win LWW forever.
 */
function mergeTable<T extends Row>(
	local: T[],
	delta: T[],
	table: SyncTable,
	changedIds: ChangedRow[],
	forceIds: ReadonlySet<string>,
	adoptedForceIds: string[]
): T[] {
	if (delta.length === 0) return local;

	const merged = new Map<string, T>();
	for (const row of local) merged.set(row.id, row);

	const applied = new Set<string>();
	const markApplied = (id: string) => {
		if (applied.has(id)) return;
		applied.add(id);
		changedIds.push({ table, id });
	};
	for (const incoming of delta) {
		const current = merged.get(incoming.id);
		if (forceIds.has(incoming.id)) {
			merged.set(incoming.id, incoming);
			markApplied(incoming.id);
			if (!adoptedForceIds.includes(incoming.id)) adoptedForceIds.push(incoming.id);
			continue;
		}
		if (!current) {
			merged.set(incoming.id, incoming);
			markApplied(incoming.id);
			continue;
		}
		const order = compareHLC(incoming.hlc, current.hlc);
		if (order > 0) {
			merged.set(incoming.id, incoming);
			markApplied(incoming.id);
		} else if (order === 0 && incoming.serverUpdatedAt !== current.serverUpdatedAt) {
			// Same logical write: keep local content, adopt the server's ack stamp.
			merged.set(incoming.id, { ...current, serverUpdatedAt: incoming.serverUpdatedAt });
			markApplied(incoming.id);
		}
	}

	return applied.size === 0 ? local : [...merged.values()];
}

/**
 * Merge a server delta into local state by HLC last-write-wins.
 * Pure: no IndexedDB, no `$state`, same input → same output.
 *
 * `forceIds` are the entity ids this client pushed and the server rejected; see
 * `mergeTable` — they ignore the clocks and adopt the server row.
 */
export function mergeDelta(
	local: LocalState,
	delta: LocalState,
	forceIds: ReadonlySet<string> = new Set<string>()
): MergeResult {
	const changedIds: ChangedRow[] = [];
	const adoptedForceIds: string[] = [];
	return {
		merged: {
			wallets: mergeTable(local.wallets, delta.wallets, 'wallets', changedIds, forceIds, adoptedForceIds),
			categories: mergeTable(
				local.categories,
				delta.categories,
				'categories',
				changedIds,
				forceIds,
				adoptedForceIds
			),
			transactions: mergeTable(
				local.transactions,
				delta.transactions,
				'transactions',
				changedIds,
				forceIds,
				adoptedForceIds
			)
		},
		changedIds,
		adoptedForceIds
	};
}

/** What the engine persists after a cycle so a rejection survives a restart/abort. */
export interface ForceServerPlan {
	/** Ids to persist for the next pull; empty = drop the `sync_meta` key. */
	persist: string[];
	/** True when the cursor must be dropped, so the next pull re-delivers everything. */
	resetCursor: boolean;
}

/** Tolerant read of the persisted `sync_meta` value: any non-array/garbage reads as empty. */
export function parseForceServerIds(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((id): id is string => typeof id === 'string' && id !== '');
	} catch {
		return [];
	}
}

/**
 * Force set for the next pull. Ids this cycle rejected are added, ids whose server
 * row actually arrived are dropped (adoption always wins over a re-rejection: the
 * rejection is what produced that row).
 *
 * Unresolved ids need the server row, which may sit *below* the cursor and would
 * never be re-delivered, so the cursor is dropped to force one full re-pull. A pull
 * that was already full (`clientCursor === 0`) proves the server has no such row —
 * nothing left to adopt, so the ids are dropped too. Without that stop the cursor
 * would be reset on every cycle forever (a row that exists nowhere in the delta).
 */
export function planForceServerIds(
	prev: readonly string[],
	adopted: readonly string[],
	rejected: readonly string[],
	clientCursor: number
): ForceServerPlan {
	const next = new Set<string>(prev);
	for (const id of rejected) if (id) next.add(id);
	for (const id of adopted) next.delete(id);
	if (next.size === 0) return { persist: [], resetCursor: false };
	// Already a full pull this cycle: the ids are absent server-side, so stop holding
	// them and leave the (now correct) cursor alone.
	if (clientCursor === 0) return { persist: [], resetCursor: false };
	return { persist: [...next], resetCursor: true };
}

/**
 * `conflictNotice` text for a cycle: the rejected/canonicalized count, or null when the
 * pull carried neither (which is what clears the notice). Kept here, next to the
 * force-set rules, as the single copy of the wording — and so it is testable without
 * the runes shell. A clamped stamp means the write WAS applied, so the wording says so.
 */
export function rejectionNotice(rejected: readonly SyncRejectedMutation[]): string | null {
	if (rejected.length === 0) return null;
	if (rejected.some((entry) => entry.reason === 'clock_skew')) {
		return `${rejected.length} perubahan disesuaikan ke jam server (jam perangkat Anda berbeda)`;
	}
	return `${rejected.length} perubahan ditolak server; versi server dipakai`;
}

/** Clock offset sample: how far the device clock is ahead of the server, and the round trip it was measured at. */
export interface ClockSample {
	offsetMs: number;
	rttMs: number;
}

/**
 * Best-of-window estimator: keep the sample measured on the smallest round trip, since
 * that is the least asymmetric estimate. Ties keep `current`, and the first sample is
 * always accepted.
 */
export function pickClockSample(current: ClockSample | null, candidate: ClockSample): ClockSample {
	if (!current || candidate.rttMs < current.rttMs) return candidate;
	return current;
}

/**
 * Device clock error from one exchange: the server clock minus the request mid-point
 * (`sentAtMs + rttMs / 2`), i.e. what the server would have read at send time.
 */
export function clockOffsetFrom(serverNow: number, sentAtMs: number, rttMs: number): number {
	return serverNow - (sentAtMs + rttMs / 2);
}
