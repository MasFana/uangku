import { DashboardRepo } from '../repos/dashboard';
import type { AppEvent } from '../types';
import { assertUser } from '../types';
import { getDashboard, setDashboard } from '../cache';
import { getDashboardEdgeCache, setDashboardEdgeCache } from '../cache/edge-cache';
import type { DashboardSummaryDTO } from '$lib/shared/sync-contract';

export async function getDashboardSummary(event: AppEvent): Promise<DashboardSummaryDTO> {
	const { userId, db } = assertUser(event);

	// Tier 1: Cloudflare Cache API (0 D1 reads, 0 KV reads)
	const edgeCached = await getDashboardEdgeCache(userId);
	if (edgeCached) {
		return edgeCached;
	}

	// Tier 2: Cloudflare KV Cache
	const kvCached = (await getDashboard(event, userId)) as DashboardSummaryDTO | null;
	const ctx = (event.platform as any)?.context;
	if (kvCached) {
		if (ctx?.waitUntil) {
			ctx.waitUntil(setDashboardEdgeCache(userId, kvCached));
		}
		return kvCached;
	}

	// Tier 3: Compute from D1 (Single IPC roundtrip)
	const repo = new DashboardRepo(db);
	const summary = await repo.getSummary(userId);

	// Populate Tier 1 & Tier 2 caches
	const bgWrite = Promise.all([
		setDashboard(event, userId, summary as any),
		setDashboardEdgeCache(userId, summary)
	]);
	if (ctx?.waitUntil) {
		ctx.waitUntil(bgWrite);
	} else {
		await bgWrite;
	}

	return summary;
}
