import { describe, it, expect } from 'vitest';
import { isPublicRoute, isPublicRequest, loginRedirectUrl } from '../src/lib/server/guard';

describe('Pure Route Guard Logic', () => {
	describe('isPublicRoute', () => {
		it('allows auth routes as public', () => {
			expect(isPublicRoute('/login')).toBe(true);
			expect(isPublicRoute('/login/')).toBe(true);
			expect(isPublicRoute('/register')).toBe(true);
			expect(isPublicRoute('/register/')).toBe(true);
		});

		it('allows static assets and meta files as public', () => {
			expect(isPublicRoute('/favicon.svg')).toBe(true);
			expect(isPublicRoute('/favicon.ico')).toBe(true);
			expect(isPublicRoute('/robots.txt')).toBe(true);
			expect(isPublicRoute('/_app/immutable/entry/start.js')).toBe(true);
			expect(isPublicRoute('/assets/logo.png')).toBe(true);
			expect(isPublicRoute('/fonts/inter.woff2')).toBe(true);
		});

		it('allows better-auth API endpoints as public', () => {
			expect(isPublicRoute('/api/auth/sign-in')).toBe(true);
			expect(isPublicRoute('/api/auth/session')).toBe(true);
			expect(isPublicRoute('/api/auth/callback')).toBe(true);
		});

		it('protects core app routes', () => {
			expect(isPublicRoute('/')).toBe(false);
			expect(isPublicRoute('/wallets')).toBe(false);
			expect(isPublicRoute('/wallets/new')).toBe(false);
			expect(isPublicRoute('/categories')).toBe(false);
			expect(isPublicRoute('/transactions')).toBe(false);
			expect(isPublicRoute('/settings')).toBe(false);
		});

		it('protects non-auth API routes', () => {
			// Per spec: only /api/auth/ is public, other /api/* routes must be protected
			expect(isPublicRoute('/api/transactions')).toBe(false);
			expect(isPublicRoute('/api/wallets')).toBe(false);
			expect(isPublicRoute('/api/export')).toBe(false);
		});

		it('normalizes trailing slashes and query strings', () => {
			expect(isPublicRoute('/login?redirect=/wallets')).toBe(true);
			expect(isPublicRoute('/wallets/?page=2')).toBe(false);
		});
	});

	describe('isPublicRequest', () => {
		it('recognizes image requests via Accept header', () => {
			const req = {
				url: { pathname: '/custom-icon' },
				request: {
					headers: {
						get: (header: string) => (header === 'accept' ? 'image/avif,image/webp,image/*;q=0.8' : null)
					}
				}
			};
			expect(isPublicRequest(req)).toBe(true);
		});

		it('returns false for protected page navigation requests', () => {
			const req = {
				url: { pathname: '/wallets' },
				request: {
					headers: {
						get: (header: string) => (header === 'accept' ? 'text/html,application/xhtml+xml' : null)
					}
				}
			};
			expect(isPublicRequest(req)).toBe(false);
		});
	});

	describe('loginRedirectUrl', () => {
		it('builds login URL with encoded redirectTo query param', () => {
			expect(loginRedirectUrl('/wallets', '')).toBe('/login?redirectTo=%2Fwallets');
			expect(loginRedirectUrl('/transactions', '?type=expense&limit=20')).toBe(
				'/login?redirectTo=%2Ftransactions%3Ftype%3Dexpense%26limit%3D20'
			);
		});

		it('handles root path', () => {
			expect(loginRedirectUrl('/', '')).toBe('/login?redirectTo=%2F');
		});
	});
});
