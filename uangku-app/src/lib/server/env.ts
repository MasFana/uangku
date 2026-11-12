import type { RequestEvent } from '@sveltejs/kit';

export type AppEnv = Env;

/**
 * Returns type-safe Cloudflare platform env from RequestEvent.
 * Throws an explicit error if bindings are unavailable.
 */
export function getPlatformEnv(event: RequestEvent): AppEnv {
	const env = (event.locals?.env ?? event.platform?.env) as AppEnv | undefined;
	if (!env) {
		throw new Error(
			'Cloudflare platform environment is not available. Ensure platformProxy is configured during dev.'
		);
	}
	return env;
}

/**
 * Helper to get APP_DB D1 binding.
 */
export function getDbBinding(event: RequestEvent): D1Database {
	const env = getPlatformEnv(event);
	if (!env.APP_DB) {
		throw new Error('D1 database binding APP_DB is missing from platform environment.');
	}
	return env.APP_DB;
}

/**
 * Helper to get RECEIPTS R2 binding.
 */
export function getReceiptsBinding(event: RequestEvent): R2Bucket {
	const env = getPlatformEnv(event);
	if (!env.RECEIPTS) {
		throw new Error('R2 bucket binding RECEIPTS is missing from platform environment.');
	}
	return env.RECEIPTS;
}

/**
 * Helper to get CACHE KV binding.
 */
export function getCacheBinding(event: RequestEvent): KVNamespace {
	const env = getPlatformEnv(event);
	if (!env.CACHE) {
		throw new Error('KV namespace binding CACHE is missing from platform environment.');
	}
	return env.CACHE;
}
