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

	// Hanya endpoint auth yang publik. Endpoint /api/* lain wajib lewat sesi.
	if (path === '/api/auth' || path.startsWith('/api/auth/')) {
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
	// Navigasi halaman dari browser juga memuat image/* di Accept (image/avif, image/webp).
	// Hanya subresource gambar yang TIDAK memuat text/html.
	if (accept && accept.includes('image/') && !accept.includes('text/html')) {
		return true;
	}

	return false;
}

export function loginRedirectUrl(pathname: string, search: string): string {
	const fullPath = `${pathname}${search}`;
	return `/login?redirectTo=${encodeURIComponent(fullPath)}`;
}
