import type { AppEvent } from './types';
import type { DashboardSummaryDTO } from '$lib/shared/sync-contract';

export type DashboardSummary = DashboardSummaryDTO;

export const DASHBOARD_CACHE_TTL_SECONDS = 60;

function getCache(event: AppEvent): KVNamespace | null {
	return (event.platform?.env?.CACHE as KVNamespace | undefined) ?? (event.locals?.kv as KVNamespace | undefined) ?? null;
}

export function getDashboardCacheKey(userId: string): string {
	return `dashboard:${userId}`;
}

export async function getDashboard(event: AppEvent, userId: string): Promise<DashboardSummary | null> {
	const kv = getCache(event);
	if (!kv) return null;
	try {
		const cached = await kv.get(getDashboardCacheKey(userId), 'text');
		if (!cached) return null;
		return JSON.parse(cached) as DashboardSummary;
	} catch {
		return null;
	}
}

export async function setDashboard(
	event: AppEvent,
	userId: string,
	value: DashboardSummary,
	ttl = DASHBOARD_CACHE_TTL_SECONDS
): Promise<void> {
	const kv = getCache(event);
	if (!kv) return;
	try {
		await kv.put(getDashboardCacheKey(userId), JSON.stringify(value), {
			expirationTtl: ttl
		});
	} catch {
		// Non-fatal
	}
}

export async function invalidateDashboard(event: AppEvent, userId: string): Promise<void> {
	const kv = getCache(event);
	if (!kv) return;
	try {
		await kv.delete(getDashboardCacheKey(userId));
	} catch {
		// Non-fatal
	}
}
