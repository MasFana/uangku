import type { Actions } from './$types';
import { redirect } from '@sveltejs/kit';

// No `load`: the account is delivered by `+layout.server.ts`, so navigating here costs
// zero data requests. Only the logout action needs the server.
export const actions: Actions = {
	logout: async (event) => {
		if (event.locals.auth) {
			await event.locals.auth.api.signOut({ headers: event.request.headers });
		}
		event.cookies.delete('better-auth.session_token', { path: '/' });
		throw redirect(303, '/login');
	}
};
