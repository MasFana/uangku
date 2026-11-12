/**
 * Pure route guard helper functions.
 * No side effects, no platform/locals/DB/KV dependency.
 */

const STATIC_EXT_REGEX = /\.(svg|png|jpg|jpeg|webp|gif|ico|css|js|map|txt|woff|woff2|ttf|eot)$/i;

export function isPublicRoute(pathname: string): boolean {
	const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';

	if (path === '/login' || path === '/register') {
		return true;
	}

	if (path === '/favicon.svg' || path === '/favicon.ico' || path === '/robots.txt') {
		return true;
	}

	if (path.startsWith('/_app/') || path.startsWith('/assets/')) {
		return true;
	}

	if (path.startsWith('/api/')) {
		return true;
	}

	if (STATIC_EXT_REGEX.test(path)) {
		return true;
	}

	return false;
}

export function isPublicRequest(event: {
	url: { pathname: string };
	request: { headers: { get(name: string): string | null } };
}): boolean {
	if (isPublicRoute(event.url.pathname)) {
		return true;
	}

	const accept = event.request.headers.get('accept');
	if (accept && accept.includes('image/')) {
		return true;
	}

	return false;
}

export function loginRedirectUrl(pathname: string, search: string): string {
	const fullPath = `${pathname}${search}`;
	return `/login?redirectTo=${encodeURIComponent(fullPath)}`;
}
