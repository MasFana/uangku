declare const caches: any;

import type { DashboardSummaryDTO } from '$lib/shared/sync-contract';

const CACHE_TTL_SECONDS = 300; // 5 minutes

function getCacheUrl(userId: string): string {
	return `https://uangku.internal/cache/dashboard/${encodeURIComponent(userId)}`;
}

/**
 * Reads cached dashboard summary from Cloudflare Cache API (caches.default).
 * 0 D1 reads, 0 KV reads.
 */
export async function getDashboardEdgeCache(userId: string): Promise<DashboardSummaryDTO | null> {
	if (typeof caches === 'undefined' || !caches.default) {
		return null;
	}

	try {
		const cache = caches.default;
		const req = new Request(getCacheUrl(userId));
		const res = await cache.match(req);
		if (!res) return null;
		return (await res.json()) as DashboardSummaryDTO;
	} catch {
		return null;
	}
}

/**
 * Stores dashboard summary into Cloudflare Cache API.
 */
export async function setDashboardEdgeCache(userId: string, data: DashboardSummaryDTO): Promise<void> {
	if (typeof caches === 'undefined' || !caches.default) {
		return;
	}

	try {
		const cache = caches.default;
		const req = new Request(getCacheUrl(userId));
		const res = new Response(JSON.stringify(data), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`
			}
		});
		await cache.put(req, res);
	} catch {
		// Non-fatal
	}
}

/**
 * Deletes cached dashboard summary from Cache API.
 */
export async function invalidateDashboardEdgeCache(userId: string): Promise<void> {
	if (typeof caches === 'undefined' || !caches.default) {
		return;
	}

	try {
		const cache = caches.default;
		const req = new Request(getCacheUrl(userId));
		await cache.delete(req);
	} catch {
		// Non-fatal
	}
}
