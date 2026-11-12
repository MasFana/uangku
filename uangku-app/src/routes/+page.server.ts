import type { PageServerLoad } from './$types';
import { getDashboardSummary } from '$lib/server/services/dashboard';
import { listWallets } from '$lib/server/services/wallets';

export const load: PageServerLoad = async (event) => {
	try {
		const [summary, wallets] = await Promise.all([
			getDashboardSummary(event),
			listWallets(event, false)
		]);
		return { summary, wallets };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Gagal memuat ringkasan dasbor';
		return {
			summary: {
				totalBalance: 0,
				currentMonth: { income: 0, expense: 0, net: 0 },
				recentTransactions: [],
				categoryBreakdown: [],
				sixMonthTrend: []
			},
			wallets: [],
			error: message
		};
	}
};
