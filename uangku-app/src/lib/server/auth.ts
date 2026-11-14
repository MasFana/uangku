import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { createDb } from './db/client';
import * as schema from './db/schema';
import { seedDefaultsForUser } from './services/categories';

export interface AuthEnv {
	APP_DB: D1Database;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	BETTER_AUTH_TRUSTED_ORIGINS?: string;
	[key: string]: unknown;
}

/** Extra origins for sign-in, comma separated in `BETTER_AUTH_TRUSTED_ORIGINS`. */
function parseTrustedOrigins(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);
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
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 300 // 5 minutes stateless cookie cache -> 0 D1 reads on auth
			}
		},
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						try {
							await seedDefaultsForUser(db, user.id);
						} catch (error: unknown) {
							const message = error instanceof Error ? error.message : String(error);
							console.log(
								JSON.stringify({
									event: 'seed_default_categories_failed',
									userId: user.id,
									message
								})
							);
						}
					}
				}
			}
		},
		secret: env.BETTER_AUTH_SECRET ?? 'uangku-dev-secret-minimum-32-chars-long',
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: parseTrustedOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
		emailAndPassword: {
			enabled: true,
			autoSignIn: true
		},
		plugins: event ? [sveltekitCookies(() => event)] : []
	});
}

export type AuthInstance = ReturnType<typeof createAuth>;
