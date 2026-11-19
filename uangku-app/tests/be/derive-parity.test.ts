import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CategoryDTO, TransactionDTO, WalletDTO } from '../../src/lib/shared/sync-contract';
import {
	deriveAnalytics,
	deriveDashboard,
	deriveWalletBalances,
	filterTransactions,
	resolvePeriodBounds
} from '../../src/lib/client/derive';
import { resolveTransactionPeriod } from '../../src/lib/server/period';
import { generateBuckets, getBucketKeyForDate, resolveAnalyticsRange, resolveGranularity } from '../../src/lib/server/stats';

/**
 * Contract test: the client-side derivations must equal what D1 computes for the same rows.
 * Ground truth is (a) the migration's own backfill aggregate, (b) the trigger-maintained
 * `wallets.current_balance` columns, and (c) plain SQL aggregates mirroring the server repos.
 */

type SqlParam = string | number | null;

const NOW = new Date('2026-11-15T09:30:00.000Z');
const USER_ID = 'u1';
const TX_COUNT = 240;

type TxRow = {
	id: string;
	walletId: string;
	categoryId: string | null;
	type: 'expense' | 'income' | 'transfer';
	amount: number;
	transferWalletId: string | null;
	note: string | null;
	occurredAt: string;
	deletedAt: string | null;
	hlc: string;
};

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** Deterministic PRNG so the dataset — and therefore every assertion — is reproducible. */
function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const walletIds = ['w1', 'w2', 'w3'];
const expenseCategories = ['c1', 'c2', 'c3'];
const incomeCategories = ['c4', 'c5'];

const wallets: Array<{ id: string; name: string; type: string; initialBalance: number; archived: boolean; deletedAt: string | null }> = [
	{ id: 'w1', name: 'Tunai', type: 'cash', initialBalance: 100_000, archived: false, deletedAt: null },
	{ id: 'w2', name: 'Bank BCA', type: 'bank', initialBalance: 500_000, archived: false, deletedAt: null },
	{ id: 'w3', name: 'E-Wallet', type: 'ewallet', initialBalance: 0, archived: false, deletedAt: null },
	{ id: 'w4', name: 'Dompet Lama', type: 'other', initialBalance: 70_000, archived: true, deletedAt: null },
	{ id: 'w5', name: 'Dompet Terhapus', type: 'other', initialBalance: 40_000, archived: false, deletedAt: '2026-11-01T00:00:00.000Z' }
];

const categories: Array<{ id: string; name: string; kind: 'expense' | 'income'; color: string | null; archived: boolean; deletedAt: string | null }> = [
	{ id: 'c1', name: 'Makan & Minum', kind: 'expense', color: '#0f766e', archived: false, deletedAt: null },
	{ id: 'c2', name: 'Transportasi', kind: 'expense', color: '#1d4ed8', archived: false, deletedAt: null },
	{ id: 'c3', name: 'Belanja Harian', kind: 'expense', color: '#c2410c', archived: false, deletedAt: null },
	{ id: 'c4', name: 'Gaji', kind: 'income', color: '#15803d', archived: false, deletedAt: null },
	{ id: 'c5', name: 'Bonus', kind: 'income', color: null, archived: false, deletedAt: null },
	{ id: 'c6', name: 'Kategori Arsip', kind: 'expense', color: null, archived: true, deletedAt: null },
	{ id: 'c7', name: 'Kategori Terhapus', kind: 'income', color: null, archived: false, deletedAt: '2026-11-02T00:00:00.000Z' }
];

