import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../src/lib/server/db/schema';
import { getAnalyticsData } from '../src/lib/server/services/stats';
import type { AppEvent } from '../src/lib/server/types';
import type { D1Database } from '@cloudflare/workers-types';

describe('Analytics & Stats Service Integration Tests', () => {
	let mf: Miniflare;
	let db: ReturnType<typeof drizzle<typeof schema>>;

	const userA = 'user-stat-alice';
	const userB = 'user-stat-bob';

	let w1: string;
	let w2: string;
	let cMakan: string;
	let cGaji: string;

	function makeEvent(userId: string): AppEvent {
		return {
			locals: {
				user: { id: userId, email: `${userId}@example.com`, name: userId },
				db
			},
			platform: {
				env: {
					APP_DB: (db as any).session.client
				}
			}
		} as unknown as AppEvent;
	}

	beforeAll(async () => {
		mf = new Miniflare({
			workers: [
				{
					config: {
						name: 'uangku-stats-worker',
						compatibilityDate: '2026-11-10',
						manifest: {
							modulesRoot: path.resolve('.'),
							mainModule: 'test-entry.js',
							modules: {
								'test-entry.js': {
									type: 'esm',
									contents: 'export default { fetch() { return new Response("ok"); } };'
								}
							}
						},
						env: {
							APP_DB: { type: 'd1', id: 'test-stats-db' }
						}
					}
				}
			]
		});

		const d1 = (await mf.getD1Database('APP_DB')) as unknown as D1Database;
		const migrationPath = path.resolve('drizzle/0000_useful_black_widow.sql');
		const sqlContent = fs.readFileSync(migrationPath, 'utf8');
		const statements = sqlContent
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);

		for (const stmt of statements) {
			await d1.prepare(stmt).run();
		}

		db = drizzle(d1, { schema });

		const now = new Date();
		await db.insert(schema.users).values([
			{ id: userA, name: 'Alice', email: 'alice@example.com', createdAt: now, updatedAt: now },
			{ id: userB, name: 'Bob', email: 'bob@example.com', createdAt: now, updatedAt: now }
		]);

		const nowIso = now.toISOString();

		w1 = 'w-alice-main';
		w2 = 'w-alice-savings';
		const wBob = 'w-bob-main';

		await db.insert(schema.wallets).values([
			{ id: w1, userId: userA, name: 'BCA Utama', type: 'bank', initialBalance: 1000000, createdAt: nowIso },
			{ id: w2, userId: userA, name: 'Tabungan Mandiri', type: 'bank', initialBalance: 500000, createdAt: nowIso },
			{ id: wBob, userId: userB, name: 'Bob Wallet', type: 'cash', initialBalance: 100000, createdAt: nowIso }
		]);

		cMakan = 'c-alice-makan';
		cGaji = 'c-alice-gaji';
		const cBob = 'c-bob-makan';

		await db.insert(schema.categories).values([
			{ id: cMakan, userId: userA, name: 'Makan & Minum', kind: 'expense', color: '#ff0000', createdAt: nowIso },
			{ id: cGaji, userId: userA, name: 'Gaji Bulanan', kind: 'income', color: '#00ff00', createdAt: nowIso },
			{ id: cBob, userId: userB, name: 'Makan Bob', kind: 'expense', color: '#0000ff', createdAt: nowIso }
		]);

		// Transactions for User A in November 2026:
		// Range test anchor: 2026-11-10 to 2026-11-12
		await db.insert(schema.transactions).values([
			// userA: 2026-11-10T00:00:00.000Z (exact 'from' boundary) - Expense 50.000 (Makan)
			{
				id: 'tx-1',
				userId: userA,
				walletId: w1,
				categoryId: cMakan,
				type: 'expense',
				amount: 50000,
				occurredAt: '2026-11-10T00:00:00.000Z',
				note: 'Sarapan pas batas bawah',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			// userA: 2026-11-11T12:00:00.000Z - Income 1.000.000 (Gaji)
			{
				id: 'tx-2',
				userId: userA,
				walletId: w1,
				categoryId: cGaji,
				type: 'income',
				amount: 1000000,
				occurredAt: '2026-11-11T12:00:00.000Z',
				note: 'Gaji pokok',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			// userA: 2026-11-11T14:00:00.000Z - Transfer 200.000 (w1 -> w2)
			{
				id: 'tx-3',
				userId: userA,
				walletId: w1,
				transferWalletId: w2,
				categoryId: null,
				type: 'transfer',
				amount: 200000,
				occurredAt: '2026-11-11T14:00:00.000Z',
				note: 'Transfer tabungan',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			// userA: 2026-11-12T23:59:59.999Z (exact 'to' inclusive boundary) - Expense 75.000 (Tanpa Kategori)
			{
				id: 'tx-4',
				userId: userA,
				walletId: w2,
				categoryId: null,
				type: 'expense',
				amount: 75000,
				occurredAt: '2026-11-12T23:59:59.999Z',
				note: 'Beli pulsa tanpa kategori',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			// userA: 2026-11-09T23:59:59.000Z (1 second before 'from' boundary - in previous period) - Expense 40.000
			{
				id: 'tx-5',
				userId: userA,
				walletId: w1,
				categoryId: cMakan,
				type: 'expense',
				amount: 40000,
				occurredAt: '2026-11-09T23:59:59.000Z',
				note: 'Makan kemarin malam',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			// userA: 2026-11-13T00:00:00.000Z (1 millisecond after 'to' boundary) - Expense 999.000
			{
				id: 'tx-6',
				userId: userA,
				walletId: w1,
				categoryId: cMakan,
				type: 'expense',
				amount: 999000,
				occurredAt: '2026-11-13T00:00:00.000Z',
				note: 'Belanja besok di luar rentang',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			// userB (other user inside exact same range) - Income 5.000.000, Expense 2.000.000
			{
				id: 'tx-bob-1',
				userId: userB,
				walletId: wBob,
				categoryId: cBob,
				type: 'expense',
				amount: 2000000,
				occurredAt: '2026-11-11T10:00:00.000Z',
				note: 'Bob expense',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			{
				id: 'tx-bob-2',
				userId: userB,
				walletId: wBob,
				categoryId: null,
				type: 'income',
				amount: 5000000,
				occurredAt: '2026-11-11T11:00:00.000Z',
				note: 'Bob income',
				createdAt: nowIso,
				updatedAt: nowIso
			}
		]);
	});

	afterAll(async () => {
		if (mf) await mf.dispose();
	});

	it('counts inclusive bounds (exact from & to included; 1 sec before / 1 ms after excluded)', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		// Inside range: tx-1 (50k expense), tx-2 (1M income), tx-3 (200k transfer), tx-4 (75k expense)
		// tx-5 (Nov 9) and tx-6 (Nov 13) must NOT be counted in current summary
		expect(data.summary.count).toBe(4);
		expect(data.summary.income).toBe(1000000);
		expect(data.summary.expense).toBe(125000); // 50.000 + 75.000
		expect(data.summary.net).toBe(875000); // 1.000.000 - 125.000
	});

	it('excludes transfers from income, expense, net, series, categories, wallets, and previous, but keeps them in count', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		// Count includes the 1 transfer tx -> 4 total
		expect(data.summary.count).toBe(4);

		// Transfer amount (200,000) must not inflate income or expense
		expect(data.summary.income).toBe(1000000);
		expect(data.summary.expense).toBe(125000);

		// Series totals across all buckets must equal summary income and expense
		const seriesIncomeSum = data.series.reduce((acc, s) => acc + s.income, 0);
		const seriesExpenseSum = data.series.reduce((acc, s) => acc + s.expense, 0);
		expect(seriesIncomeSum).toBe(1000000);
		expect(seriesExpenseSum).toBe(125000);

		// Category totals must sum to 125.000 expense + 1.000.000 income (transfers omitted)
		const categorySum = data.categories.reduce((acc, c) => acc + c.total, 0);
		expect(categorySum).toBe(1125000);

		// Wallets totals must exclude transfer
		const w1Agg = data.wallets.find((w) => w.walletId === w1);
		expect(w1Agg?.income).toBe(1000000);
		expect(w1Agg?.expense).toBe(50000); // Only tx-1, not the 200k transfer
		expect(w1Agg?.net).toBe(950000);
	});

	it('computes integer avgPerDay and identifies largest non-transfer transaction', async () => {
		const event = makeEvent(userA);
		// Range of 3 days: 2026-11-10, 2026-11-11, 2026-11-12
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		// Total expense = 125,000 across 3 days -> 125000 / 3 = 41666.666 -> Math.round is 41667
		expect(Number.isInteger(data.summary.avgPerDay)).toBe(true);
		expect(data.summary.avgPerDay).toBe(41667);

		// Largest non-transfer tx is tx-2 (1,000,000 income)
		expect(data.summary.largest).not.toBeNull();
		expect(data.summary.largest?.amount).toBe(1000000);
		expect(data.summary.largest?.note).toBe('Gaji pokok');
	});

	it('includes uncategorized transactions with name "Tanpa Kategori" and categoryId null', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		const uncategorized = data.categories.find((c) => c.categoryId === null);
		expect(uncategorized).toBeDefined();
		expect(uncategorized?.name).toBe('Tanpa Kategori');
		expect(uncategorized?.total).toBe(75000);
		expect(uncategorized?.count).toBe(1);
	});

	it('narrows results when filtering by walletId', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12',
			walletId: w2
		});

		// Only tx-4 belongs to w2
		expect(data.summary.count).toBe(1);
		expect(data.summary.income).toBe(0);
		expect(data.summary.expense).toBe(75000);
		expect(data.wallets).toHaveLength(1);
		expect(data.wallets[0].walletId).toBe(w2);
	});

	it('narrows results when filtering by categoryId', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12',
			categoryId: cMakan
		});

		// Only tx-1 has category cMakan
		expect(data.summary.count).toBe(1);
		expect(data.summary.expense).toBe(50000);
		expect(data.categories).toHaveLength(1);
		expect(data.categories[0].categoryId).toBe(cMakan);
	});

	it('narrows results when filtering by type=expense or type=income', async () => {
		const event = makeEvent(userA);
		const expenseData = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12',
			type: 'expense'
		});
		expect(expenseData.summary.income).toBe(0);
		expect(expenseData.summary.expense).toBe(125000);
		expect(expenseData.summary.count).toBe(2);

		const incomeData = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12',
			type: 'income'
		});
		expect(incomeData.summary.income).toBe(1000000);
		expect(incomeData.summary.expense).toBe(0);
		expect(incomeData.summary.count).toBe(1);
	});

	it('guarantees tenant isolation: Bob transactions never leak into Alice analytics', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		// Bob has 5M income and 2M expense in this period -> none should be in Alice data
		expect(data.summary.income).toBe(1000000);
		expect(data.summary.expense).toBe(125000);

		const bobWalletInAlice = data.wallets.find((w) => w.name.includes('Bob'));
		expect(bobWalletInAlice).toBeUndefined();

		const bobCategoryInAlice = data.categories.find((c) => c.name.includes('Bob'));
		expect(bobCategoryInAlice).toBeUndefined();
	});

	it('calculates previous period of identical duration immediately prior', async () => {
		const event = makeEvent(userA);
		// 3 days: Nov 10 to Nov 12 -> previous 3 days: Nov 07 to Nov 09
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		expect(data.previous).not.toBeNull();
		// tx-5 (occurred 2026-11-09T23:59:59.000Z, expense 40.000) falls exactly into previous period!
		expect(data.previous?.expense).toBe(40000);
		expect(data.previous?.income).toBe(0);
		expect(data.previous?.net).toBe(-40000);
	});

	it('ensures all currency outputs are integer rupiah (no floating decimals) except share', async () => {
		const event = makeEvent(userA);
		const data = await getAnalyticsData(event, {
			range: 'custom',
			from: '2026-11-10',
			to: '2026-11-12'
		});

		expect(Number.isInteger(data.summary.income)).toBe(true);
		expect(Number.isInteger(data.summary.expense)).toBe(true);
		expect(Number.isInteger(data.summary.net)).toBe(true);
		expect(Number.isInteger(data.summary.avgPerDay)).toBe(true);

		for (const s of data.series) {
			expect(Number.isInteger(s.income)).toBe(true);
			expect(Number.isInteger(s.expense)).toBe(true);
		}

		for (const c of data.categories) {
			expect(Number.isInteger(c.total)).toBe(true);
			// share is a float between 0 and 1
			expect(c.share).toBeGreaterThanOrEqual(0);
			expect(c.share).toBeLessThanOrEqual(1);
		}

		for (const w of data.wallets) {
			expect(Number.isInteger(w.income)).toBe(true);
			expect(Number.isInteger(w.expense)).toBe(true);
			expect(Number.isInteger(w.net)).toBe(true);
		}
	});
});
