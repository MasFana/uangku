import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../src/lib/server/db/schema';
import { WalletsRepo } from '../src/lib/server/repos/wallets';
import { CategoriesRepo } from '../src/lib/server/repos/categories';
import { TransactionsRepo } from '../src/lib/server/repos/transactions';

const userA = 'user-alice-uuid-1';
const userB = 'user-bob-uuid-2';

type Env = { APP_DB: D1Database };

let proxy: PlatformProxy<Env>;
let db: DrizzleD1Database<typeof schema>;
let walletsRepo: WalletsRepo;
let categoriesRepo: CategoriesRepo;
let transactionsRepo: TransactionsRepo;

async function applyMigrations(d1: D1Database): Promise<void> {
	// All migrations in order. 0003 drops and re-creates the wallet-mutating
	// triggers with `AND user_id = NEW.user_id` scoping — that scoping is what
	// makes the cross-user balance assertions below hold.
	for (const file of [
		'drizzle/0000_useful_black_widow.sql',
		'drizzle/0001_backfill_default_categories.sql',
		'drizzle/0002_hlc_sync_rollups_triggers.sql',
		'drizzle/0003_category_watermark_scoped_triggers.sql'
	]) {
		const sqlContent = readFileSync(join(__dirname, '..', file), 'utf8');
		const statements = sqlContent
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);
		for (const statement of statements) {
			await d1.prepare(statement).run();
		}
	}
}

describe('Tenant Isolation Tests (D1 Integration)', () => {
	beforeAll(async () => {
		proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false });
		await applyMigrations(proxy.env.APP_DB);
		db = drizzle(proxy.env.APP_DB, { schema });
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
		await proxy?.dispose();
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
		const bobUpdate = await transactionsRepo.update(userB, aliceTx.id, {
			amount: 10_000,
			note: 'Hacked note'
		});
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
			initialBalance: 1_000_000
		});
		const bobWallet = await walletsRepo.create(userB, {
			name: 'Bob Destination',
			type: 'cash',
			initialBalance: 100_000
		});

		// Alice tries to transfer to Bob's wallet using the transfer repo
		await expect(
			transactionsRepo.transfer(userA, {
				sourceWalletId: aliceWallet.id,
				targetWalletId: bobWallet.id,
				amount: 50_000
			})
		).rejects.toThrow('Target wallet not found');
	});

	it("does not mutate another user's balances when a transaction points at their wallet", async () => {
		const aliceWallet = await walletsRepo.create(userA, {
			name: 'Alice Balance Vault',
			type: 'bank',
			initialBalance: 1_000_000
		});
		const aliceCat = await categoriesRepo.create(userA, {
			name: 'Alice Groceries',
			kind: 'expense'
		});

		const before = await walletsRepo.getById(userA, aliceWallet.id);
		expect(before?.balance).toBe(1_000_000);

		// Bob inserts a transaction that (deliberately) points at Alice's wallet
		// and category. The wallet-mutating trigger is user-scoped, so it must not
		// touch Alice's current_balance.
		const crossTx = await transactionsRepo.create(userB, {
			walletId: aliceWallet.id,
			categoryId: aliceCat.id,
			type: 'expense',
			amount: 250_000,
			note: 'cross-tenant'
		});

		const afterInsert = await walletsRepo.getById(userA, aliceWallet.id);
		expect(afterInsert?.balance).toBe(1_000_000);

		// Soft-deleting Bob's cross-tenant row must not re-credit Alice either.
		expect(await transactionsRepo.delete(userB, crossTx.id)).toBe(true);

		const afterDelete = await walletsRepo.getById(userA, aliceWallet.id);
		expect(afterDelete?.balance).toBe(1_000_000);
	});
});
