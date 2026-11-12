import { eq, and, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { wallets, type Wallet, type WalletType } from '../db/schema';
import { transactions } from '../db/schema';
import { calculateMultipleWalletBalances, calculateWalletBalance } from '../balance';

export interface WalletWithBalance extends Wallet {
	balance: number;
}

export interface CreateWalletInput {
	name: string;
	type: WalletType;
	initialBalance?: number;
	icon?: string | null;
}

export interface UpdateWalletInput {
	name?: string;
	type?: WalletType;
	icon?: string | null;
}

export class WalletsRepo {
	constructor(private db: AppDatabase) {}

	async list(userId: string, includeArchived = false): Promise<WalletWithBalance[]> {
		const whereClause = includeArchived
			? eq(wallets.userId, userId)
			: and(eq(wallets.userId, userId), eq(wallets.archived, false));

		const walletRows = await this.db.select().from(wallets).where(whereClause);
		if (walletRows.length === 0) return [];

		const userTransactions = await this.db
			.select({
				type: transactions.type,
				amount: transactions.amount,
				walletId: transactions.walletId,
				transferWalletId: transactions.transferWalletId
			})
			.from(transactions)
			.where(eq(transactions.userId, userId));

		const balances = calculateMultipleWalletBalances(walletRows, userTransactions);

		return walletRows.map((w) => ({
			...w,
			balance: balances.get(w.id) ?? w.initialBalance
		}));
	}

	async getById(userId: string, id: string): Promise<WalletWithBalance | null> {
		const [wallet] = await this.db
			.select()
			.from(wallets)
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
			.limit(1);

		if (!wallet) return null;

		const userTransactions = await this.db
			.select({
				type: transactions.type,
				amount: transactions.amount,
				walletId: transactions.walletId,
				transferWalletId: transactions.transferWalletId
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					sql`(${transactions.walletId} = ${id} OR ${transactions.transferWalletId} = ${id})`
				)
			);

		const balance = calculateWalletBalance(wallet.initialBalance, wallet.id, userTransactions);

		return {
			...wallet,
			balance
		};
	}

	async create(userId: string, input: CreateWalletInput): Promise<Wallet> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const [created] = await this.db
			.insert(wallets)
			.values({
				id,
				userId,
				name: input.name.trim(),
				type: input.type,
				initialBalance: Math.trunc(input.initialBalance ?? 0),
				icon: input.icon ?? null,
				archived: false,
				createdAt: now
			})
			.returning();

		return created;
	}

	async update(userId: string, id: string, input: UpdateWalletInput): Promise<Wallet | null> {
		const patch: Partial<typeof wallets.$inferInsert> = {};
		if (input.name !== undefined) patch.name = input.name.trim();
		if (input.type !== undefined) patch.type = input.type;
		if (input.icon !== undefined) patch.icon = input.icon;

		const [updated] = await this.db
			.update(wallets)
			.set(patch)
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
			.returning();

		return updated ?? null;
	}

	async archive(userId: string, id: string): Promise<boolean> {
		const res = await this.db
			.update(wallets)
			.set({ archived: true })
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
			.returning({ id: wallets.id });

		return res.length > 0;
	}

	async unarchive(userId: string, id: string): Promise<boolean> {
		const res = await this.db
			.update(wallets)
			.set({ archived: false })
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
			.returning({ id: wallets.id });

		return res.length > 0;
	}
}
