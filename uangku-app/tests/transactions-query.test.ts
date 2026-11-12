import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import path from 'path';
import fs from 'fs';
import * as schema from '../src/lib/server/db/schema';
import { TransactionsRepo } from '../src/lib/server/repos/transactions';
import { WalletsRepo } from '../src/lib/server/repos/wallets';
import { CategoriesRepo } from '../src/lib/server/repos/categories';
import type { AppDatabase } from '../src/lib/server/db/client';

describe('Transactions Filtering & Composite Cursor Pagination', () => {
	let mf: Miniflare;
	let db: AppDatabase;
	let repo: TransactionsRepo;
	let walletsRepo: WalletsRepo;
	let categoriesRepo: CategoriesRepo;

	const testUser = 'user_filter_test';
	let walletAId: string;
	let walletBId: string;
	let catFoodId: string;
	let catSalaryId: string;

	beforeAll(async () => {
		mf = new Miniflare({
			workers: [
				{
					config: {
						name: 'worker',
						compatibilityDate: '2026-11-10',
						manifest: {
							modulesRoot: path.resolve('.'),
							mainModule: 'index.js',
							modules: {
								'index.js': {
									type: 'esm',
									contents: 'export default { fetch() { return new Response("ok"); } }'
								}
							}
						},
						env: {
							APP_DB: { type: 'd1', id: 'test-filter-db' }
						}
					}
				}
			]
		});

		const d1 = (await mf.getD1Database('APP_DB')) as unknown as D1Database;
		const migrationPath = path.resolve('drizzle/0000_useful_black_widow.sql');
		const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
		const statements = sqlContent
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);

		for (const statement of statements) {
			await d1.prepare(statement).run();
		}

		db = drizzle(d1, { schema }) as unknown as AppDatabase;
		repo = new TransactionsRepo(db);
		walletsRepo = new WalletsRepo(db);
		categoriesRepo = new CategoriesRepo(db);

		// Seed user
		await db.insert(schema.users).values({
			id: testUser,
			name: 'Filter Tester',
			email: 'filter@test.local',
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		// Seed wallets
		const wA = await walletsRepo.create(testUser, { name: 'Main Wallet', type: 'bank', balance: 1000000 });
		const wB = await walletsRepo.create(testUser, { name: 'Cash Pocket', type: 'cash', balance: 500000 });
		walletAId = wA.id;
		walletBId = wB.id;

		// Seed categories
		const cFood = await categoriesRepo.create(testUser, { name: 'Food', kind: 'expense' });
		const cSalary = await categoriesRepo.create(testUser, { name: 'Salary', kind: 'income' });
		catFoodId = cFood.id;
		catSalaryId = cSalary.id;
	});

	afterAll(async () => {
		await mf.dispose();
	});

	describe('Transaction Filtering', () => {
		beforeAll(async () => {
			await db.delete(schema.transactions);

			await repo.create(testUser, {
				walletId: walletAId,
				categoryId: catFoodId,
				type: 'expense',
				amount: 50000,
				occurredAt: '2026-05-10T12:00:00.000Z',
				note: 'Lunch'
			});

			await repo.create(testUser, {
				walletId: walletAId,
				categoryId: catSalaryId,
				type: 'income',
				amount: 5000000,
				occurredAt: '2026-05-15T08:00:00.000Z',
				note: 'Monthly salary'
			});

			await repo.create(testUser, {
				walletId: walletBId,
				categoryId: catFoodId,
				type: 'expense',
				amount: 25000,
				occurredAt: '2026-05-20T19:00:00.000Z',
				note: 'Snack'
			});

			await repo.create(testUser, {
				walletId: walletBId,
				type: 'expense',
				amount: 15000,
				occurredAt: '2026-06-01T10:00:00.000Z',
				note: 'June expense'
			});
		});

		it('filters by walletId correctly', async () => {
			const res = await repo.list(testUser, { walletId: walletAId });
			expect(res.items.length).toBe(2);
			expect(res.items.every((tx) => tx.walletId === walletAId)).toBe(true);
		});

		it('filters by categoryId correctly', async () => {
			const res = await repo.list(testUser, { categoryId: catFoodId });
			expect(res.items.length).toBe(2);
			expect(res.items.every((tx) => tx.categoryId === catFoodId)).toBe(true);
		});

		it('filters by transaction type (income / expense)', async () => {
			const incomeRes = await repo.list(testUser, { type: 'income' });
			expect(incomeRes.items.length).toBe(1);
			expect(incomeRes.items[0].note).toBe('Monthly salary');

			const expenseRes = await repo.list(testUser, { type: 'expense' });
			expect(expenseRes.items.length).toBe(3);
			expect(expenseRes.items.every((tx) => tx.type === 'expense')).toBe(true);
		});

		it('filters by inclusive date range from / to (YYYY-MM-DD)', async () => {
			const res = await repo.list(testUser, {
				from: '2026-05-10',
				to: '2026-05-20'
			});
			expect(res.items.length).toBe(3);
			expect(res.items.map((tx) => tx.note)).toEqual(
				expect.arrayContaining(['Lunch', 'Monthly salary', 'Snack'])
			);
			expect(res.items.map((tx) => tx.note)).not.toContain('June expense');
		});

		it('handles boundary condition: same start and end date (from === to)', async () => {
			const res = await repo.list(testUser, {
				from: '2026-05-10',
				to: '2026-05-10'
			});
			expect(res.items.length).toBe(1);
			expect(res.items[0].note).toBe('Lunch');
		});

		it('returns empty list when from > to', async () => {
			const res = await repo.list(testUser, {
				from: '2026-06-10',
				to: '2026-05-01'
			});
			expect(res.items.length).toBe(0);
			expect(res.hasMore).toBe(false);
			expect(res.nextCursor).toBeNull();
		});

		it('returns all items when filter criteria is empty', async () => {
			const res = await repo.list(testUser, {});
			expect(res.items.length).toBe(4);
		});
	});

	describe('Composite Cursor Pagination (occurred_at DESC, id DESC)', () => {
		beforeAll(async () => {
			await db.delete(schema.transactions);

			// Seed 3 transactions with identical timestamp to verify composite tie-breaking
			const identicalTime = '2026-07-01T12:00:00.000Z';

			await db.insert(schema.transactions).values([
				{
					id: 'tx_identical_01',
					userId: testUser,
					walletId: walletAId,
					type: 'expense',
					amount: 10000,
					note: 'Tie 1',
					occurredAt: identicalTime,
					createdAt: '2026-07-01T12:00:00.000Z',
					updatedAt: '2026-07-01T12:00:00.000Z'
				},
				{
					id: 'tx_identical_02',
					userId: testUser,
					walletId: walletAId,
					type: 'expense',
					amount: 20000,
					note: 'Tie 2',
					occurredAt: identicalTime,
					createdAt: '2026-07-01T12:00:00.000Z',
					updatedAt: '2026-07-01T12:00:00.000Z'
				},
				{
					id: 'tx_identical_03',
					userId: testUser,
					walletId: walletAId,
					type: 'expense',
					amount: 30000,
					note: 'Tie 3',
					occurredAt: identicalTime,
					createdAt: '2026-07-01T12:00:00.000Z',
					updatedAt: '2026-07-01T12:00:00.000Z'
				},
				{
					id: 'tx_newer',
					userId: testUser,
					walletId: walletAId,
					type: 'expense',
					amount: 40000,
					note: 'Newer',
					occurredAt: '2026-07-02T12:00:00.000Z',
					createdAt: '2026-07-02T12:00:00.000Z',
					updatedAt: '2026-07-02T12:00:00.000Z'
				},
				{
					id: 'tx_older',
					userId: testUser,
					walletId: walletAId,
					type: 'expense',
					amount: 50000,
					note: 'Older',
					occurredAt: '2026-06-30T12:00:00.000Z',
					createdAt: '2026-06-30T12:00:00.000Z',
					updatedAt: '2026-06-30T12:00:00.000Z'
				}
			]);
		});

		it('maintains stable descending order and paginates through identical timestamps without skipping or repeating', async () => {
			// Page 1: limit 2
			const page1 = await repo.list(testUser, { limit: 2 });
			expect(page1.items.length).toBe(2);
			expect(page1.hasMore).toBe(true);
			expect(page1.nextCursor).not.toBeNull();
			expect(page1.items[0].id).toBe('tx_newer');
			expect(page1.items[1].id).toBe('tx_identical_03');

			// Page 2: limit 2 using nextCursor
			const page2 = await repo.list(testUser, { limit: 2, cursor: page1.nextCursor! });
			expect(page2.items.length).toBe(2);
			expect(page2.hasMore).toBe(true);
			expect(page2.nextCursor).not.toBeNull();
			expect(page2.items[0].id).toBe('tx_identical_02');
			expect(page2.items[1].id).toBe('tx_identical_01');

			// Page 3: limit 2 using page2 cursor (last page)
			const page3 = await repo.list(testUser, { limit: 2, cursor: page2.nextCursor! });
			expect(page3.items.length).toBe(1);
			expect(page3.hasMore).toBe(false);
			expect(page3.nextCursor).toBeNull();
			expect(page3.items[0].id).toBe('tx_older');

			// Ensure all 5 items returned exactly once
			const allIds = [
				...page1.items.map((i) => i.id),
				...page2.items.map((i) => i.id),
				...page3.items.map((i) => i.id)
			];

			expect(allIds).toHaveLength(5);
			expect(new Set(allIds).size).toBe(5);
			expect(allIds).toEqual(['tx_newer', 'tx_identical_03', 'tx_identical_02', 'tx_identical_01', 'tx_older']);
		});

		it('returns empty result when cursor is beyond last item', async () => {
			const res = await repo.list(testUser, {
				limit: 10,
				cursor: '2026-01-01T00:00:00.000Z|some_id'
			});
			expect(res.items.length).toBe(0);
			expect(res.hasMore).toBe(false);
			expect(res.nextCursor).toBeNull();
		});
	});
});
