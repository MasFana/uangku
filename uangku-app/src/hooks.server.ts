import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createDb } from '$lib/server/db/client';
import { createAuth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;

	if (env?.APP_DB) {
		event.locals.db = createDb(env.APP_DB);
		event.locals.r2 = env.RECEIPTS;
		event.locals.kv = env.CACHE;

		const auth = createAuth(env as unknown as Parameters<typeof createAuth>[0], event);
		event.locals.auth = auth;

		try {
			const session = await auth.api.getSession({
				headers: event.request.headers
			});
			event.locals.user = session?.user ?? null;
			event.locals.session = session?.session ?? null;
		} catch {
			event.locals.user = null;
			event.locals.session = null;
		}

		return svelteKitHandler({ auth, event, resolve, building });
	}

	return resolve(event);
};
