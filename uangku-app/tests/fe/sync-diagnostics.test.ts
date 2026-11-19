import { describe, expect, it } from 'vitest';
import {
	OUTBOX_TABLE_LIMIT,
	buildOutboxRows,
	describeCursor,
	formatRelativeId,
	syncStatusLabel
} from '../../src/lib/client/db/sync-diagnostics';
import type { OutboxRecord } from '../../src/lib/client/db/idb';

const NOW = Date.parse('2026-11-19T12:00:00.000Z');

function rec(
	id: string,
	createdAt: string,
	over: Partial<OutboxRecord> = {}
): OutboxRecord {
	return {
		id,
		entityId: `tx_${id}`,
		table: 'transactions',
		op: 'UPSERT',
		hlc: `hlc-${id}`,
		payload: {},
		createdAt,
		retryCount: 0,
		...over
	};
}

describe('formatRelativeId', () => {
	it('labels a missing or unparseable timestamp as -', () => {
		expect(formatRelativeId(null, NOW)).toBe('-');
		expect(formatRelativeId('', NOW)).toBe('-');
		expect(formatRelativeId('bukan-tanggal', NOW)).toBe('-');
	});

	it('floors everything under a minute, including clock skew, to baru saja', () => {
		expect(formatRelativeId('2026-11-19T11:59:59.000Z', NOW)).toBe('baru saja');
		expect(formatRelativeId('2026-11-19T11:59:30.000Z', NOW)).toBe('baru saja');
		expect(formatRelativeId('2026-11-19T12:05:00.000Z', NOW)).toBe('baru saja');
	});

	it('steps minutes, hours, days', () => {
		expect(formatRelativeId('2026-11-19T11:59:00.000Z', NOW)).toBe('1 menit lalu');
		expect(formatRelativeId('2026-11-19T11:58:00.000Z', NOW)).toBe('2 menit lalu');
		expect(formatRelativeId('2026-11-19T11:01:00.000Z', NOW)).toBe('59 menit lalu');
		expect(formatRelativeId('2026-11-19T11:00:00.000Z', NOW)).toBe('1 jam lalu');
		expect(formatRelativeId('2026-11-19T00:30:00.000Z', NOW)).toBe('11 jam lalu');
		expect(formatRelativeId('2026-11-18T12:00:00.000Z', NOW)).toBe('1 hari lalu');
		expect(formatRelativeId('2026-11-09T12:00:00.000Z', NOW)).toBe('10 hari lalu');
	});
});

describe('buildOutboxRows', () => {
	it('reports an empty outbox as zero rows and zero total', () => {
		expect(buildOutboxRows([], NOW)).toEqual({ rows: [], total: 0 });
	});

	it('sorts newest first and maps the table columns', () => {
		const older = rec('a', '2026-11-19T11:00:00.000Z', { table: 'wallets', op: 'DELETE' });
		const newer = rec('b', '2026-11-19T11:59:30.000Z', {
			table: 'categories',
			op: 'UPSERT',
			retryCount: 3
		});
		const { rows, total } = buildOutboxRows([older, newer], NOW);
		expect(total).toBe(2);
		expect(rows).toEqual([
			{
				id: 'b',
				table: 'categories',
				op: 'UPSERT',
				entityId: 'tx_b',
				ageLabel: 'baru saja',
				retryCount: 3
			},
			{
				id: 'a',
				table: 'wallets',
				op: 'DELETE',
				entityId: 'tx_a',
				ageLabel: '1 jam lalu',
				retryCount: 0
			}
		]);
	});

	it('caps rendered rows at the limit but keeps the full total', () => {
		const many = Array.from({ length: OUTBOX_TABLE_LIMIT + 5 }, (_, i) =>
			rec(String(i).padStart(2, '0'), `2026-11-19T11:${String(i % 60).padStart(2, '0')}:00.000Z`)
		);
		const { rows, total } = buildOutboxRows(many, NOW);
		expect(rows).toHaveLength(OUTBOX_TABLE_LIMIT);
		expect(total).toBe(OUTBOX_TABLE_LIMIT + 5);
	});

	it('does not mutate the caller array', () => {
		const input = [rec('a', '2026-11-19T11:00:00.000Z'), rec('b', '2026-11-19T11:59:00.000Z')];
		buildOutboxRows(input, NOW);
		expect(input.map((r) => r.id)).toEqual(['a', 'b']);
	});
});

describe('describeCursor', () => {
	it('labels an absent or zero cursor as belum ada', () => {
		expect(describeCursor(null, NOW)).toEqual({ value: 'belum ada', ageLabel: null });
		expect(describeCursor(undefined, NOW)).toEqual({ value: 'belum ada', ageLabel: null });
		expect(describeCursor(0, NOW)).toEqual({ value: 'belum ada', ageLabel: null });
		expect(describeCursor(Number.NaN, NOW)).toEqual({ value: 'belum ada', ageLabel: null });
	});

	it('shows a non-timestamp cursor raw, without an age', () => {
		expect(describeCursor(42, NOW)).toEqual({ value: '42', ageLabel: null });
	});

	it('shows an epoch watermark raw plus its relative age', () => {
		expect(describeCursor(NOW - 5 * 60_000, NOW)).toEqual({
			value: String(NOW - 5 * 60_000),
			ageLabel: '5 menit lalu'
		});
		expect(describeCursor(NOW + 30_000, NOW)).toEqual({
			value: String(NOW + 30_000),
			ageLabel: 'baru saja'
		});
	});
});

describe('syncStatusLabel', () => {
	it('covers every SyncStatus', () => {
		expect(['idle', 'syncing', 'error', 'offline'].map((s) => syncStatusLabel(s as never))).toEqual([
			'menganggur',
			'menyinkronkan',
			'galat',
			'luring'
		]);
	});
});
