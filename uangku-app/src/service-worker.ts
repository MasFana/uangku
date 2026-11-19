/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';
import { resolve } from '$app/paths';
import { isCacheable, routeRequest } from '$lib/client/sw-cache-policy';

declare global {
	// Background Sync is missing from the TypeScript webworker lib.
	interface ServiceWorkerGlobalScopeEventMap {
		sync: ExtendableEvent & { readonly tag: string };
	}
}

const CACHE_PREFIX = 'uangku-cache-';
const CACHE_NAME = `${CACHE_PREFIX}${version}`;

/** HTML routes precached at install so an offline hard reload boots the shell. */
const SHELL = [resolve('/'), resolve('/login')];

/** `$app/manifest` entries are `{ path }`, relative to the base path. */
const ASSET_PATHS = [...assets, ...immutable].map(
	({ path }) => new URL(path, self.location.href).pathname
);

const NAV_TIMEOUT_MS = 2500;
const SYNC_TAG = 'uangku-outbox-sync';

/**
 * The one place responses enter the cache: `isCacheable` rejects opaque, failed
 * and `no-store`/`private` responses, so none of them can be stored anywhere.
 */
async function store(cache: Cache, request: Request | string, response: Response): Promise<boolean> {
	if (!isCacheable(response)) return false;
	try {
		await cache.put(request, response.clone());
		return true;
	} catch {
		// quota exceeded or the response is not storable — it is still served
		return false;
	}
}

async function precache(cache: Cache, path: string): Promise<boolean> {
	try {
		// Relative fetches resolve against the service worker script URL and keep
		// same-origin credentials, so the shell HTML cached here is the user's own.
		return await store(cache, path, await fetch(path));
	} catch {
		return false;
	}
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);

			// Assets are best-effort: one bad file must not block the shell.
			await Promise.all(ASSET_PATHS.map((path) => precache(cache, path)));

			const shelled = await Promise.all(SHELL.map((path) => precache(cache, path)));
			// Without a shell the app cannot boot offline. Throwing leaves the previous
			// worker in charge and makes the browser retry this install on next load.
			if (!shelled.some(Boolean)) throw new Error('uangku: app shell precache failed');

			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Keep only the current version prefix.
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
					.map((key) => caches.delete(key))
			);

			await self.clients.claim();
		})()
	);
});

async function messageClientsToSync(): Promise<void> {
	const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
	// ponytail: the worker never replays the IndexedDB outbox itself, so with no
	// window open this event is a no-op. Upgrade path: run the sync engine inside
	// the worker and push the outbox to `/api/sync` directly.
	for (const client of clients) client.postMessage({ type: 'uangku:sync' });
}

function onSync(event: ExtendableEvent): void {
	event.waitUntil(messageClientsToSync());
}

// No `periodicsync`: pulls are mutation- and reload-driven. A periodic wake would
// be polling in disguise and would relay a sync to every open tab.
self.addEventListener('sync', onSync);

/** Fetch that gives up after `ms` so a dead network still reaches the cache. */
async function fetchWithTimeout(request: Request, ms: number): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	try {
		return await fetch(request, { signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function isRedirect(response: Response): boolean {
	return (
		response.type === 'opaqueredirect' ||
		response.redirected ||
		(response.status >= 300 && response.status < 400)
	);
}

async function matchShell(): Promise<Response | undefined> {
	for (const path of SHELL) {
		const cached = await caches.match(path);
		if (cached) return cached;
	}
	return undefined;
}

function offlineResponse(): Response {
	return new Response('Offline', {
		status: 503,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
}

async function handleNavigation(event: FetchEvent, request: Request): Promise<Response> {
	try {
		const response = await fetchWithTimeout(request, NAV_TIMEOUT_MS);

		// An auth redirect must reach the browser as-is: answering it from cache would
		// show a stale shell for a session that no longer has access.
		if (isRedirect(response)) return response;

		// Successful HTML is written back per route, so routes already visited offline
		// hydrate with the data they were rendered with.
		event.waitUntil(store(await caches.open(CACHE_NAME), request, response));
		return response;
	} catch {
		// ponytail: a route never visited offline falls back to the `/` shell, which
		// the client router re-resolves against IndexedDB. Upgrade path: server-render a
		// dedicated offline shell and cache it at install.
		return (await caches.match(request)) ?? (await matchShell()) ?? offlineResponse();
	}
}

async function refresh(request: Request): Promise<void> {
	try {
		await store(await caches.open(CACHE_NAME), request, await fetch(request));
	} catch {
		// offline: the cached copy stays
	}
}

async function cacheFirst(event: FetchEvent, request: Request, revalidate: boolean): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) {
		// The old worker called this stale-while-revalidate but never revalidated.
		if (revalidate) event.waitUntil(refresh(request));
		return cached;
	}

	const response = await fetch(request);
	event.waitUntil(store(await caches.open(CACHE_NAME), request, response));
	return response;
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	const route = routeRequest(
		{ url: request.url, method: request.method, mode: request.mode },
		{ origin: self.location.origin, shell: SHELL, staticAssets: ASSET_PATHS }
	);

	// Browser default: `/api/*`, `__data.json`, third-party and non-GET requests are
	// never intercepted, so nothing private can end up in Cache Storage.
	if (route === 'network-only') return;

	if (route === 'network-first') {
		event.respondWith(handleNavigation(event, request));
		return;
	}

	event.respondWith(cacheFirst(event, request, route === 'cache-first-revalidate'));
});
