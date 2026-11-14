import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../src/lib/server/db/schema';
import { TransactionsRepo } from '../src/lib/server/repos/transactions';
import {
	listTransactions,
	getTransactionDayTotals
} from '../src/lib/server/services/transactions';
import type { AppEvent } from '../src/lib/server/types';
import type { D1Database } from '@cloudflare/workers-types';

describe('Day Totals Aggregations & Split Days Integration Tests', () => {
	let mf: Miniflare;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let repo: TransactionsRepo;

	const userA = 'user-day-alice';
	const userB = 'user-day-bob';

	let w1: string;
	let w2: string;
	let cFood: string;

	function makeEvent(userId: string): AppEvent {
		return {
			locals: {
				user: { id: userId, email: `${userId}@example.com`, name: userId },
				db
			}
		} as unknown as AppEvent;
	}

	beforeAll(async () => {
		mf = new Miniflare({
			workers: [
				{
					config: {
						name: 'uangku-daytotals-worker',
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
							APP_DB: { type: 'd1', id: 'test-daytotals-db' }
						}
					}
				}
			]
		});

		const d1 = (await mf.getD1Database('APP_DB')) as unknown as D1Database;
		// Execute schema migrations
		for (const file of ['drizzle/0000_useful_black_widow.sql', 'drizzle/0002_hlc_sync_rollups_triggers.sql']) {
			const migrationPath = path.resolve(file);
			const sqlContent = fs.readFileSync(migrationPath, 'utf8');
			const statements = sqlContent
				.split('--> statement-breakpoint')
				.map((s) => s.trim())
				.filter(Boolean);

			for (const stmt of statements) {
				await d1.prepare(stmt).run();
			}
		}

		db = drizzle(d1, { schema });
		repo = new TransactionsRepo(db);

		const now = new Date();
		const nowIso = now.toISOString();

		await db.insert(schema.users).values([
			{ id: userA, name: 'Alice', email: 'alice@day.test', createdAt: now, updatedAt: now },
			{ id: userB, name: 'Bob', email: 'bob@day.test', createdAt: now, updatedAt: now }
		]);

		w1 = 'w-day-1';
		w2 = 'w-day-2';
		const wBob = 'w-day-bob';

		await db.insert(schema.wallets).values([
			{ id: w1, userId: userA, name: 'Wallet A1', type: 'cash', initialBalance: 10000000, createdAt: nowIso },
			{ id: w2, userId: userA, name: 'Wallet A2', type: 'bank', initialBalance: 10000000, createdAt: nowIso },
			{ id: wBob, userId: userB, name: 'Wallet Bob', type: 'bank', initialBalance: 5000000, createdAt: nowIso }
		]);

		cFood = 'c-food';
		await db.insert(schema.categories).values([
			{ id: cFood, userId: userA, name: 'Makan', kind: 'expense', color: '#ff0000', createdAt: nowIso }
		]);

		// Scenario:
		// 1. Target split-day: 2026-11-15 with exactly 43 transactions for Alice
		//    - 30 expenses of 10.000 each = 300.000
		//    - 10 incomes of 50.000 each = 500.000
		//    - 3 transfers of 100.000 each (w1 -> w2) = 300.000
		//    Expected day totals for 2026-11-15:
		//    income: 500.000
		//    expense: 300.000
		//    net: 200.000
		//    count: 43
		//
		// 2. Another day: 2026-11-14 with 2 transactions:
		//    - 1 expense: 25.000
		//    - 1 income: 75.000
		//
		// 3. User B transactions on 2026-11-15:
		//    - 1 income of 9.999.999 (MUST NOT be counted in Alice day totals)

		const txValues = [];

		for (let i = 1; i <= 30; i++) {
			const minuteStr = String(i % 60).padStart(2, '0');
			txValues.push({
				id: `tx-split-exp-${i}`,
				userId: userA,
				walletId: w1,
				categoryId: cFood,
				type: 'expense' as const,
				amount: 10000,
				occurredAt: `2026-11-15T08:${minuteStr}:00.000Z`,
				note: `Expense item ${i}`,
				createdAt: nowIso,
				updatedAt: nowIso
			});
		}

		for (let i = 1; i <= 10; i++) {
			const minuteStr = String((30 + i) % 60).padStart(2, '0');
			txValues.push({
				id: `tx-split-inc-${i}`,
				userId: userA,
				walletId: w1,
				categoryId: null,
				type: 'income' as const,
				amount: 50000,
				occurredAt: `2026-11-15T12:${minuteStr}:00.000Z`,
				note: `Income item ${i}`,
				createdAt: nowIso,
				updatedAt: nowIso
			});
		}

		for (let i = 1; i <= 3; i++) {
			const minuteStr = String((45 + i) % 60).padStart(2, '0');
			txValues.push({
				id: `tx-split-trf-${i}`,
				userId: userA,
				walletId: w1,
				transferWalletId: w2,
				categoryId: null,
				type: 'transfer' as const,
				amount: 100000,
				occurredAt: `2026-11-15T16:${minuteStr}:00.000Z`,
				note: `Transfer item ${i}`,
				createdAt: nowIso,
				updatedAt: nowIso
			});
		}

		// Insert userA Nov 14 txs
		txValues.push(
			{
				id: 'tx-14-1',
				userId: userA,
				walletId: w1,
				categoryId: cFood,
				type: 'expense' as const,
				amount: 25000,
				occurredAt: '2026-11-14T10:00:00.000Z',
				note: 'Nov 14 expense',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			{
				id: 'tx-14-2',
				userId: userA,
				walletId: w1,
				categoryId: null,
				type: 'income' as const,
				amount: 75000,
				occurredAt: '2026-11-14T14:00:00.000Z',
				note: 'Nov 14 income',
				createdAt: nowIso,
				updatedAt: nowIso
			}
		);

		// Insert userB Nov 15 tx
		txValues.push({
			id: 'tx-bob-split-1',
			userId: userB,
			walletId: wBob,
			categoryId: null,
			type: 'income' as const,
			amount: 9999999,
			occurredAt: '2026-11-15T11:00:00.000Z',
			note: 'Bob Nov 15 big income',
			createdAt: nowIso,
			updatedAt: nowIso
		});

		// Insert in chunks of 5 to avoid any SQLite parameter ceiling (15 columns * 5 = 75 params)
		for (let i = 0; i < txValues.length; i += 5) {
			const chunk = txValues.slice(i, i + 5);
			await db.insert(schema.transactions).values(chunk);
		}
	});

	afterAll(async () => {
		if (mf) await mf.dispose();
	});

	it('aggregates income, expense, and net accurately; transfer excluded from amounts but counted in count', async () => {
		const res = await repo.getDayTotals(userA, ['2026-11-15']);
		expect(res).toHaveLength(1);

		const day = res[0];
		expect(day.date).toBe('2026-11-15');
		expect(day.income).toBe(500000);
		expect(day.expense).toBe(300000);
		expect(day.net).toBe(200000); // 500.000 - 300.000
		expect(day.count).toBe(43); // 30 exp + 10 inc + 3 trf
	});

	it('returns only requested dates that exist; omits days without transactions', async () => {
		// Request dates: Nov 15 (exists), Nov 14 (exists), Nov 13 (no transactions)
		const res = await repo.getDayTotals(userA, ['2026-11-15', '2026-11-14', '2026-11-13']);

		expect(res.map((r) => r.date).sort()).toEqual(['2026-11-14', '2026-11-15']);

		const d14 = res.find((r) => r.date === '2026-11-14');
		expect(d14?.income).toBe(75000);
		expect(d14?.expense).toBe(25000);
		expect(d14?.net).toBe(50000);
		expect(d14?.count).toBe(2);
	});

	it('maintains tenant isolation: User B transactions on same date never enter User A day totals', async () => {
		const resA = await repo.getDayTotals(userA, ['2026-11-15']);
		expect(resA[0].income).toBe(500000); // Bob 9.999.999 excluded

		const resB = await repo.getDayTotals(userB, ['2026-11-15']);
		expect(resB[0].income).toBe(9999999);
		expect(resB[0].expense).toBe(0);
		expect(resB[0].count).toBe(1);
	});

	it('SPLIT-DAY TEST: page of 20 items on a 43-item day reports full day totals (43 items and exact total money)', async () => {
		const event = makeEvent(userA);

		// Page 1: limit 20
		const page1 = await listTransactions(event, {
			from: '2026-11-15',
			to: '2026-11-15',
			limit: 20
		});

		expect(page1.items).toHaveLength(20);
		expect(page1.hasMore).toBe(true);
		expect(page1.nextCursor).not.toBeNull();

		// Check the dayTotals computed for the dates appearing on page 1 (which is only '2026-11-15')
		const page1Dates = Array.from(new Set(page1.items.map((i) => i.occurredAt.slice(0, 10))));
		expect(page1Dates).toEqual(['2026-11-15']);

		const dayTotalsPage1 = await getTransactionDayTotals(event, page1Dates);
		expect(dayTotalsPage1).toHaveLength(1);
		// Crucial verification: count is 43 (not 20!), income is 500k, expense is 300k
		expect(dayTotalsPage1[0].count).toBe(43);
		expect(dayTotalsPage1[0].income).toBe(500000);
		expect(dayTotalsPage1[0].expense).toBe(300000);
		expect(dayTotalsPage1[0].net).toBe(200000);

		// Page 2: next 20 items using cursor
		const page2 = await listTransactions(event, {
			from: '2026-11-15',
			to: '2026-11-15',
			limit: 20,
			cursor: page1.nextCursor!
		});

		expect(page2.items).toHaveLength(20);
		expect(page2.hasMore).toBe(true);
		expect(page2.nextCursor).not.toBeNull();

		const dayTotalsPage2 = await getTransactionDayTotals(event, page1Dates);
		expect(dayTotalsPage2[0].count).toBe(43);

		// Page 3: final 3 items
		const page3 = await listTransactions(event, {
			from: '2026-11-15',
			to: '2026-11-15',
			limit: 20,
			cursor: page2.nextCursor!
		});

		expect(page3.items).toHaveLength(3);
		expect(page3.hasMore).toBe(false);
		expect(page3.nextCursor).toBeNull();

		// Verify zero duplicates and zero missing across all 3 pages
		const allPagedIds = [
			...page1.items.map((i) => i.id),
			...page2.items.map((i) => i.id),
			...page3.items.map((i) => i.id)
		];
		expect(allPagedIds).toHaveLength(43);
		expect(new Set(allPagedIds).size).toBe(43);
	});

	it('inclusive boundary check: exact startDate 00:00:00 and endDate 23:59:59.999 included', async () => {
		const nowIso = new Date().toISOString();
		await db.insert(schema.transactions).values([
			{
				id: 'tx-bound-start',
				userId: userA,
				walletId: w1,
				type: 'income',
				amount: 11111,
				occurredAt: '2026-11-01T00:00:00.000Z',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			{
				id: 'tx-bound-end',
				userId: userA,
				walletId: w1,
				type: 'expense',
				amount: 22222,
				occurredAt: '2026-11-30T23:59:59.999Z',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			{
				id: 'tx-bound-outside-before',
				userId: userA,
				walletId: w1,
				type: 'income',
				amount: 88888,
				occurredAt: '2026-10-31T23:59:59.999Z',
				createdAt: nowIso,
				updatedAt: nowIso
			},
			{
				id: 'tx-bound-outside-after',
				userId: userA,
				walletId: w1,
				type: 'expense',
				amount: 99999,
				occurredAt: '2026-12-01T00:00:00.000Z',
				createdAt: nowIso,
				updatedAt: nowIso
			}
		]);

		const event = makeEvent(userA);
		const monthList = await listTransactions(event, {
			from: '2026-11-01',
			to: '2026-11-30',
			limit: 100
		});

		const ids = monthList.items.map((i) => i.id);
		expect(ids).toContain('tx-bound-start');
		expect(ids).toContain('tx-bound-end');
		expect(ids).not.toContain('tx-bound-outside-before');
		expect(ids).not.toContain('tx-bound-outside-after');
	});
});
