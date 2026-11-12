import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	const locals = event.locals as any;
	return {
		user: locals.user || null
	};
};

export const actions: Actions = {
	logout: async (event) => {
		try {
			// Clear Better-Auth session cookie or call sign-out
			event.cookies.delete('better-auth.session_token', { path: '/' });
		} catch {
			// ignore
		}
		throw redirect(303, '/login');
	}
};