/** Rows as they are finally stored (deleted/updated state applied), plus the SQL mutations to replay. */
function buildDataset(): {
	rows: TxRow[];
	softDeletes: Array<{ id: string; deletedAt: string; hlc: string }>;
	amountUpdates: Array<{ id: string; amount: number; hlc: string }>;
} {
	const random = mulberry32(0xc0ffee);
	const rows: TxRow[] = [];
	const softDeletes: Array<{ id: string; deletedAt: string; hlc: string }> = [];
	const amountUpdates: Array<{ id: string; amount: number; hlc: string }> = [];

	for (let i = 0; i < TX_COUNT; i++) {
		const monthOffset = i % 7;
		const monthDate = new Date(Date.UTC(2026, 4 + monthOffset, 1));
		const ym = `${monthDate.getUTCFullYear()}-${pad2(monthDate.getUTCMonth() + 1)}`;
		const occurredAt = `${ym}-${pad2(1 + Math.floor(random() * 28))}T${pad2(Math.floor(random() * 24))}:${pad2(Math.floor(random() * 60))}:00.000Z`;
		const roll = random();
		const type: TxRow['type'] = roll < 0.45 ? 'expense' : roll < 0.85 ? 'income' : 'transfer';
		const amount = 1_000 + Math.floor(random() * 500_000);
		const walletIndex = Math.floor(random() * 3);
		const id = `tx-${String(i).padStart(3, '0')}`;

		rows.push({
			id,
			walletId: walletIds[walletIndex],
			categoryId:
				type === 'transfer'
					? null
					: type === 'expense'
						? expenseCategories[Math.floor(random() * expenseCategories.length)]
						: incomeCategories[Math.floor(random() * incomeCategories.length)],
			type,
			amount,
			transferWalletId:
				type === 'transfer' ? walletIds[(walletIndex + 1 + Math.floor(random() * 2)) % 3] : null,
			note: i % 3 === 0 ? null : `catatan ${i}`,
			occurredAt,
			deletedAt: null,
			hlc: `hlc-${id}`
		});
	}

	// Soft-delete every 10th row (Exercises the trigger's OLD revert path).
	for (const row of rows.filter((_, i) => i % 10 === 0)) {
		row.deletedAt = '2026-12-01T00:00:00.000Z';
		row.hlc = `hlc-del-${row.id}`;
		softDeletes.push({ id: row.id, deletedAt: row.deletedAt, hlc: row.hlc });
	}

	// Re-amount every 20th surviving row.
	for (const row of rows.filter((_, i) => i % 20 === 5)) {
		row.amount += 7_000;
		row.hlc = `hlc-up-${row.id}`;
		amountUpdates.push({ id: row.id, amount: row.amount, hlc: row.hlc });
	}

	return { rows, softDeletes, amountUpdates };
}

const dataset = buildDataset();

const txDtos: TransactionDTO[] = dataset.rows.map((row) => ({
	id: row.id,
	userId: USER_ID,
	walletId: row.walletId,
	categoryId: row.categoryId,
	type: row.type,
	amount: row.amount,
	transferWalletId: row.transferWalletId,
	note: row.note,
	occurredAt: row.occurredAt,
	receiptKey: null,
	hlc: row.hlc,
	serverUpdatedAt: 1_000,
	deletedAt: row.deletedAt,
	createdAt: row.occurredAt,
	updatedAt: row.occurredAt
}));

const walletDtos: WalletDTO[] = wallets.map((w) => ({
	id: w.id,
	userId: USER_ID,
	name: w.name,
	type: w.type as WalletDTO['type'],
	initialBalance: w.initialBalance,
	currentBalance: w.initialBalance,
	icon: null,
	archived: w.archived,
	hlc: `hlc-${w.id}`,
	serverUpdatedAt: 1_000,
	deletedAt: w.deletedAt,
	createdAt: '2026-01-01T00:00:00.000Z'
}));

const categoryDtos: CategoryDTO[] = categories.map((c) => ({
	id: c.id,
	userId: USER_ID,
	name: c.name,
	kind: c.kind,
	icon: null,
	color: c.color,
	archived: c.archived,
	hlc: `hlc-${c.id}`,
	serverUpdatedAt: 1_000,
	deletedAt: c.deletedAt,
	createdAt: '2026-01-01T00:00:00.000Z'
}));

let db: DatabaseSync;

function execMigration(relativePath: string): void {
	const sql = readFileSync(join(__dirname, '../../drizzle/', relativePath), 'utf-8');
	for (const statement of sql.split('--> statement-breakpoint')) {
		const clean = statement.trim();
		if (clean) db.exec(clean);
	}
}

