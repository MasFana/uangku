import type { RequestHandler } from '@sveltejs/kit';
import { createAuth } from '../../../../lib/server/auth';

export const fallback: RequestHandler = async (event) => {
	const platformAny = event.platform as { env?: unknown } | undefined;
	const env = (platformAny?.env ?? {}) as Parameters<typeof createAuth>[0];
	if (!env.APP_DB) {
		return new Response(JSON.stringify({ error: 'Database binding APP_DB missing' }), {
			status: 500,
			headers: { 'content-type': 'application/json' }
		});
	}
	const auth = createAuth(env, event);
	return auth.handler(event.request);
};

