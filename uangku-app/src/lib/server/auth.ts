import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { createDb } from './db/client';
import * as schema from './db/schema';

export interface AuthEnv {
	APP_DB: D1Database;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	[key: string]: unknown;
}

export function createAuth(env: AuthEnv, event?: RequestEvent) {
	const db = createDb(env.APP_DB);

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: {
				user: schema.users,
				session: schema.sessions,
				account: schema.accounts,
				verification: schema.verifications
			}
		}),
		secret: env.BETTER_AUTH_SECRET ?? 'uangku-dev-secret-minimum-32-chars-long',
		baseURL: env.BETTER_AUTH_URL,
		emailAndPassword: {
			enabled: true,
			autoSignIn: true
		},
		plugins: event ? [sveltekitCookies(() => event)] : []
	});
}

export type AuthInstance = ReturnType<typeof createAuth>;

