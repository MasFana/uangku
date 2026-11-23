import type { LayoutServerLoad } from './$types';
import { isGoogleEnabled } from '$lib/server/auth';

// Carries the session identity for every route, so no page needs its own `load` just to
// read the account (that would cost a `__data.json` round trip per navigation). The Google
// flag rides along: a page can then hide the button without asking the server again.
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user ? { id: locals.user.id, name: locals.user.name, email: locals.user.email } : null,
		googleEnabled: isGoogleEnabled(locals.env ?? {})
	};
};
