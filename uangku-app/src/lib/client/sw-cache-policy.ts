/**
 * Pure cache-routing rules for `src/service-worker.ts`.
 *
 * Kept free of `$app/*` and worker globals so `tests/fe/sw-cache-policy.test.ts`
 * can pin the policy down without a service worker scope.
 */

export type SwCacheRoute =
	/** precached HTML shell — serve from cache, the shell is refreshed on navigations */
	| 'precache'
	/** network with a short timeout, cached shell only when the network is gone */
	| 'network-first'
	/** untouched by the worker: browser default */
	| 'network-only'
	/** serve the cached copy and refresh it in the background */
	| 'cache-first-revalidate';

export interface SwRequestShape {
	url: string;
	method: string;
	mode: string;
}

export interface SwCachePolicyConfig {
	/** `self.location.origin` */
	origin: string;
	/** HTML routes precached at install: `resolve('/')`, `resolve('/login')` */
	shell: readonly string[];
	/** `assets` + `immutable` pathnames from `$app/manifest` */
	staticAssets: readonly string[];
}

export interface SwResponseShape {
	ok: boolean;
	type: string;
	headers: { get(name: string): string | null };
}

const NO_STORE = /\b(?:no-store|private)\b/i;

export function routeRequest(request: SwRequestShape, config: SwCachePolicyConfig): SwCacheRoute {
	if (request.method !== 'GET') return 'network-only';

	let url: URL;
	try {
		url = new URL(request.url, config.origin);
	} catch {
		return 'network-only';
	}

	// Third-party origins (fonts) are not ours to cache.
	if (url.origin !== config.origin) return 'network-only';

	const { pathname } = url;

	// `/api/*` runs worker-first and must never be answered by a cached shell.
	if (pathname === '/api' || pathname.startsWith('/api/')) return 'network-only';

	// `__data.json` answers are `private, no-store`.
	if (pathname === '/__data.json' || pathname.endsWith('/__data.json')) return 'network-only';

	// A hard reload offline must boot the app shell, so navigations get a timeout
	// and a cached fallback instead of a browser error page.
	if (request.mode === 'navigate') return 'network-first';

	if (config.shell.includes(pathname)) return 'precache';
	if (config.staticAssets.includes(pathname)) return 'cache-first-revalidate';

	return 'network-only';
}

/**
 * The single gate for every cache write: only successful non-redirected
 * same-origin responses that are not `no-store`/`private` may be stored.
 * Cached reads come back as `basic` too, so this stays true on re-write.
 */
export function isCacheable(response: SwResponseShape): boolean {
	if (!response.ok || response.type !== 'basic') return false;
	return !NO_STORE.test(response.headers.get('cache-control') ?? '');
}
