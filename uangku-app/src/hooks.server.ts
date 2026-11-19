import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { env as workerEnv } from 'cloudflare:workers';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createDb } from '$lib/server/db/client';
import { createAuth } from '$lib/server/auth';
import { isPublicRequest, loginRedirectUrl } from '$lib/server/guard';

export const handle: Handle = async ({ event, resolve }) => {
	// SvelteKit 3 membaca `event.platform` dari opsi `server.respond({ platform })`,
	// dan adapter-cloudflare 8.0.2 tidak mengirimkan opsi itu — hanya `env` ke
	// `server.init`. Di produksi `event.platform` karena itu selalu undefined dan
	// binding harus dibaca dari `cloudflare:workers`, yang disediakan adapter untuk
	// dev maupun produksi. Aksesnya ditunda sampai request agar tidak menyentuh
	// proxy saat build.
	const env = building ? undefined : ((event.platform?.env ?? workerEnv) as Env);
	event.locals.env = env;

	if (env?.APP_DB) {
		event.locals.db = createDb(env.APP_DB);

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

		if (!building && !event.locals.session && !isPublicRequest(event)) {
			redirect(303, loginRedirectUrl(event.url.pathname, event.url.search));
		}

		return svelteKitHandler({ auth, event, resolve, building });
	}

	if (!building && !isPublicRequest(event)) {
		redirect(303, loginRedirectUrl(event.url.pathname, event.url.search));
	}

	return resolve(event);
};
