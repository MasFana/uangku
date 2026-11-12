import { eq, and, gte, lte, asc, desc } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { transactions, categories, wallets, type Transaction } from '../db/schema';
import type { AnalyticsTypeFilter } from '../stats';

export interface StatsRepoFilter {
	from: string; // ISO string
	to: string; // ISO string
	walletId?: string;
	categoryId?: string;
	type?: AnalyticsTypeFilter;
}

export interface StatsTransactionItem {
	id: string;
	walletId: string;
	categoryId: string | null;
	type: 'expense' | 'income' | 'transfer';
	amount: number;
	transferWalletId: string | null;
	note: string | null;
	occurredAt: string;
	categoryName: string | null;
	categoryColor: string | null;
	walletName: string | null;
}

export class StatsRepo {
	constructor(private db: AppDatabase) {}

	/**
	 * Gets the earliest occurred_at timestamp for a user.
	 */
	async getEarliestOccurredAt(userId: string): Promise<string | null> {
		const [firstTx] = await this.db
			.select({ occurredAt: transactions.occurredAt })
			.from(transactions)
			.where(eq(transactions.userId, userId))
			.orderBy(asc(transactions.occurredAt))
			.limit(1);

		return firstTx?.occurredAt ?? null;
	}

	/**
	 * Fetches filtered transactions for the analytics period with joined wallet and category names.
	 */
	async getAnalyticsTransactions(
		userId: string,
		filter: StatsRepoFilter
	): Promise<StatsTransactionItem[]> {
		const conditions = [
			eq(transactions.userId, userId),
			gte(transactions.occurredAt, filter.from),
			lte(transactions.occurredAt, filter.to)
		];

		if (filter.walletId) {
			conditions.push(eq(transactions.walletId, filter.walletId));
		}
		if (filter.categoryId) {
			conditions.push(eq(transactions.categoryId, filter.categoryId));
		}
		if (filter.type && filter.type !== 'all') {
			conditions.push(eq(transactions.type, filter.type));
		}

		const rows = await this.db
			.select({
				id: transactions.id,
				walletId: transactions.walletId,
				categoryId: transactions.categoryId,
				type: transactions.type,
				amount: transactions.amount,
				transferWalletId: transactions.transferWalletId,
				note: transactions.note,
				occurredAt: transactions.occurredAt,
				categoryName: categories.name,
				categoryColor: categories.color,
				walletName: wallets.name
			})
			.from(transactions)
			.leftJoin(categories, eq(transactions.categoryId, categories.id))
			.leftJoin(wallets, eq(transactions.walletId, wallets.id))
			.where(and(...conditions))
			.orderBy(asc(transactions.occurredAt), asc(transactions.id));

		return rows;
	}

	/**
	 * Computes income, expense, net for a given date range (e.g. previous period).
	 * Excludes transfers.
	 */
	async getRangeTotals(
		userId: string,
		from: string,
		to: string,
		walletId?: string,
		categoryId?: string,
		type?: AnalyticsTypeFilter
	): Promise<{ income: number; expense: number; net: number }> {
		const conditions = [
			eq(transactions.userId, userId),
			gte(transactions.occurredAt, from),
			lte(transactions.occurredAt, to)
		];

		if (walletId) {
			conditions.push(eq(transactions.walletId, walletId));
		}
		if (categoryId) {
			conditions.push(eq(transactions.categoryId, categoryId));
		}
		if (type && type !== 'all') {
			conditions.push(eq(transactions.type, type));
		}

		const rows = await this.db
			.select({
				type: transactions.type,
				amount: transactions.amount
			})
			.from(transactions)
			.where(and(...conditions));

		let income = 0;
		let expense = 0;

		for (const r of rows) {
			const amt = Math.trunc(r.amount) || 0;
			if (amt <= 0) continue;
			if (r.type === 'income') {
				income += amt;
			} else if (r.type === 'expense') {
				expense += amt;
			}
		}

		return {
			income,
			expense,
			net: income - expense
		};
	}

	/**
	 * Lists all user active wallets and categories for options dropdown.
	 */
	async getFilterOptions(userId: string): Promise<{
		wallets: Array<{ id: string; name: string }>;
		categories: Array<{ id: string; name: string; kind: string }>;
	}> {
		const [userWallets, userCategories] = await Promise.all([
			this.db
				.select({ id: wallets.id, name: wallets.name })
				.from(wallets)
				.where(and(eq(wallets.userId, userId), eq(wallets.archived, false)))
				.orderBy(asc(wallets.name)),
			this.db
				.select({ id: categories.id, name: categories.name, kind: categories.kind })
				.from(categories)
				.where(and(eq(categories.userId, userId), eq(categories.archived, false)))
				.orderBy(asc(categories.name))
		]);

		return {
			wallets: userWallets,
			categories: userCategories
		};
	}
}