function seedDatabase(): void {
	db.exec(`
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
		VALUES ('${USER_ID}', 'Parity User', 'parity@example.com', 1, 1000, 1000);
	`);

	for (const w of wallets) {
		db.prepare(
			'INSERT INTO wallets (id, user_id, name, type, initial_balance, current_balance, icon, archived, hlc, server_updated_at, deleted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)'
		).run(
			w.id,
			USER_ID,
			w.name,
			w.type,
			w.initialBalance,
			w.initialBalance, // triggers accumulate on top from here
			w.archived ? 1 : 0,
			`hlc-${w.id}`,
			1_000,
			w.deletedAt,
			'2026-01-01T00:00:00.000Z'
		);
	}

	for (const c of categories) {
		db.prepare(
			'INSERT INTO categories (id, user_id, name, kind, icon, color, archived, hlc, server_updated_at, deleted_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)'
		).run(c.id, USER_ID, c.name, c.kind, c.color, c.archived ? 1 : 0, `hlc-${c.id}`, 1_000, c.deletedAt, '2026-01-01T00:00:00.000Z');
	}

	// Insert rows in their pre-mutation state, then let the triggers apply the mutations.
	const originalAmounts = new Map(dataset.amountUpdates.map((u) => [u.id, u]));
	for (const row of dataset.rows) {
		const update = originalAmounts.get(row.id);
		const insertedAmount = update ? update.amount - 7_000 : row.amount;
		db.prepare(
			'INSERT INTO transactions (id, user_id, wallet_id, category_id, type, amount, transfer_wallet_id, note, occurred_at, receipt_key, hlc, server_updated_at, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)'
		).run(
			row.id,
			USER_ID,
			row.walletId,
			row.categoryId,
			row.type,
			insertedAmount,
			row.transferWalletId,
			row.note,
			row.occurredAt,
			`hlc-${row.id}`,
			1_000,
			row.occurredAt,
			row.occurredAt
		);
	}

	for (const update of dataset.amountUpdates) {
		db.prepare('UPDATE transactions SET amount = ?, hlc = ?, server_updated_at = 1001 WHERE id = ?').run(
			update.amount,
			update.hlc,
			update.id
		);
	}
	for (const del of dataset.softDeletes) {
		db.prepare('UPDATE transactions SET deleted_at = ?, hlc = ?, server_updated_at = 1002 WHERE id = ?').run(
			del.deletedAt,
			del.hlc,
			del.id
		);
	}
}

// --- SQL ground truth helpers (same shapes the server repos read) ---

type SqlFilter = { walletId?: string; categoryId?: string; type?: 'income' | 'expense' };

function whereFor(from: string, to: string, filter: SqlFilter, params: SqlParam[]): string {
	let where = 'user_id = ? AND deleted_at IS NULL AND occurred_at >= ? AND occurred_at <= ?';
	params.push(USER_ID, from, to);
	if (filter.walletId) {
		where += ' AND wallet_id = ?';
		params.push(filter.walletId);
	}
	if (filter.categoryId) {
		where += ' AND category_id = ?';
		params.push(filter.categoryId);
	}
	if (filter.type) {
		where += ' AND type = ?';
		params.push(filter.type);
	}
	return where;
}

function sqlTotals(from: string, to: string, filter: SqlFilter = {}): { income: number; expense: number } {
	const params: SqlParam[] = [];
	const where = whereFor(from, to, filter, params);
	const row = db
		.prepare(
			`SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
			        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
			 FROM transactions WHERE ${where}`
		)
		.get(...params) as { income: number; expense: number };
	return { income: Number(row.income), expense: Number(row.expense) };
}

