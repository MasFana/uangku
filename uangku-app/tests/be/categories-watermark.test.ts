import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { CategoriesRepo } from '../../src/lib/server/repos/categories';
import { seedDefaultsForUser } from '../../src/lib/server/services/categories';
import type { AppDatabase } from '../../src/lib/server/db/client';

// Self-contained: no shared helpers (another slice writes its own tests/be file).
const MIGRATIONS = [
	'0000_useful_black_widow.sql',
	'0001_backfill_default_categories.sql',
	'0002_hlc_sync_rollups_triggers.sql',
	'0003_category_watermark_scoped_triggers.sql'
];

function applyMigrations(db: DatabaseSync) {
	for (const file of MIGRATIONS) {
		const sql = readFileSync(join(__dirname, '../../drizzle', file), 'utf-8');
		for (const stmt of sql.split('--> statement-breakpoint')) {
			const clean = stmt.trim();
			if (clean) db.exec(clean);
		}
	}
}

/** Real Drizzle query builder over the in-memory sqlite, so the repo path is exercised verbatim. */
function rawToDrizzle(raw: DatabaseSync): AppDatabase {
	// Drizzle's sqlite-proxy maps rows by column index, so hand it positional arrays.
	const callback = async (sql: string, params: unknown[], method: string) => {
		const stmt = raw.prepare(sql);
		const args = params as never[];
		const toArray = (row: unknown) => Object.values(row as Record<string, unknown>);
		if (method === 'all' || method === 'values') {
			return { rows: (stmt.all(...args) as unknown[]).map(toArray) } as never;
		}
		if (method === 'get') {
			const row = stmt.get(...args);
			return { rows: row ? toArray(row) : null } as never;
		}
		stmt.run(...args);
		return { rows: [] } as never;
	};
	return drizzle(callback) as unknown as AppDatabase;
}

describe('Category sync watermark + user-scoped wallet triggers', () => {
	let raw: DatabaseSync;

	beforeEach(() => {
		raw = new DatabaseSync(':memory:');
		raw.exec('PRAGMA foreign_keys = ON;');
		applyMigrations(raw);
		raw.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
			VALUES
				('userA', 'A', 'a@example.com', 1, 1000, 1000),
				('userB', 'B', 'b@example.com', 1, 1000, 1000);

			INSERT INTO wallets (id, user_id, name, type, initial_balance, current_balance, hlc, server_updated_at, created_at)
			VALUES ('wA', 'userA', 'Cash', 'cash', 100000, 100000, 'hlc-wA', 1000, '2025-01-01T00:00:00Z');
		`);
	});

	afterEach(() => {
		raw.close();
	});

	it('repo.create stamps hlc + server_updated_at so the row is delta-visible', async () => {
		const repo = new CategoriesRepo(rawToDrizzle(raw));
		const created = await repo.create('userA', { name: 'Kopi', kind: 'expense' });

		expect(created.hlc).not.toBe('');
		expect(created.serverUpdatedAt).toBeGreaterThan(0);

		// Delta query shape used by the sync endpoint: gt(server_updated_at, cursor)
		const delta = raw
			.prepare('SELECT id FROM categories WHERE user_id = ? AND server_updated_at > 0')
			.all('userA') as { id: string }[];
		expect(delta.map((r) => r.id)).toContain(created.id);
	});

	it('update / archive / unarchive each bump the watermark', async () => {
		const repo = new CategoriesRepo(rawToDrizzle(raw));
		const created = await repo.create('userA', { name: 'Kopi', kind: 'expense' });

		const updated = await repo.update('userA', created.id, { name: 'Kopi Susu' });
		expect(updated?.serverUpdatedAt).toBeGreaterThan(0);
		expect(updated?.hlc).not.toBe('');

		await repo.archive('userA', created.id);
		await repo.unarchive('userA', created.id);

		const row = raw
			.prepare('SELECT hlc, server_updated_at FROM categories WHERE id = ?')
			.get(created.id) as { hlc: string; server_updated_at: number };
		expect(row.server_updated_at).toBeGreaterThan(0);
		expect(row.hlc).not.toBe('');
	});

	it('seedDefaultsForUser stamps every seeded row', async () => {
		const db = rawToDrizzle(raw);
		const count = await seedDefaultsForUser(db, 'userA');
		expect(count).toBeGreaterThan(0);

		const notStamped = raw
			.prepare(
				'SELECT COUNT(*) AS c FROM categories WHERE user_id = ? AND (server_updated_at = 0 OR hlc = ?)'
			)
			.get('userA', '') as { c: number };
		expect(notStamped.c).toBe(0);
	});

	it('wallet triggers are user-scoped: cross-account push does not touch another user\u2019s balance', () => {
		// userB pushes a transaction that references userA's wallet.
		raw.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('txCross', 'userB', 'wA', 'expense', 50000, '2025-02-01T00:00:00Z', 'hlc-cross', 1001, '2025-02-01', '2025-02-01');
		`);

		const wA = raw.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('wA') as {
			current_balance: number;
		};
		expect(wA.current_balance).toBe(100000);
	});

	it('trigger still applies for the wallet owner (control)', () => {
		raw.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('txOwn', 'userA', 'wA', 'expense', 30000, '2025-02-02T00:00:00Z', 'hlc-own', 1001, '2025-02-02', '2025-02-02');
		`);

		const wA = raw.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('wA') as {
			current_balance: number;
		};
		expect(wA.current_balance).toBe(70000);
	});
});
