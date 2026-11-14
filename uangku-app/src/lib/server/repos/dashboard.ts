import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { transactions, categories, wallets, monthlyRollups } from '../db/schema';
import type { DashboardSummaryDTO, WalletDTO } from '$lib/shared/sync-contract';

export class DashboardRepo {
	constructor(private db: AppDatabase) {}

	async getSummary(userId: string, now: Date = new Date()): Promise<DashboardSummaryDTO> {
		const year = now.getUTCFullYear();
		const month = String(now.getUTCMonth() + 1).padStart(2, '0');
		const currentYm = `${year}-${month}`;

		// Compute 6-month string keys
		const monthKeys: string[] = [];
		for (let i = 5; i >= 0; i--) {
			const d = new Date(Date.UTC(year, now.getUTCMonth() - i, 1));
			const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
			monthKeys.push(ym);
		}
		const earliestYm = monthKeys[0];

		// Single IPC Round-trip: Fetch wallets, monthly rollups, recent 10 transactions, and categories
		const [walletRows, currentMonthRollup, trendRollup, recentTxs, categoryRows] =
			await Promise.all([
				this.db
					.select()
					.from(wallets)
					.where(and(eq(wallets.userId, userId), eq(wallets.archived, false), isNull(wallets.deletedAt)))
					.orderBy(wallets.createdAt),
				this.db
					.select({
						type: monthlyRollups.type,
						amount: sql<number>`coalesce(sum(${monthlyRollups.totalAmount}), 0)`
					})
					.from(monthlyRollups)
					.where(and(eq(monthlyRollups.userId, userId), eq(monthlyRollups.ym, currentYm)))
					.groupBy(monthlyRollups.type),
				this.db
					.select({
						ym: monthlyRollups.ym,
						type: monthlyRollups.type,
						amount: sql<number>`coalesce(sum(${monthlyRollups.totalAmount}), 0)`
					})
					.from(monthlyRollups)
					.where(
						and(
							eq(monthlyRollups.userId, userId),
							sql`${monthlyRollups.ym} >= ${earliestYm}`
						)
					)
					.groupBy(monthlyRollups.ym, monthlyRollups.type),
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
					.where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
					.orderBy(desc(transactions.occurredAt), desc(transactions.id))
					.limit(10),
				this.db
					.select({
						id: categories.id,
						name: categories.name,
						color: categories.color
					})
					.from(categories)
					.where(eq(categories.userId, userId))
			]);

		// Transform wallets
		const walletsDto: WalletDTO[] = walletRows.map((w) => ({
			id: w.id,
			userId: w.userId,
			name: w.name,
			type: w.type,
			initialBalance: w.initialBalance,
			currentBalance: w.currentBalance,
			icon: w.icon,
			archived: Boolean(w.archived),
			hlc: w.hlc,
			serverUpdatedAt: w.serverUpdatedAt,
			deletedAt: w.deletedAt,
			createdAt: w.createdAt
		}));

		const totalBalance = walletsDto.reduce((sum, w) => sum + w.currentBalance, 0);

		// Current Month Income / Expense from Rollup
		let currentIncome = 0;
		let currentExpense = 0;
		for (const r of currentMonthRollup) {
			if (r.type === 'income') currentIncome += Number(r.amount);
			if (r.type === 'expense') currentExpense += Number(r.amount);
		}

		// 6-Month Trend
		const trendMap = new Map<string, { income: number; expense: number }>();
		for (const ym of monthKeys) {
			trendMap.set(ym, { income: 0, expense: 0 });
		}
		for (const r of trendRollup) {
			const entry = trendMap.get(r.ym);
			if (entry) {
				if (r.type === 'income') entry.income += Number(r.amount);
				if (r.type === 'expense') entry.expense += Number(r.amount);
			}
		}
		const sixMonthTrend = monthKeys.map((ym) => ({
			month: ym,
			income: trendMap.get(ym)?.income ?? 0,
			expense: trendMap.get(ym)?.expense ?? 0
		}));

		// Category breakdown for current month from monthlyRollups
		const categoryTotals = await this.db
			.select({
				categoryId: monthlyRollups.categoryId,
				total: sql<number>`coalesce(sum(${monthlyRollups.totalAmount}), 0)`
			})
			.from(monthlyRollups)
			.where(
				and(
					eq(monthlyRollups.userId, userId),
					eq(monthlyRollups.ym, currentYm),
					eq(monthlyRollups.type, 'expense')
				)
			)
			.groupBy(monthlyRollups.categoryId);

		const catMap = new Map(categoryRows.map((c) => [c.id, c]));
		const categoryBreakdown = categoryTotals.map((ct) => {
			const cat = ct.categoryId ? catMap.get(ct.categoryId) : undefined;
			return {
				categoryId: ct.categoryId || null,
				categoryName: cat?.name ?? 'Tanpa Kategori',
				total: Number(ct.total),
				color: cat?.color ?? null
			};
		});

		return {
			totalBalance,
			wallets: walletsDto,
			currentMonth: {
				income: currentIncome,
				expense: currentExpense,
				net: currentIncome - currentExpense
			},
			recentTransactions: recentTxs,
			categoryBreakdown,
			sixMonthTrend
		};
	}
}
