import type { PageServerLoad } from './$types';
import { getAnalyticsData } from '$lib/server/services/stats';

export const load: PageServerLoad = async (event) => {
	const url = event.url;
	const range = url.searchParams.get('range') || undefined;
	const from = url.searchParams.get('from') || undefined;
	const to = url.searchParams.get('to') || undefined;
	const granularity = url.searchParams.get('granularity') || undefined;
	const walletId = url.searchParams.get('walletId') || undefined;
	const categoryId = url.searchParams.get('categoryId') || undefined;
	const type = url.searchParams.get('type') || undefined;

	return getAnalyticsData(event, {
		range,
		from,
		to,
		granularity,
		walletId,
		categoryId,
		type
	});
};