function sqlCount(from: string, to: string, filter: SqlFilter = {}): number {
	const params: SqlParam[] = [];
	const where = whereFor(from, to, filter, params);
	const row = db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE ${where}`).get(...params) as { n: number };
	return Number(row.n);
}

function sqlDayTotals(from: string, to: string, filter: SqlFilter = {}): Map<string, { income: number; expense: number }> {
	const params: SqlParam[] = [];
	const where = whereFor(from, to, filter, params);
	const rows = db
		.prepare(
			`SELECT substr(occurred_at, 1, 10) AS ymd,
			        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
			        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
			 FROM transactions WHERE ${where} GROUP BY ymd`
		)
		.all(...params) as Array<{ ymd: string; income: number; expense: number }>;
	return new Map(rows.map((r) => [r.ymd, { income: Number(r.income), expense: Number(r.expense) }]));
}

function sqlCategoryTotals(
	from: string,
	to: string,
	filter: SqlFilter = {}
): Map<string, { total: number; count: number }> {
	const params: SqlParam[] = [];
	const where = whereFor(from, to, filter, params);
	const rows = db
		.prepare(
			`SELECT COALESCE(category_id, '') AS category_id, SUM(amount) AS total, COUNT(*) AS n
			 FROM transactions WHERE ${where} AND type != 'transfer' GROUP BY COALESCE(category_id, '')`
		)
		.all(...params) as Array<{ category_id: string; total: number; n: number }>;
	return new Map(rows.map((r) => [r.category_id, { total: Number(r.total), count: Number(r.n) }]));
}

function sqlWalletTotals(
	from: string,
	to: string,
	filter: SqlFilter = {}
): Map<string, { income: number; expense: number }> {
	const params: SqlParam[] = [];
	const where = whereFor(from, to, filter, params);
	const rows = db
		.prepare(
			`SELECT wallet_id,
			        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
			        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
			 FROM transactions WHERE ${where} AND type != 'transfer' GROUP BY wallet_id`
		)
		.all(...params) as Array<{ wallet_id: string; income: number; expense: number }>;
	return new Map(rows.map((r) => [r.wallet_id, { income: Number(r.income), expense: Number(r.expense) }]));
}

function sqlLargest(
	from: string,
	to: string,
	filter: SqlFilter = {}
): { amount: number; occurredAt: string; note: string | null; categoryId: string | null } | null {
	const params: SqlParam[] = [];
	const where = whereFor(from, to, filter, params);
	const row = db
		.prepare(
			`SELECT amount, occurred_at, note, category_id FROM transactions WHERE ${where} AND type != 'transfer'
			 ORDER BY amount DESC, occurred_at ASC, id ASC LIMIT 1`
		)
		.get(...params) as { amount: number; occurred_at: string; note: string | null; category_id: string | null } | undefined;
	return row
		? {
			amount: Number(row.amount),
			occurredAt: row.occurred_at,
			note: row.note,
			categoryId: row.category_id
		}
		: null;
}

function sqlRecentIds(limit: number): string[] {
	return (
		db
			.prepare(
				`SELECT id FROM transactions WHERE user_id = ? AND deleted_at IS NULL
				 ORDER BY occurred_at DESC, id DESC LIMIT ?`
			)
			.all(USER_ID, limit) as Array<{ id: string }>
	).map((r) => r.id);
}

function sqlBalanceAggregate(): Map<string, number> {
	const rows = db
		.prepare(
			`SELECT w.id AS id,
			        w.initial_balance + COALESCE((
			            SELECT SUM(CASE
			                WHEN t.type = 'income' THEN t.amount
			                WHEN t.type = 'expense' THEN -t.amount
			                WHEN t.type = 'transfer' AND t.wallet_id = w.id THEN -t.amount
			                WHEN t.type = 'transfer' AND t.transfer_wallet_id = w.id THEN t.amount
			                ELSE 0 END)
			            FROM transactions t
			            WHERE (t.wallet_id = w.id OR t.transfer_wallet_id = w.id) AND t.deleted_at IS NULL
			        ), 0) AS balance
			 FROM wallets w`
		)
		.all() as Array<{ id: string; balance: number }>;
	return new Map(rows.map((r) => [r.id, Number(r.balance)]));
}

function sqlTriggerBalances(): Map<string, number> {
	const rows = db.prepare('SELECT id, current_balance FROM wallets').all() as Array<{
		id: string;
		current_balance: number;
	}>;
	return new Map(rows.map((r) => [r.id, Number(r.current_balance)]));
}

function sortedByName<T extends { name: string }>(rows: T[]): T[] {
	return rows.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function sortedByTotalDesc<T extends { total: number; categoryId: string | null }>(rows: T[]): T[] {
	return rows
		.slice()
		.sort((a, b) =>
			b.total !== a.total ? b.total - a.total : (a.categoryId ?? '') < (b.categoryId ?? '') ? -1 : (a.categoryId ?? '') > (b.categoryId ?? '') ? 1 : 0
		);
}

beforeAll(() => {
	db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;');
	execMigration('0000_useful_black_widow.sql');
	execMigration('0001_backfill_default_categories.sql');
	execMigration('0002_hlc_sync_rollups_triggers.sql');
	seedDatabase();
});

afterAll(() => {
	db.close();
});

describe('derive-parity: dataset sanity', () => {
	it('inserted a multi-month dataset with transfers and soft-deletes', () => {
		const row = db
			.prepare(
				`SELECT COUNT(*) AS total,
				        SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
				        SUM(CASE WHEN type = 'transfer' THEN 1 ELSE 0 END) AS transfers,
				        COUNT(DISTINCT substr(occurred_at, 1, 7)) AS months,
				        COUNT(DISTINCT wallet_id) AS wallets
				 FROM transactions`
			)
			.get() as { total: number; deleted: number; transfers: number; months: number; wallets: number };
		expect(Number(row.total)).toBe(TX_COUNT);
		expect(Number(row.deleted)).toBeGreaterThanOrEqual(20);
		expect(Number(row.transfers)).toBeGreaterThanOrEqual(20);
		expect(Number(row.months)).toBe(7);
		expect(Number(row.wallets)).toBe(3);
	});
});

describe('derive-parity: wallet balances vs D1', () => {
	it('equals the migration backfill aggregate and the trigger-maintained current_balance', () => {
		const aggregate = sqlBalanceAggregate();
		const triggers = sqlTriggerBalances();
		const derived = deriveWalletBalances(walletDtos, txDtos);

		expect(triggers).toEqual(aggregate); // proves aggregate == trigger math
		expect(derived).toEqual(aggregate);
		expect(derived.size).toBe(wallets.length);
	});
});

describe('derive-parity: period boundaries vs server resolver', () => {
	it('resolves every period branch exactly like resolveTransactionPeriod', () => {
		const cases: Array<[string, string | null, string | null]> = [
			['2026-11', null, null],
			['2026-02', null, null], // 28-day month
			['2024-02', null, null], // leap year
			['2026-12', null, null],
			['all', null, null],
			['bogus', null, null],
			['1969-05', null, null], // out of range -> current month
			['custom', '2026-11-05', '2026-11-05'],
			['custom', '2026-11-30', '2026-11-01'], // inverted
			['custom', 'nope', '2026-10-03'], // single valid bound
			['custom', 'nope', 'nope'] // fallback current month
		];

		for (const [period, startDate, endDate] of cases) {
			const server = resolveTransactionPeriod(period, startDate, endDate, NOW);
			expect(resolvePeriodBounds(period, startDate, endDate, NOW)).toEqual({
				period: server.period,
				startDate: server.startDate,
				endDate: server.endDate
			});
		}
	});
});

describe('derive-parity: filterTransactions vs SQL list query', () => {
	it('matches SQL ids, ordering and totals for several filters', () => {
		const cases: Array<{ period: string; filter: Parameters<typeof filterTransactions>[1] }> = [
			{ period: '2026-11', filter: { period: '2026-11' } },
			{ period: '2026-07', filter: { period: '2026-07', type: 'expense' } },
			{ period: 'all', filter: { period: 'all', walletId: 'w2' } },
			{ period: 'all', filter: { period: 'all', categoryId: 'c1', type: 'expense' } },
			{ period: 'custom', filter: { period: 'custom', startDate: '2026-06-01', endDate: '2026-07-15' } },
			{ period: 'all', filter: { period: 'all', page: 3, pageSize: 7 } }
		];

		for (const { filter } of cases) {
			const bounds = resolvePeriodBounds(filter.period, filter.startDate, filter.endDate, NOW);
			const params: SqlParam[] = [USER_ID];
			let where = 'user_id = ? AND deleted_at IS NULL';
			if (bounds.startDate) {
				where += ' AND occurred_at >= ?';
				params.push(`${bounds.startDate}T00:00:00.000Z`);
			}
			if (bounds.endDate) {
				where += ' AND occurred_at <= ?';
				params.push(`${bounds.endDate}T23:59:59.999Z`);
			}
			if (filter.type) {
				where += ' AND type = ?';
				params.push(filter.type);
			}
			if (filter.walletId) {
				where += ' AND wallet_id = ?';
				params.push(filter.walletId);
			}
			if (filter.categoryId) {
				where += ' AND category_id = ?';
				params.push(filter.categoryId);
			}

			const pageSize = Math.min(Math.max(Math.trunc(filter.pageSize ?? 20) || 20, 1), 100);
			const page = Math.max(Math.trunc(filter.page ?? 1) || 1, 1);
			const sqlIds = (
				db
					.prepare(
						`SELECT id FROM transactions WHERE ${where} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`
					)
					.all(...params, pageSize, (page - 1) * pageSize) as Array<{ id: string }>
			).map((r) => r.id);
			const countRow = db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE ${where}`).get(...params) as {
				n: number;
			};
			const sqlTotal = Number(countRow.n);

			const result = filterTransactions(txDtos, filter, NOW);
			expect(result.items.map((t) => t.id)).toEqual(sqlIds);
			expect(result.total).toBe(sqlTotal);
		}
	});
});

