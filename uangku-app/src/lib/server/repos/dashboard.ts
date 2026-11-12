import { eq, and, gte, lte, desc } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { transactions, categories } from '../db/schema';
import { WalletsRepo } from './wallets';
import { calculateCashflow } from '../balance';

export interface DashboardSummary {
	totalBalance: number;
	currentMonth: {
		income: number;
		expense: number;
		net: number;
	};
	recentTransactions: Array<{
		id: string;
		walletId: string;
		categoryId: string | null;
		type: 'expense' | 'income' | 'transfer';
		amount: number;
		transferWalletId: string | null;
		note: string | null;
		occurredAt: string;
	}>;
	categoryBreakdown: Array<{
		categoryId: string | null;
		categoryName: string;
		total: number;
		color: string | null;
	}>;
	sixMonthTrend: Array<{
		month: string; // YYYY-MM
		income: number;
		expense: number;
	}>;
}

export class DashboardRepo {
	constructor(private db: AppDatabase) {}

	async getSummary(userId: string, now: Date = new Date()): Promise<DashboardSummary> {
		const walletsRepo = new WalletsRepo(this.db);
		const userWallets = await walletsRepo.list(userId, false);
		const totalBalance = userWallets.reduce((sum, w) => sum + w.balance, 0);

		// Current month boundaries (UTC ISO)
		const year = now.getUTCFullYear();
		const month = now.getUTCMonth(); // 0-indexed
		const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
		const startOfNextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0)).toISOString();

		// Current month transactions
		const monthTxs = await this.db
			.select()
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					gte(transactions.occurredAt, startOfMonth),
					lte(transactions.occurredAt, startOfNextMonth)
				)
			);

		const cashflow = calculateCashflow(monthTxs);

		// Recent 10 transactions
		const recentTxs = await this.db
			.select()
			.from(transactions)
			.where(eq(transactions.userId, userId))
			.orderBy(desc(transactions.occurredAt))
			.limit(10);

		// Category breakdown for current month expenses
		const userCategories = await this.db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId));
		const catMap = new Map(userCategories.map((c) => [c.id, c]));

		const expenseByCat = new Map<string | null, number>();
		for (const tx of monthTxs) {
			if (tx.type === 'expense') {
				const current = expenseByCat.get(tx.categoryId) ?? 0;
				expenseByCat.set(tx.categoryId, current + tx.amount);
			}
		}

		const categoryBreakdown = Array.from(expenseByCat.entries())
			.map(([catId, total]) => {
				const cat = catId ? catMap.get(catId) : null;
				return {
					categoryId: catId,
					categoryName: cat ? cat.name : 'Tanpa Kategori',
					total,
					color: cat?.color ?? null
				};
			})
			.sort((a, b) => b.total - a.total);

		// Six-month trend
		const sixMonthsAgo = new Date(Date.UTC(year, month - 5, 1, 0, 0, 0)).toISOString();
		const sixMonthTxs = await this.db
			.select({
				type: transactions.type,
				amount: transactions.amount,
				occurredAt: transactions.occurredAt
			})
			.from(transactions)
			.where(
				and(eq(transactions.userId, userId), gte(transactions.occurredAt, sixMonthsAgo))
			);

		const trendMap = new Map<string, { income: number; expense: number }>();
		for (let i = 5; i >= 0; i--) {
			const d = new Date(Date.UTC(year, month - i, 1));
			const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
			trendMap.set(key, { income: 0, expense: 0 });
		}

		for (const tx of sixMonthTxs) {
			const key = tx.occurredAt.slice(0, 7);
			const bucket = trendMap.get(key);
			if (bucket) {
				if (tx.type === 'income') bucket.income += tx.amount;
				else if (tx.type === 'expense') bucket.expense += tx.amount;
			}
		}

		const sixMonthTrend = Array.from(trendMap.entries()).map(([m, vals]) => ({
			month: m,
			income: vals.income,
			expense: vals.expense
		}));

		return {
			totalBalance,
			currentMonth: cashflow,
			recentTransactions: recentTxs.map((t) => ({
				id: t.id,
				walletId: t.walletId,
				categoryId: t.categoryId,
				type: t.type,
				amount: t.amount,
				transferWalletId: t.transferWalletId,
				note: t.note,
				occurredAt: t.occurredAt
			})),
			categoryBreakdown,
			sixMonthTrend
		};
	}
}
