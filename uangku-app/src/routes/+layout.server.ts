import type { LayoutServerLoad } from './$types';

// Carries the session identity for every route, so no page needs its own `load` just to
// read the account (that would cost a `__data.json` round trip per navigation).
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user ? { id: locals.user.id, name: locals.user.name, email: locals.user.email } : null
	};
};
