import { eq, and, gte, lte, asc, isNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { transactions, categories, wallets } from '../db/schema';
import { monthlyRollups } from '../db/schema';
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
			.where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
			.orderBy(asc(transactions.occurredAt))
			.limit(1);

		return firstTx?.occurredAt ?? null;
	}

	/**
	 * Fetches filtered transactions for analytics using in-memory V8 joins (0 SQL JOIN on master tables).
	 */
	async getAnalyticsTransactions(
		userId: string,
		filter: StatsRepoFilter
	): Promise<StatsTransactionItem[]> {
		const conditions = [
			eq(transactions.userId, userId),
			isNull(transactions.deletedAt),
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

		// Single IPC round-trip: fetch transactions, categories, and wallets in batch or parallel
		const [txRows, categoryRows, walletRows] = await Promise.all([
			this.db
				.select({
					id: transactions.id,
					walletId: transactions.walletId,
					categoryId: transactions.categoryId,
					type: transactions.type,
					amount: transactions.amount,
					transferWalletId: transactions.transferWalletId,
					note: transactions.note,
					occurredAt: transactions.occurredAt
				})
				.from(transactions)
				.where(and(...conditions))
				.orderBy(asc(transactions.occurredAt), asc(transactions.id)),
			this.db
				.select({ id: categories.id, name: categories.name, color: categories.color })
				.from(categories)
				.where(eq(categories.userId, userId)),
			this.db
				.select({ id: wallets.id, name: wallets.name })
				.from(wallets)
				.where(eq(wallets.userId, userId))
		]);

		// O(1) in-memory Map Joins
		const catMap = new Map(categoryRows.map((c) => [c.id, c]));
		const walletMap = new Map(walletRows.map((w) => [w.id, w.name]));

		return txRows.map((t) => {
			const cat = t.categoryId ? catMap.get(t.categoryId) : undefined;
			return {
				id: t.id,
				walletId: t.walletId,
				categoryId: t.categoryId,
				type: t.type,
				amount: t.amount,
				transferWalletId: t.transferWalletId,
				note: t.note,
				occurredAt: t.occurredAt,
				categoryName: cat?.name ?? null,
				categoryColor: cat?.color ?? null,
				walletName: walletMap.get(t.walletId) ?? null
			};
		});
	}

	/**
	 * Computes income, expense, net for a given date range using SQL COALESCE(SUM).
	 * Fast path: if full months and no granular category/type filters, uses monthly_rollups.
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
			isNull(transactions.deletedAt),
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

		// Single-row SQL aggregate: reads 0 raw rows into Worker memory
		const [result] = await this.db
			.select({
				income: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
				expense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`
			})
			.from(transactions)
			.where(and(...conditions));

		const income = Number(result?.income) || 0;
		const expense = Number(result?.expense) || 0;

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
				.where(and(eq(wallets.userId, userId), eq(wallets.archived, false), isNull(wallets.deletedAt)))
				.orderBy(asc(wallets.name)),
			this.db
				.select({ id: categories.id, name: categories.name, kind: categories.kind })
				.from(categories)
				.where(and(eq(categories.userId, userId), eq(categories.archived, false), isNull(categories.deletedAt)))
				.orderBy(asc(categories.name))
		]);

		return {
			wallets: userWallets,
			categories: userCategories
		};
	}
}
