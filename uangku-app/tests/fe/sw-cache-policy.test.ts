import { describe, expect, it } from 'vitest';
import { isCacheable, routeRequest, type SwCachePolicyConfig } from '$lib/client/sw-cache-policy';

const ORIGIN = 'https://uangku.example';

const config: SwCachePolicyConfig = {
	origin: ORIGIN,
	shell: ['/', '/login'],
	staticAssets: ['/favicon.svg', '/manifest.json', '/_app/immutable/chunk-abc123.js']
};

function request(url: string, mode = 'same-origin', method = 'GET') {
	return { url, method, mode };
}

describe('routeRequest', () => {
	it('routes navigations network-first so offline reloads fall back to the shell', () => {
		expect(routeRequest(request(`${ORIGIN}/`, 'navigate'), config)).toBe('network-first');
		expect(routeRequest(request(`${ORIGIN}/transactions`, 'navigate'), config)).toBe('network-first');
		expect(routeRequest(request(`${ORIGIN}/login?redirectTo=%2F`, 'navigate'), config)).toBe(
			'network-first'
		);
	});

	it('never answers /api/* from the cache', () => {
		expect(routeRequest(request(`${ORIGIN}/api/transactions`, 'cors'), config)).toBe('network-only');
		expect(routeRequest(request(`${ORIGIN}/api/auth/sign-in/email`, 'cors', 'POST'), config)).toBe(
			'network-only'
		);
		// even a navigation to /api must not be served the cached shell
		expect(routeRequest(request(`${ORIGIN}/api/health`, 'navigate'), config)).toBe('network-only');
	});

	it('never caches SvelteKit data loads (private, no-store)', () => {
		expect(routeRequest(request(`${ORIGIN}/__data.json`), config)).toBe('network-only');
		expect(routeRequest(request(`${ORIGIN}/transactions/__data.json?x=1`), config)).toBe('network-only');
	});

	it('routes hashed and static assets cache-first with revalidation', () => {
		expect(routeRequest(request(`${ORIGIN}/_app/immutable/chunk-abc123.js`), config)).toBe(
			'cache-first-revalidate'
		);
		expect(routeRequest(request(`${ORIGIN}/favicon.svg`), config)).toBe('cache-first-revalidate');
	});

	it('serves precached shell HTML from the cache first', () => {
		expect(routeRequest(request(`${ORIGIN}/`), config)).toBe('precache');
		expect(routeRequest(request(`${ORIGIN}/login`), config)).toBe('precache');
	});

	it('leaves third-party origins alone', () => {
		expect(
			routeRequest(request('https://fonts.googleapis.com/css2?family=Instrument+Sans'), config)
		).toBe('network-only');
		expect(
			routeRequest(request('https://fonts.gstatic.com/s/instrumentsans.woff2', 'cors'), config)
		).toBe('network-only');
	});

	it('leaves non-GET and unknown same-origin GETs to the network', () => {
		expect(
			routeRequest(request(`${ORIGIN}/_app/immutable/chunk-abc123.js`, 'cors', 'POST'), config)
		).toBe('network-only');
		expect(routeRequest(request(`${ORIGIN}/settings/export.csv`), config)).toBe('network-only');
	});
});

function response(init: { ok?: boolean; type?: string; cacheControl?: string | null } = {}) {
	return {
		ok: init.ok ?? true,
		type: init.type ?? 'basic',
		headers: {
			get: (name: string) =>
				name.toLowerCase() === 'cache-control' ? (init.cacheControl ?? null) : null
		}
	};
}

describe('isCacheable', () => {
	it('rejects every no-store / private response', () => {
		expect(isCacheable(response({ cacheControl: 'private, no-store' }))).toBe(false);
		expect(isCacheable(response({ cacheControl: 'no-store' }))).toBe(false);
		expect(isCacheable(response({ cacheControl: 'PRIVATE' }))).toBe(false);
		expect(isCacheable(response({ cacheControl: 'max-age=60, private' }))).toBe(false);
	});

	it('rejects opaque, redirected and failed responses', () => {
		expect(isCacheable(response({ type: 'opaque' }))).toBe(false);
		expect(isCacheable(response({ type: 'opaqueredirect' }))).toBe(false);
		expect(isCacheable(response({ type: 'cors' }))).toBe(false);
		expect(isCacheable(response({ ok: false }))).toBe(false);
	});

	it('accepts plain successful same-origin responses', () => {
		expect(isCacheable(response())).toBe(true);
		expect(isCacheable(response({ cacheControl: 'public, max-age=0, must-revalidate' }))).toBe(true);
	});
});
