import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const rawRedirect = url.searchParams.get('redirectTo') || '/';
	// Validate redirect target to prevent open redirect vulnerabilities
	// Must start with '/' and not '//' or '/\'
	const isSafe = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.startsWith('/\\');
	const safeRedirect = isSafe ? rawRedirect : '/';

	return {
		redirectTo: safeRedirect
	};
};
