/**
 * Pure formatting for the settings sync-diagnostics panel.
 *
 * Runes-free and IDB-free so the panel's copy/ordering rules stay unit-testable:
 * `+page.svelte` only opens the ledger DB, hands the raw rows here, and renders.
 */
import type { OutboxRecord } from './idb';
import type { SyncStatus } from '../sync/backoff';

/** Rows rendered in the panel table; anything beyond this is only counted. */
export const OUTBOX_TABLE_LIMIT = 20;

export interface OutboxRow {
	id: string;
	table: string;
	op: string;
	entityId: string;
	ageLabel: string;
	retryCount: number;
}

export interface CursorInfo {
	/** Raw cursor, or `belum ada` when the store has never been written. */
	value: string;
	/** Age of the cursor watermark, or `null` when the raw value is not a timestamp. */
	ageLabel: string | null;
}

const STATUS_LABELS: Record<SyncStatus, string> = {
	idle: 'menganggur',
	syncing: 'menyinkronkan',
	error: 'galat',
	offline: 'luring'
};

/** Cursor below this is not an epoch-ms watermark (2001-09-09) — show it raw. */
const EPOCH_MS_FLOOR = 1_000_000_000_000;

export function syncStatusLabel(status: SyncStatus): string {
	return STATUS_LABELS[status];
}

/** Human, Indonesian, relative age. `-` for a missing/unparseable timestamp. */
export function formatRelativeId(iso: string | null | undefined, now: number = Date.now()): string {
	if (!iso) return '-';
	const at = Date.parse(iso);
	if (Number.isNaN(at)) return '-';
	const diff = now - at;
	if (diff < 60_000) return 'baru saja';
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	return `${Math.floor(hours / 24)} hari lalu`;
}

/**
 * Newest first, capped at `limit`. `total` is the full outbox depth so the panel
 * can say how much of the queue it is showing.
 */
export function buildOutboxRows(
	records: readonly OutboxRecord[],
	now: number = Date.now(),
	limit: number = OUTBOX_TABLE_LIMIT
): { rows: OutboxRow[]; total: number } {
	const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const rows = sorted.slice(0, limit).map((record) => ({
		id: record.id,
		table: record.table,
		op: record.op,
		entityId: record.entityId,
		ageLabel: formatRelativeId(record.createdAt, now),
		retryCount: record.retryCount ?? 0
	}));
	return { rows, total: records.length };
}

/**
 * The engine writes `sync_meta.cursor` only, so there is no stored "last advanced
 * at" field to read (adding one would mean a schema change). The cursor itself is
 * `max(serverNow, maxDelta)`, i.e. the server watermark of the last successful
 * cycle, so its own age is the closest honest answer to "how stale is the pull".
 */
export function describeCursor(cursor: number | null | undefined, now: number = Date.now()): CursorInfo {
	if (typeof cursor !== 'number' || !Number.isFinite(cursor) || cursor <= 0) {
		return { value: 'belum ada', ageLabel: null };
	}
	if (cursor < EPOCH_MS_FLOOR) {
		return { value: String(cursor), ageLabel: null };
	}
	return { value: String(cursor), ageLabel: formatRelativeId(new Date(cursor).toISOString(), now) };
}
