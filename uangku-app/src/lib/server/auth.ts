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
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	[key: string]: unknown;
}

/** Google sign-in needs both keys; without them the provider stays off and its button is hidden. */
export function isGoogleEnabled(env: GoogleEnv): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID) && Boolean(env.GOOGLE_CLIENT_SECRET);
}

export type GoogleEnv = {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

function socialProviders(env: AuthEnv) {
	if (!isGoogleEnabled(env)) return {};
	return {
		google: {
			clientId: env.GOOGLE_CLIENT_ID as string,
			clientSecret: env.GOOGLE_CLIENT_SECRET as string,
			prompt: 'select_account' as const
		}
	};
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
		account: {
			// Never link a Google identity into an existing row automatically: our rows have
			// `email_verified = false`, so the provider's claim alone cannot prove ownership.
			// Users link Google from Settings while signed in (`/api/auth/link-social`).
			accountLinking: {
				enabled: true,
				disableImplicitLinking: true
			}
		},
		socialProviders: socialProviders(env),
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
