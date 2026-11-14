import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SQLite Triggers & O(1) Rollup Invariants', () => {
	let db: DatabaseSync;

	beforeEach(() => {
		db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON;');

		// Apply initial schema (table creation)
		const migration0000 = readFileSync(
			join(__dirname, '../../drizzle/0000_useful_black_widow.sql'),
			'utf-8'
		);
		const statements0 = migration0000.split('--> statement-breakpoint');
		for (const stmt of statements0) {
			const clean = stmt.trim();
			if (clean) {
				db.exec(clean);
			}
		}

		// Apply HLC / Triggers migration
		const migration0002 = readFileSync(
			join(__dirname, '../../drizzle/0002_hlc_sync_rollups_triggers.sql'),
			'utf-8'
		);
		const statements2 = migration0002.split('--> statement-breakpoint');
		for (const stmt of statements2) {
			const clean = stmt.trim();
			if (clean) {
				db.exec(clean);
			}
		}

		// Seed a test user and wallets
		db.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
			VALUES ('u1', 'Test User', 'test@example.com', 1, 1000, 1000);

			INSERT INTO wallets (id, user_id, name, type, initial_balance, current_balance, hlc, server_updated_at, created_at)
			VALUES ('w1', 'u1', 'Cash', 'cash', 100000, 100000, 'hlc-w1', 1000, '2025-01-01T00:00:00Z');

			INSERT INTO wallets (id, user_id, name, type, initial_balance, current_balance, hlc, server_updated_at, created_at)
			VALUES ('w2', 'u1', 'Bank', 'bank', 500000, 500000, 'hlc-w2', 1000, '2025-01-01T00:00:00Z');
		`);
	});

	afterEach(() => {
		db.close();
	});

	it('maintains wallets.current_balance on income and expense insert', () => {
		// Insert income 50,000 into w1
		db.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('tx1', 'u1', 'w1', 'income', 50000, '2025-01-10T10:00:00Z', 'hlc-tx1', 1000, '2025-01-10', '2025-01-10');
		`);

		const w1 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };
		expect(w1.current_balance).toBe(150000);

		// Insert expense 20,000 from w1
		db.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('tx2', 'u1', 'w1', 'expense', 20000, '2025-01-11T10:00:00Z', 'hlc-tx2', 1001, '2025-01-11', '2025-01-11');
		`);

		const w1After = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };
		expect(w1After.current_balance).toBe(130000);
	});

	it('maintains both wallets atomically on transfer insert', () => {
		// Transfer 40,000 from w2 to w1
		db.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, transfer_wallet_id, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('tx_trf', 'u1', 'w2', 'transfer', 40000, 'w1', '2025-01-12T10:00:00Z', 'hlc-trf', 1002, '2025-01-12', '2025-01-12');
		`);

		const w2 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w2') as { current_balance: number };
		const w1 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };

		expect(w2.current_balance).toBe(460000);
		expect(w1.current_balance).toBe(140000);
	});

	it('reverses balance on soft-delete (deleted_at IS NOT NULL) via update trigger', () => {
		db.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('tx_del', 'u1', 'w1', 'expense', 30000, '2025-01-15T10:00:00Z', 'hlc-1', 1000, '2025-01-15', '2025-01-15');
		`);

		let w1 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };
		expect(w1.current_balance).toBe(70000);

		// Soft delete with new HLC
		db.exec(`
			UPDATE transactions
			SET deleted_at = '2025-01-16T00:00:00Z', hlc = 'hlc-2', server_updated_at = 1005
			WHERE id = 'tx_del';
		`);

		w1 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };
		// Expense reversed -> balance returns to 100,000
		expect(w1.current_balance).toBe(100000);
	});

	it('idempotent replay with identical HLC DOES NOT double-fire triggers', () => {
		db.exec(`
			INSERT INTO transactions (id, user_id, wallet_id, type, amount, occurred_at, hlc, server_updated_at, created_at, updated_at)
			VALUES ('tx_idem', 'u1', 'w1', 'income', 25000, '2025-01-20T10:00:00Z', 'hlc-fixed', 1000, '2025-01-20', '2025-01-20');
		`);

		let w1 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };
		expect(w1.current_balance).toBe(125000);

		// Simulate client replay with same HLC
		db.exec(`
			UPDATE transactions
			SET amount = 25000, hlc = 'hlc-fixed'
			WHERE id = 'tx_idem';
		`);

		w1 = db.prepare('SELECT current_balance FROM wallets WHERE id = ?').get('w1') as { current_balance: number };
		expect(w1.current_balance).toBe(125000);
	});
});
