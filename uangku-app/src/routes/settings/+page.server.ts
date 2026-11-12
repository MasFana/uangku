import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	return {
		user: event.locals.user || null
	};
};

export const actions: Actions = {
	logout: async (event) => {
		if (event.locals.auth) {
			await event.locals.auth.api.signOut({ headers: event.request.headers });
		}
		event.cookies.delete('better-auth.session_token', { path: '/' });
		throw redirect(303, '/login');
	}
};
