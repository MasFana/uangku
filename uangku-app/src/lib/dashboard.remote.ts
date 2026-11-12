import { DashboardRepo, type DashboardSummary } from './server/repos/dashboard';
import type { RequestEvent } from '@sveltejs/kit';
import type { AppDatabase } from './server/db/client';

const DASHBOARD_CACHE_TTL_SECONDS = 60;

interface SimpleKV {
	get(key: string, type: 'text'): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
}

function assertUser(event: RequestEvent): { userId: string; db: AppDatabase; kv?: SimpleKV } {
	const locals = event.locals as unknown as {
		user?: { id: string };
		db?: AppDatabase;
		kv?: SimpleKV;
	};
	if (!locals.user?.id) {
		throw new Error('UNAUTHENTICATED');
	}
	if (!locals.db) {
		throw new Error('Database not initialized');
	}
	return { userId: locals.user.id, db: locals.db, kv: locals.kv };
}

export async function getDashboardSummary(event: RequestEvent): Promise<DashboardSummary> {
	const { userId, db, kv } = assertUser(event);
	const cacheKey = `dashboard:${userId}`;

	if (kv) {
		try {
			const cached = await kv.get(cacheKey, 'text');
			if (cached) {
				return JSON.parse(cached) as DashboardSummary;
			}
		} catch {
			// KV read error, fallback to DB
		}
	}

	const repo = new DashboardRepo(db);
	const summary = await repo.getSummary(userId);

	if (kv) {
		try {
			await kv.put(cacheKey, JSON.stringify(summary), {
				expirationTtl: DASHBOARD_CACHE_TTL_SECONDS
			});
		} catch {
			// KV write error non-fatal
		}
	}

	return summary;
}