describe('derive-parity: deriveAnalytics vs SQL aggregates', () => {
	const queries: Array<{ label: string; query: Parameters<typeof deriveAnalytics>[3]; granularity: string }> = [
		{ label: 'month (day series)', query: { range: 'month' }, granularity: 'day' },
		{ label: 'week', query: { range: 'week' }, granularity: 'day' },
		{ label: 'year (month series)', query: { range: 'year' }, granularity: 'month' },
		{ label: 'all (month series)', query: { range: 'all' }, granularity: 'month' },
		{
			label: 'custom + wallet filter',
			query: { range: 'custom', from: '2026-06-01', to: '2026-08-31', walletId: 'w1' },
			granularity: 'week'
		},
		{ label: 'custom + category filter', query: { range: 'custom', from: '2026-05-01', to: '2026-11-30', categoryId: 'c2' }, granularity: 'day' },
		{ label: 'custom + type filter', query: { range: 'custom', from: '2026-05-01', to: '2026-11-30', type: 'expense' }, granularity: 'month' }
	];

	it.each(queries)('matches totals, series, breakdowns, largest and previous for $label', ({ query }) => {
		const result = deriveAnalytics(txDtos, walletDtos, categoryDtos, query, NOW);

		// Range resolution must equal the server's resolver (single source of truth).
		const earliest = txDtos
			.filter((t) => t.deletedAt == null)
			.map((t) => t.occurredAt)
			.sort()[0];
		const serverRange = resolveAnalyticsRange(query.range, query.from, query.to, query.range === 'all' ? earliest : null, NOW);
		const filters: SqlFilter = {
			walletId: query.walletId?.trim() || undefined,
			categoryId: query.categoryId?.trim() || undefined,
			type: query.type === 'income' || query.type === 'expense' ? query.type : undefined
		};
		const serverGranularity = resolveGranularity(serverRange.range, query.granularity, serverRange.daysCount);

		expect(result.filters.range).toBe(serverRange.range);
		expect(result.filters.from).toBe(serverRange.fromDateStr);
		expect(result.filters.to).toBe(serverRange.toDateStr);
		expect(result.filters.granularity).toBe(serverGranularity);
		expect(result.range).toEqual({ from: serverRange.fromDateStr, to: serverRange.toDateStr });
		expect(result.filters.type).toBe(filters.type ?? 'all');

		// Summary
		const totals = sqlTotals(serverRange.from, serverRange.to, filters);
		expect(result.summary.income).toBe(totals.income);
		expect(result.summary.expense).toBe(totals.expense);
		expect(result.summary.net).toBe(totals.income - totals.expense);
		expect(result.summary.count).toBe(sqlCount(serverRange.from, serverRange.to, filters));
		expect(result.summary.avgPerDay).toBe(Math.round(totals.expense / Math.max(1, serverRange.daysCount)));

		const largest = sqlLargest(serverRange.from, serverRange.to, filters);
		if (!largest) {
			expect(result.summary.largest).toBeNull();
		} else {
			const category = largest.categoryId ? categoryDtos.find((c) => c.id === largest.categoryId) : undefined;
			expect(result.summary.largest).toEqual({
				amount: largest.amount,
				occurredAt: largest.occurredAt,
				note: largest.note,
				categoryName: category?.name ?? null
			});
		}

		// Series: SQL day buckets re-bucketed with the server's own key resolver.
		const expectedSeries = new Map<string, { income: number; expense: number }>();
		for (const bucket of generateBuckets(serverRange.from, serverRange.to, serverGranularity)) {
			expectedSeries.set(bucket.bucket, { income: 0, expense: 0 });
		}
		for (const [ymd, dayTotal] of sqlDayTotals(serverRange.from, serverRange.to, filters)) {
			const key = getBucketKeyForDate(`${ymd}T00:00:00.000Z`, serverGranularity);
			const bucket = expectedSeries.get(key);
			if (!bucket) throw new Error(`bucket missing for ${ymd} (${key})`);
			bucket.income += dayTotal.income;
			bucket.expense += dayTotal.expense;
		}

		expect(result.series.map((s) => s.bucket)).toEqual(
			generateBuckets(serverRange.from, serverRange.to, serverGranularity).map((b) => b.bucket)
		);
		expect(result.series.map((s) => s.label)).toEqual(
			generateBuckets(serverRange.from, serverRange.to, serverGranularity).map((b) => b.label)
		);
		expect(new Map(result.series.map((s) => [s.bucket, { income: s.income, expense: s.expense }]))).toEqual(
			expectedSeries
		);

		// Category breakdown
		const denominator =
			filters.type === 'income' ? totals.income : filters.type === 'expense' ? totals.expense : totals.income + totals.expense;
		const expectedCategories = sortedByTotalDesc(
			Array.from(sqlCategoryTotals(serverRange.from, serverRange.to, filters).entries()).map(([categoryId, agg]) => {
				const category = categoryId ? categoryDtos.find((c) => c.id === categoryId) : undefined;
				return {
					categoryId: categoryId || null,
					name: category?.name ?? 'Tanpa Kategori',
					total: agg.total,
					count: agg.count,
					color: category?.color ?? null,
					share: denominator > 0 ? Number((agg.total / denominator).toFixed(4)) : 0
				};
			})
		);
		expect(sortedByTotalDesc(result.categories.map((c) => ({ ...c })))).toEqual(expectedCategories);

		// Wallet breakdown
		const expectedWallets = Array.from(sqlWalletTotals(serverRange.from, serverRange.to, filters).entries()).map(
			([walletId, agg]) => ({
				walletId,
				name: walletDtos.find((w) => w.id === walletId)?.name ?? 'Dompet',
				income: agg.income,
				expense: agg.expense,
				net: agg.income - agg.expense
			})
		);
		expect(result.wallets.slice().sort((a, b) => (a.walletId < b.walletId ? -1 : 1))).toEqual(
			expectedWallets.sort((a, b) => (a.walletId < b.walletId ? -1 : 1))
		);

		// Previous period
		if (!serverRange.previous) {
			expect(result.previous).toBeNull();
		} else {
			const prevTotals = sqlTotals(serverRange.previous.from, serverRange.previous.to, filters);
			expect(result.previous).toEqual({
				from: serverRange.previous.from,
				to: serverRange.previous.to,
				income: prevTotals.income,
				expense: prevTotals.expense,
				net: prevTotals.income - prevTotals.expense
			});
		}

		// Filter options: active wallets and categories only
		expect(result.options.wallets).toEqual(
			sortedByName(walletDtos.filter((w) => !w.archived && w.deletedAt == null).map((w) => ({ id: w.id, name: w.name })))
		);
		expect(result.options.categories).toEqual(
			sortedByName(
				categoryDtos
					.filter((c) => !c.archived && c.deletedAt == null)
					.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
			)
		);
	});

	it('labels the month preset like the server range label', () => {
		const result = deriveAnalytics(txDtos, walletDtos, categoryDtos, { range: 'month' }, NOW);
		expect(result.filters.label).toBe('November 2026');
		expect(result.filters.period).toBe('month');
		expect(result.filters.startDate).toBe('2026-11-01');
		expect(result.filters.endDate).toBe('2026-11-15');
	});
});

