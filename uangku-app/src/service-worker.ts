/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';
import { resolve } from '$app/paths';

const CACHE_NAME = `uangku-cache-${version}`;
const ASSETS = [...assets, ...immutable];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET and API / auth requests from SW cache
	if (event.request.method !== 'GET' || url.pathname.startsWith('/api')) {
		return;
	}

	// Stale-while-revalidate for static assets, network-first with cache fallback for navigation
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches.match(event.request).then((cached) => cached || fetch(event.request))
		);
		return;
	}

	// Navigation requests: Network first, fall back to cached shell or index
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(async () => {
				const cached = await caches.match(event.request);
				if (cached) return cached;
				const indexCached = await caches.match('/');
				return indexCached || new Response('Offline', { status: 503 });
			})
		);
	}
});
