import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import path from 'path';
import {
	getDashboard,
	setDashboard,
	invalidateDashboard,
	getDashboardCacheKey,
	DASHBOARD_CACHE_TTL_SECONDS
} from '../src/lib/server/cache';
import type { DashboardSummary } from '../src/lib/server/repos/dashboard';
import type { AppEvent } from '../src/lib/server/types';

describe('Dashboard KV Cache Service', () => {
	let mf: Miniflare;
	let kv: KVNamespace;

	beforeAll(async () => {
		mf = new Miniflare({
			workers: [
				{
					config: {
						name: 'worker',
						compatibilityDate: '2026-11-10',
						manifest: {
							modulesRoot: path.resolve('.'),
							mainModule: 'index.js',
							modules: {
								'index.js': {
									type: 'esm',
									contents: 'export default { fetch() { return new Response("ok"); } }'
								}
							}
						},
						env: {
							CACHE: { type: 'kv', id: 'test-cache-kv' }
						}
					}
				}
			]
		});
		kv = (await mf.getKVNamespace('CACHE')) as unknown as KVNamespace;
	});

	afterAll(async () => {
		await mf.dispose();
	});

	function createMockEvent(namespace: KVNamespace | null): AppEvent {
		return {
			platform: {
				env: {
					CACHE: namespace as unknown
				}
			},
			locals: {}
		} as unknown as AppEvent;
	}

	const sampleSummary: DashboardSummary = {
		totalBalance: 1250000,
		currentMonth: {
			income: 2000000,
			expense: 750000,
			net: 1250000
		},
		recentTransactions: [],
		categoryBreakdown: [
			{
				categoryId: 'cat-1',
				categoryName: 'Makanan',
				total: 500000,
				color: '#f97316'
			}
		],
		sixMonthTrend: [
			{
				month: '2026-11',
				income: 2000000,
				expense: 750000
			}
		]
	};

	it('generates consistent cache key per user', () => {
		expect(getDashboardCacheKey('user_123')).toBe('dashboard:user_123');
		expect(DASHBOARD_CACHE_TTL_SECONDS).toBe(60);
	});

	it('returns null on cache miss', async () => {
		const event = createMockEvent(kv);
		const result = await getDashboard(event, 'user_nonexistent');
		expect(result).toBeNull();
	});

	it('stores and retrieves dashboard summary (cache hit)', async () => {
		const event = createMockEvent(kv);
		const userId = 'user_abc';

		await setDashboard(event, userId, sampleSummary);

		const cached = await getDashboard(event, userId);
		expect(cached).not.toBeNull();
		expect(cached?.totalBalance).toBe(1250000);
		expect(cached?.categoryBreakdown[0].categoryName).toBe('Makanan');
	});

	it('invalidates cache on mutation', async () => {
		const event = createMockEvent(kv);
		const userId = 'user_to_invalidate';

		await setDashboard(event, userId, sampleSummary);
		const before = await getDashboard(event, userId);
		expect(before).not.toBeNull();

		await invalidateDashboard(event, userId);
		const after = await getDashboard(event, userId);
		expect(after).toBeNull();
	});

	it('handles missing or unconfigured KV gracefully without throwing', async () => {
		const emptyEvent = createMockEvent(null);
		const userId = 'user_no_kv';

		expect(await getDashboard(emptyEvent, userId)).toBeNull();
		await expect(setDashboard(emptyEvent, userId, sampleSummary)).resolves.toBeUndefined();
		await expect(invalidateDashboard(emptyEvent, userId)).resolves.toBeUndefined();
	});
});
