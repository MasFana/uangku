import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../src/lib/server/db/schema';
import { DEFAULT_CATEGORIES } from '../src/lib/server/defaults';
import { seedDefaultCategories, listCategories } from '../src/lib/server/services/categories';
import type { AppEvent } from '../src/lib/server/types';
import type { D1Database } from '@cloudflare/workers-types';

describe('Default Categories Seeding Unit & Integration Tests', () => {
	let mf: Miniflare;
	let db: ReturnType<typeof drizzle<typeof schema>>;

	const userA = 'user-cat-alice';
	const userB = 'user-cat-bob';
	const userC = 'user-cat-charlie';
	const userD = 'user-cat-david';

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
						name: 'uangku-cat-worker',
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
							APP_DB: { type: 'd1', id: 'test-categories-db' }
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
			{ id: userA, name: 'Alice', email: 'alice@cat.test', createdAt: now, updatedAt: now },
			{ id: userB, name: 'Bob', email: 'bob@cat.test', createdAt: now, updatedAt: now },
			{ id: userC, name: 'Charlie', email: 'charlie@cat.test', createdAt: now, updatedAt: now },
			{ id: userD, name: 'David', email: 'david@cat.test', createdAt: now, updatedAt: now }
		]);
	});

	afterAll(async () => {
		if (mf) await mf.dispose();
	});

	it('has exactly 17 default categories (12 expense + 5 income)', () => {
		expect(DEFAULT_CATEGORIES).toHaveLength(17);

		const expenseDefaults = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense');
		const incomeDefaults = DEFAULT_CATEGORIES.filter((c) => c.kind === 'income');
		expect(expenseDefaults).toHaveLength(12);
		expect(incomeDefaults).toHaveLength(5);
	});

	it('seeds 17 categories when user has no categories, matching constants with icon null', async () => {
		const event = makeEvent(userA);

		const initialList = await listCategories(event);
		expect(initialList).toHaveLength(0);

		const insertedCount = await seedDefaultCategories(event);
		expect(insertedCount).toBe(17);

		const categoriesAfter = await listCategories(event);
		expect(categoriesAfter).toHaveLength(17);

		// Verify every inserted category matches DEFAULT_CATEGORIES name/kind/color and icon is null
		for (const def of DEFAULT_CATEGORIES) {
			const found = categoriesAfter.find((c) => c.kind === def.kind && c.name === def.name);
			expect(found).toBeDefined();
			expect(found?.color).toBe(def.color);
			expect(found?.icon).toBeNull();
			expect(found?.archived).toBe(false);
		}
	});

	it('is idempotent: second call inserts 0 and row count does not increase', async () => {
		const event = makeEvent(userA);

		const countSecondCall = await seedDefaultCategories(event);
		expect(countSecondCall).toBe(0);

		const list = await listCategories(event);
		expect(list).toHaveLength(17);
	});

	it('skips existing categories case-insensitively and inserts the remainder', async () => {
		const event = makeEvent(userB);

		// Pre-create lowercase "gaji" (income) and "makan & minum" (expense)
		const now = new Date().toISOString();
		await db.insert(schema.categories).values([
			{
				id: 'b-gaji',
				userId: userB,
				name: 'gaji', // lowercase
				kind: 'income',
				color: '#111111',
				icon: null,
				archived: false,
				createdAt: now
			},
			{
				id: 'b-makan',
				userId: userB,
				name: 'Makan & Minum',
				kind: 'expense',
				color: '#222222',
				icon: null,
				archived: false,
				createdAt: now
			}
		]);

		const inserted = await seedDefaultCategories(event);
		// 17 - 2 = 15 inserted
		expect(inserted).toBe(15);

		const totalBob = await listCategories(event);
		expect(totalBob).toHaveLength(17);

		// The pre-created "gaji" should keep its original color '#111111'
		const userGaji = totalBob.find((c) => c.kind === 'income' && c.name.toLowerCase() === 'gaji');
		expect(userGaji?.color).toBe('#111111');
	});

	it('inserts both "Lain-lain" categories (one expense and one income) using (kind, name) matching', async () => {
		const event = makeEvent(userC);

		await seedDefaultCategories(event);
		const list = await listCategories(event);

		const lainLainList = list.filter((c) => c.name.toLowerCase() === 'lain-lain');
		expect(lainLainList).toHaveLength(2);

		const expenseLain = lainLainList.find((c) => c.kind === 'expense');
		const incomeLain = lainLainList.find((c) => c.kind === 'income');
		expect(expenseLain).toBeDefined();
		expect(incomeLain).toBeDefined();
	});

	it('maintains user scope: Alice categories do not prevent Charlie or David from seeding', async () => {
		// David has no categories yet despite Alice, Bob, and Charlie having seeded
		const eventDavid = makeEvent(userD);

		const before = await listCategories(eventDavid);
		expect(before).toHaveLength(0);

		const insertedDavid = await seedDefaultCategories(eventDavid);
		expect(insertedDavid).toBe(17);
	});

	it('treats archived categories: list(includeArchived: false) ignores archived, allowing re-seed', async () => {
		// Observation check:
		// seedDefaultCategories reads repo.list(userId, { includeArchived: false })
		// Therefore, if an existing category was archived, it is NOT in existingSet,
		// and seedDefaultCategories WILL insert a fresh active default category.
		const event = makeEvent(userB);

		// Archive Bob's 'gaji'
		const allBob = await listCategories(event, { includeArchived: true });
		const gajiBob = allBob.find((c) => c.kind === 'income' && c.name.toLowerCase() === 'gaji');
		expect(gajiBob).toBeDefined();

		await db
			.update(schema.categories)
			.set({ archived: true })
			.where(eq(schema.categories.id, gajiBob!.id));

		// Call seedDefaultCategories again
		const reseededCount = await seedDefaultCategories(event);
		expect(reseededCount).toBe(1); // 'Gaji' re-inserted as active

		const activeBobAfter = await listCategories(event, { includeArchived: false });
		const activeGaji = activeBobAfter.filter((c) => c.kind === 'income' && c.name.toLowerCase() === 'gaji');
		expect(activeGaji).toHaveLength(1);
		expect(activeGaji[0].name).toBe('Gaji'); // Default seeded name
	});
});
