import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../src/lib/server/db/schema';
import { DEFAULT_CATEGORIES } from '../src/lib/server/defaults';
import {
	seedDefaultsForUser,
	seedDefaultCategories,
	listCategories
} from '../src/lib/server/services/categories';
import { createAuth } from '../src/lib/server/auth';
import type { AppEvent } from '../src/lib/server/types';
import type { D1Database } from '@cloudflare/workers-types';

describe('Default Categories Auto-seed & Backfill Tests', () => {
	let mf: Miniflare;
	let d1: D1Database;
	let db: ReturnType<typeof drizzle<typeof schema>>;

	const userA = 'user-autoseed-alice';
	const userB = 'user-autoseed-bob';
	const userC = 'user-autoseed-charlie';
	const userD = 'user-autoseed-david';

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
						name: 'uangku-autoseed-worker',
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
							APP_DB: { type: 'd1', id: 'test-autoseed-db' }
						}
					}
				}
			]
		});

		d1 = (await mf.getD1Database('APP_DB')) as unknown as D1Database;

		// Apply baseline migration
		const baseMigrationPath = path.resolve('drizzle/0000_useful_black_widow.sql');
		const baseSql = fs.readFileSync(baseMigrationPath, 'utf8');
		const baseStatements = baseSql
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);

		for (const stmt of baseStatements) {
			await d1.prepare(stmt).run();
		}

		db = drizzle(d1, { schema });

		const now = new Date();
		await db.insert(schema.users).values([
			{ id: userA, name: 'Alice', email: 'alice@autoseed.test', createdAt: now, updatedAt: now },
			{ id: userB, name: 'Bob', email: 'bob@autoseed.test', createdAt: now, updatedAt: now },
			{ id: userC, name: 'Charlie', email: 'charlie@autoseed.test', createdAt: now, updatedAt: now }
		]);
	});

	afterAll(async () => {
		if (mf) await mf.dispose();
	});

	it('seedDefaultsForUser: inserts 17 categories (12 expense + 5 income) without duplicates', async () => {
		const inserted = await seedDefaultsForUser(db, userA);
		expect(inserted).toBe(17);

		const rows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, userA));

		expect(rows).toHaveLength(17);

		const expenseRows = rows.filter((r) => r.kind === 'expense');
		const incomeRows = rows.filter((r) => r.kind === 'income');
		expect(expenseRows).toHaveLength(12);
		expect(incomeRows).toHaveLength(5);

		// Unique constraint check
		const keys = rows.map((r) => `${r.kind}:${r.name.toLowerCase()}`);
		const uniqueKeys = new Set(keys);
		expect(uniqueKeys.size).toBe(17);
	});

	it('seedDefaultsForUser: second call returns 0 and leaves row count unchanged', async () => {
		const secondCallCount = await seedDefaultsForUser(db, userA);
		expect(secondCallCount).toBe(0);

		const rows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, userA));
		expect(rows).toHaveLength(17);
	});

	it('seedDefaultsForUser: inserts only missing when user already has partial categories', async () => {
		const now = new Date().toISOString();
		// Pre-create 1 category
		await db.insert(schema.categories).values({
			id: 'b-makan-existing',
			userId: userB,
			name: 'Makan & Minum',
			kind: 'expense',
			color: '#0f766e',
			icon: null,
			archived: false,
			createdAt: now
		});

		const inserted = await seedDefaultsForUser(db, userB);
		expect(inserted).toBe(16);

		const rows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, userB));
		expect(rows).toHaveLength(17);
	});

	it('auth signUpEmail / databaseHooks: auto-seeds 17 categories for newly registered user', async () => {
		const auth = createAuth({
			APP_DB: d1,
			BETTER_AUTH_SECRET: 'test-secret-at-least-32-chars-long-123456789'
		});

		const res = await auth.api.signUpEmail({
			body: {
				email: 'newuser@autoseed.test',
				password: 'Password123!',
				name: 'New Registered User'
			}
		});

		expect(res).toBeDefined();
		expect(res.user?.id).toBeDefined();

		const newUserId = res.user.id;
		const rows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, newUserId));

		expect(rows).toHaveLength(17);
	});

	it('backfill migration: backfills 17 categories for existing user with 0 categories and is idempotent', async () => {
		// userC was created before and currently has 0 categories
		const beforeRows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, userC));
		expect(beforeRows).toHaveLength(0);

		// Execute custom backfill migration SQL
		const backfillPath = path.resolve('drizzle/0001_backfill_default_categories.sql');
		const backfillSql = fs.readFileSync(backfillPath, 'utf8');
		await d1.prepare(backfillSql).run();

		const afterRows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, userC));
		expect(afterRows).toHaveLength(17);

		// Execute backfill migration SQL second time
		await d1.prepare(backfillSql).run();

		const secondAfterRows = await db
			.select()
			.from(schema.categories)
			.where(eq(schema.categories.userId, userC));
		expect(secondAfterRows).toHaveLength(17);
	});
});
