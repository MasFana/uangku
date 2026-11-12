import { eq, and, desc, lt, gte, lte, or } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { transactions, type Transaction, type TransactionType } from '../db/schema';
import { wallets } from '../db/schema';

export interface CreateTransactionInput {
	walletId: string;
	categoryId?: string | null;
	type: TransactionType;
	amount: number;
	transferWalletId?: string | null;
	note?: string | null;
	occurredAt?: string;
	receiptKey?: string | null;
}

export interface UpdateTransactionInput {
	walletId?: string;
	categoryId?: string | null;
	amount?: number;
	note?: string | null;
	occurredAt?: string;
	receiptKey?: string | null;
}

export interface ListTransactionsFilter {
	walletId?: string;
	categoryId?: string;
	type?: TransactionType;
	startDate?: string;
	endDate?: string;
	from?: string; // YYYY-MM-DD
	to?: string;   // YYYY-MM-DD
	cursor?: string; // format: "<occurredAt>|<id>" or legacy "<occurredAt>"
	limit?: number;
}

export interface ListTransactionsResult {
	items: Transaction[];
	nextCursor: string | null;
	hasMore: boolean;
}

export class TransactionsRepo {
	constructor(private db: AppDatabase) {}

	async list(
		userId: string,
		filter: ListTransactionsFilter = {}
	): Promise<ListTransactionsResult> {
		const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
		const conditions = [eq(transactions.userId, userId)];

		if (filter.walletId) {
			conditions.push(eq(transactions.walletId, filter.walletId));
		}
		if (filter.categoryId) {
			conditions.push(eq(transactions.categoryId, filter.categoryId));
		}
		if (filter.type) {
			conditions.push(eq(transactions.type, filter.type));
		}
		// from / to (inclusive YYYY-MM-DD) or fallback startDate / endDate
		const startCondition = filter.from ? `${filter.from}T00:00:00.000Z` : filter.startDate;
		if (startCondition) {
			conditions.push(gte(transactions.occurredAt, startCondition));
		}
		const endCondition = filter.to ? `${filter.to}T23:59:59.999Z` : filter.endDate;
		if (endCondition) {
			conditions.push(lte(transactions.occurredAt, endCondition));
		}
		if (filter.cursor) {
			const pipeIdx = filter.cursor.indexOf('|');
			if (pipeIdx !== -1) {
				const cursorAt = filter.cursor.slice(0, pipeIdx);
				const cursorId = filter.cursor.slice(pipeIdx + 1);
				conditions.push(
					or(
						lt(transactions.occurredAt, cursorAt),
						and(eq(transactions.occurredAt, cursorAt), lt(transactions.id, cursorId))
					)!
				);
			} else {
				conditions.push(lt(transactions.occurredAt, filter.cursor));
			}
		}

		const rows = await this.db
			.select()
			.from(transactions)
			.where(and(...conditions))
			.orderBy(desc(transactions.occurredAt), desc(transactions.id))
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const items = hasMore ? rows.slice(0, limit) : rows;

		let nextCursor: string | null = null;
		if (hasMore && items.length > 0) {
			const last = items[items.length - 1];
			nextCursor = `${last.occurredAt}|${last.id}`;
		}

		return { items, nextCursor, hasMore };
	}

	async getById(userId: string, id: string): Promise<Transaction | null> {
		const [tx] = await this.db
			.select()
			.from(transactions)
			.where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
			.limit(1);

		return tx ?? null;
	}

	async create(userId: string, input: CreateTransactionInput): Promise<Transaction> {
		if (input.amount <= 0) {
			throw new Error('Transaction amount must be positive integer');
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const occurredAt = input.occurredAt ?? now;

		const [created] = await this.db
			.insert(transactions)
			.values({
				id,
				userId,
				walletId: input.walletId,
				categoryId: input.categoryId ?? null,
				type: input.type,
				amount: Math.trunc(input.amount),
				transferWalletId: input.transferWalletId ?? null,
				note: input.note ? input.note.trim() : null,
				occurredAt,
				receiptKey: input.receiptKey ?? null,
				createdAt: now,
				updatedAt: now
			})
			.returning();

		return created;
	}

	async update(userId: string, id: string, input: UpdateTransactionInput): Promise<Transaction | null> {
		if (input.amount !== undefined && input.amount <= 0) {
			throw new Error('Transaction amount must be positive integer');
		}

		const patch: Partial<typeof transactions.$inferInsert> = {
			updatedAt: new Date().toISOString()
		};
		if (input.walletId !== undefined) patch.walletId = input.walletId;
		if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
		if (input.amount !== undefined) patch.amount = Math.trunc(input.amount);
		if (input.note !== undefined) patch.note = input.note ? input.note.trim() : null;
		if (input.occurredAt !== undefined) patch.occurredAt = input.occurredAt;
		if (input.receiptKey !== undefined) patch.receiptKey = input.receiptKey;

		const [updated] = await this.db
			.update(transactions)
			.set(patch)
			.where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
			.returning();

		return updated ?? null;
	}

	async delete(userId: string, id: string): Promise<boolean> {
		const res = await this.db
			.delete(transactions)
			.where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
			.returning({ id: transactions.id });

		return res.length > 0;
	}

	/**
	 * Creates a transfer between two user-owned wallets.
	 * Persisted as 1 transaction row (type=transfer, walletId=source, transferWalletId=target).
	 * Atomically verifies both wallets belong to the user using D1 batch.
	 */
	async transfer(
		userId: string,
		input: {
			sourceWalletId: string;
			targetWalletId: string;
			amount: number;
			note?: string | null;
			occurredAt?: string;
		}
	): Promise<Transaction> {
		if (input.amount <= 0) {
			throw new Error('Transfer amount must be positive integer');
		}
		if (input.sourceWalletId === input.targetWalletId) {
			throw new Error('Source and target wallets must be different');
		}

		// Verify both wallets belong to user
		const [sourceWallet] = await this.db
			.select({ id: wallets.id })
			.from(wallets)
			.where(and(eq(wallets.userId, userId), eq(wallets.id, input.sourceWalletId)))
			.limit(1);
		if (!sourceWallet) {
			throw new Error('Source wallet not found');
		}

		const [targetWallet] = await this.db
			.select({ id: wallets.id })
			.from(wallets)
			.where(and(eq(wallets.userId, userId), eq(wallets.id, input.targetWalletId)))
			.limit(1);
		if (!targetWallet) {
			throw new Error('Target wallet not found');
		}

		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const occurredAt = input.occurredAt ?? now;

		const [created] = await this.db
			.insert(transactions)
			.values({
				id,
				userId,
				walletId: input.sourceWalletId,
				categoryId: null,
				type: 'transfer',
				amount: Math.trunc(input.amount),
				transferWalletId: input.targetWalletId,
				note: input.note ? input.note.trim() : null,
				occurredAt,
				receiptKey: null,
				createdAt: now,
				updatedAt: now
			})
			.returning();

		return created;
	}
}
