import { eq, and, isNull } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { wallets, type Wallet, type WalletType } from '../db/schema';
import { nowHLC, createHLCState } from '$lib/shared/hlc';

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
		const conditions = [eq(wallets.userId, userId), isNull(wallets.deletedAt)];
		if (!includeArchived) {
			conditions.push(eq(wallets.archived, false));
		}

		// Single-table query: strictly O(W) rows read, reading maintained current_balance
		const walletRows = await this.db
			.select()
			.from(wallets)
			.where(and(...conditions))
			.orderBy(wallets.createdAt);

		return walletRows.map((w) => ({
			...w,
			balance: w.currentBalance
		}));
	}

	async getById(userId: string, id: string): Promise<WalletWithBalance | null> {
		const [wallet] = await this.db
			.select()
			.from(wallets)
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id), isNull(wallets.deletedAt)))
			.limit(1);

		if (!wallet) return null;

		return {
			...wallet,
			balance: wallet.currentBalance
		};
	}

	async create(userId: string, input: CreateWalletInput): Promise<WalletWithBalance> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const initialBalance = input.initialBalance ?? 0;
		const serverNow = Date.now();
		const hlc = nowHLC(createHLCState('srv'), serverNow);

		const [created] = await this.db
			.insert(wallets)
			.values({
				id,
				userId,
				name: input.name.trim(),
				type: input.type,
				initialBalance,
				currentBalance: initialBalance,
				icon: input.icon ?? null,
				archived: false,
				hlc,
				serverUpdatedAt: serverNow,
				deletedAt: null,
				createdAt: now
			})
			.returning();

		return {
			...created,
			balance: created.currentBalance
		};
	}

	async update(userId: string, id: string, input: UpdateWalletInput): Promise<WalletWithBalance | null> {
		const existing = await this.getById(userId, id);
		if (!existing) return null;

		const serverNow = Date.now();
		const hlc = nowHLC(createHLCState('srv'), serverNow);

		const [updated] = await this.db
			.update(wallets)
			.set({
				...(input.name !== undefined ? { name: input.name.trim() } : {}),
				...(input.type !== undefined ? { type: input.type } : {}),
				...(input.icon !== undefined ? { icon: input.icon } : {}),
				hlc,
				serverUpdatedAt: serverNow
			})
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
			.returning();

		return updated ? { ...updated, balance: updated.currentBalance } : null;
	}

	async setArchived(userId: string, id: string, archived: boolean): Promise<WalletWithBalance | null> {
		const serverNow = Date.now();
		const hlc = nowHLC(createHLCState('srv'), serverNow);

		const [updated] = await this.db
			.update(wallets)
			.set({
				archived,
				hlc,
				serverUpdatedAt: serverNow
			})
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)))
			.returning();

		return updated ? { ...updated, balance: updated.currentBalance } : null;
	}

	async archive(userId: string, id: string): Promise<boolean> {
		const res = await this.setArchived(userId, id, true);
		return Boolean(res);
	}

	async delete(userId: string, id: string): Promise<boolean> {
		const serverNow = Date.now();
		const hlc = nowHLC(createHLCState('srv'), serverNow);

		// Soft-delete tombstone
		const result = await this.db
			.update(wallets)
			.set({
				deletedAt: new Date().toISOString(),
				hlc,
				serverUpdatedAt: serverNow
			})
			.where(and(eq(wallets.userId, userId), eq(wallets.id, id)));

		return (result.meta?.changes ?? 0) > 0;
	}
}