describe('derive-parity: deriveDashboard vs SQL aggregates', () => {
	it('matches total balance, current month, recent rows, category breakdown and 6-month trend', () => {
		const summary = deriveDashboard(txDtos, walletDtos, categoryDtos, NOW);

		const monthStart = '2026-11-01T00:00:00.000Z';
		const monthEnd = '2026-11-30T23:59:59.999Z';
		const monthTotals = sqlTotals(monthStart, monthEnd);
		expect(summary.currentMonth).toEqual({
			income: monthTotals.income,
			expense: monthTotals.expense,
			net: monthTotals.income - monthTotals.expense
		});

		const balances = sqlBalanceAggregate();
		const activeWalletIds = walletDtos.filter((w) => !w.archived && w.deletedAt == null).map((w) => w.id);
		expect(summary.wallets.map((w) => w.id).sort()).toEqual(activeWalletIds.slice().sort());
		expect(summary.wallets.map((w) => w.currentBalance)).toEqual(activeWalletIds.map((id) => balances.get(id)));
		expect(summary.totalBalance).toBe(activeWalletIds.reduce((sum, id) => sum + (balances.get(id) ?? 0), 0));

		expect(summary.recentTransactions.map((t) => t.id)).toEqual(sqlRecentIds(10));

		const monthKeys = summary.sixMonthTrend.map((m) => m.month);
		expect(monthKeys).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
		const expectedTrend = new Map(
			(
				db
					.prepare(
						`SELECT substr(occurred_at, 1, 7) AS ym,
						        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
						        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
						 FROM transactions
						 WHERE user_id = ? AND deleted_at IS NULL AND substr(occurred_at, 1, 7) >= ? AND substr(occurred_at, 1, 7) <= ?
						 GROUP BY ym`
					)
					.all(USER_ID, monthKeys[0], monthKeys[5]) as Array<{ ym: string; income: number; expense: number }>
			).map((r) => [r.ym, { month: r.ym, income: Number(r.income), expense: Number(r.expense) }])
		);
		expect(summary.sixMonthTrend).toEqual(
			monthKeys.map((month) => expectedTrend.get(month) ?? { month, income: 0, expense: 0 })
		);

		const expectedBreakdown = sortedByTotalDesc(
			(
				db
					.prepare(
						`SELECT COALESCE(category_id, '') AS category_id, SUM(amount) AS total
						 FROM transactions
						 WHERE user_id = ? AND deleted_at IS NULL AND type = 'expense' AND substr(occurred_at, 1, 7) = '2026-11'
						 GROUP BY COALESCE(category_id, '')`
					)
					.all(USER_ID) as Array<{ category_id: string; total: number }>
			).map((r) => {
				const category = r.category_id ? categoryDtos.find((c) => c.id === r.category_id) : undefined;
				return {
					categoryId: r.category_id || null,
					categoryName: category?.name ?? 'Tanpa Kategori',
					total: Number(r.total),
					color: category?.color ?? null
				};
			})
		);
		expect(sortedByTotalDesc(summary.categoryBreakdown.map((c) => ({ ...c })))).toEqual(expectedBreakdown);
	});
});
