import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from '../src/lib/server/db/schema';
import { WalletsRepo } from '../src/lib/server/repos/wallets';
import { CategoriesRepo } from '../src/lib/server/repos/categories';
import { TransactionsRepo } from '../src/lib/server/repos/transactions';
import type { D1Database } from '@cloudflare/workers-types';

describe('Tenant Isolation Tests (D1 Integration)', () => {
	let mf: Miniflare;
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let walletsRepo: WalletsRepo;
	let categoriesRepo: CategoriesRepo;
	let transactionsRepo: TransactionsRepo;

	const userA = 'user-alice-uuid-1';
	const userB = 'user-bob-uuid-2';

	beforeAll(async () => {
		mf = new Miniflare({
			workers: [
				{
					config: {
						name: 'uangku-test-worker',
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
							APP_DB: { type: 'd1', id: 'test-isolation-db' }
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
		walletsRepo = new WalletsRepo(db);
		categoriesRepo = new CategoriesRepo(db);
		transactionsRepo = new TransactionsRepo(db);

		// Seed users
		const now = new Date();
		await db.insert(schema.users).values([
			{ id: userA, name: 'Alice', email: 'alice@example.com', createdAt: now, updatedAt: now },
			{ id: userB, name: 'Bob', email: 'bob@example.com', createdAt: now, updatedAt: now }
		]);
	});

	afterAll(async () => {
		if (mf) {
			await mf.dispose();
		}
	});

	it('isolates wallets between users', async () => {
		const aliceWallet = await walletsRepo.create(userA, {
			name: 'Alice Bank',
			type: 'bank',
			initialBalance: 1_000_000
		});

		const bobWallet = await walletsRepo.create(userB, {
			name: 'Bob Cash',
			type: 'cash',
			initialBalance: 200_000
		});

		// User A only sees User A's wallets
		const aliceWallets = await walletsRepo.list(userA);
		expect(aliceWallets.some((w) => w.id === aliceWallet.id)).toBe(true);
		expect(aliceWallets.some((w) => w.id === bobWallet.id)).toBe(false);

		// User B cannot get User A's wallet by ID
		const bobAttempt = await walletsRepo.getById(userB, aliceWallet.id);
		expect(bobAttempt).toBeNull();

		// User B cannot update User A's wallet
		const updateAttempt = await walletsRepo.update(userB, aliceWallet.id, { name: 'Hacked' });
		expect(updateAttempt).toBeNull();
	});

	it('isolates categories between users', async () => {
		const aliceCat = await categoriesRepo.create(userA, {
			name: 'Belanja Alice',
			kind: 'expense'
		});

		const bobCat = await categoriesRepo.create(userB, {
			name: 'Belanja Bob',
			kind: 'expense'
		});

		// Alice cannot see Bob's category in list
		const aliceList = await categoriesRepo.list(userA);
		expect(aliceList.some((c) => c.id === aliceCat.id)).toBe(true);
		expect(aliceList.some((c) => c.id === bobCat.id)).toBe(false);

		// Bob cannot fetch Alice's category by ID
		const bobFetch = await categoriesRepo.getById(userB, aliceCat.id);
		expect(bobFetch).toBeNull();

		// Bob cannot archive Alice's category
		const archiveResult = await categoriesRepo.archive(userB, aliceCat.id);
		expect(archiveResult).toBe(false);
	});

	it('isolates transactions between users', async () => {
		const aliceWallet = await walletsRepo.create(userA, {
			name: 'Alice Savings',
			type: 'bank',
			initialBalance: 500_000
		});

		const aliceTx = await transactionsRepo.create(userA, {
			walletId: aliceWallet.id,
			type: 'expense',
			amount: 50_000,
			note: 'Coffee'
		});

		// Bob cannot see Alice's transaction in list
		const bobTxList = await transactionsRepo.list(userB);
		expect(bobTxList.items.some((t) => t.id === aliceTx.id)).toBe(false);

		// Bob cannot get Alice's transaction by ID
		const bobFetch = await transactionsRepo.getById(userB, aliceTx.id);
		expect(bobFetch).toBeNull();

		// Bob cannot update Alice's transaction (returns null, Alice's data unchanged)
		const bobUpdate = await transactionsRepo.update(userB, aliceTx.id, { amount: 10_000, note: 'Hacked note' });
		expect(bobUpdate).toBeNull();

		// Bob cannot delete Alice's transaction (returns false, Alice's data intact)
		const bobDelete = await transactionsRepo.delete(userB, aliceTx.id);
		expect(bobDelete).toBe(false);

		// Verify Alice's transaction still intact after unauthorized update & delete attempts
		const aliceFetch = await transactionsRepo.getById(userA, aliceTx.id);
		expect(aliceFetch).not.toBeNull();
		expect(aliceFetch?.amount).toBe(50_000);
		expect(aliceFetch?.note).toBe('Coffee');
	});

	it('strictly isolates wallet mutation and archiving between users', async () => {
		const aliceWallet = await walletsRepo.create(userA, {
			name: 'Alice Vault',
			type: 'bank',
			initialBalance: 2_500_000
		});

		// Bob attempts to update Alice's wallet
		const bobUpdate = await walletsRepo.update(userB, aliceWallet.id, {
			name: 'Bob Hijacked Vault'
		});
		expect(bobUpdate).toBeNull();

		// Bob attempts to archive Alice's wallet
		const bobArchive = await walletsRepo.archive(userB, aliceWallet.id);
		expect(bobArchive).toBe(false);

		// Verify Alice's wallet data remains original and active
		const aliceWalletCheck = await walletsRepo.getById(userA, aliceWallet.id);
		expect(aliceWalletCheck).not.toBeNull();
		expect(aliceWalletCheck?.name).toBe('Alice Vault');
		expect(aliceWalletCheck?.archived).toBe(false);
	});

	it('strictly isolates category mutation and archiving between users', async () => {
		const aliceCat = await categoriesRepo.create(userA, {
			name: 'Alice Investment',
			kind: 'expense'
		});

		// Bob attempts to update Alice's category
		const bobUpdate = await categoriesRepo.update(userB, aliceCat.id, {
			name: 'Bob Hijacked Category'
		});
		expect(bobUpdate).toBeNull();

		// Bob attempts to archive Alice's category
		const bobArchive = await categoriesRepo.archive(userB, aliceCat.id);
		expect(bobArchive).toBe(false);

		// Bob attempts to unarchive Alice's category
		const bobUnarchive = await categoriesRepo.unarchive(userB, aliceCat.id);
		expect(bobUnarchive).toBe(false);

		// Verify Alice's category remains original and active
		const aliceCatCheck = await categoriesRepo.getById(userA, aliceCat.id);
		expect(aliceCatCheck).not.toBeNull();
		expect(aliceCatCheck?.name).toBe('Alice Investment');
		expect(aliceCatCheck?.archived).toBe(false);
	});

	it('prevents cross-user wallet transfers', async () => {
		const aliceWallet = await walletsRepo.create(userA, {
			name: 'Alice Source',
			type: 'bank',
			initialBalance: 300_000
		});

		const bobWallet = await walletsRepo.create(userB, {
			name: 'Bob Target',
			type: 'bank',
			initialBalance: 100_000
		});

		// Alice tries to transfer to Bob's wallet using transfer repo
		await expect(
			transactionsRepo.transfer(userA, {
				sourceWalletId: aliceWallet.id,
				targetWalletId: bobWallet.id,
				amount: 50_000
			})
		).rejects.toThrow('Target wallet not found');
	});
});
