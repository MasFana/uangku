import type { AppDatabase } from './lib/server/db/client';
import type { AuthInstance } from './lib/server/auth';

declare global {
	namespace Cloudflare {
		// Secrets are set with `wrangler secret put` or in `.dev.vars`, so `wrangler types`
		// never lists them; declaring them here keeps `env.X` typed.
		interface Env {
			BETTER_AUTH_SECRET?: string;
			BETTER_AUTH_URL?: string;
			BETTER_AUTH_TRUSTED_ORIGINS?: string;
			GOOGLE_CLIENT_ID?: string;
			GOOGLE_CLIENT_SECRET?: string;
		}
	}
	namespace App {
		// interface Error {}
		interface Locals {
			env?: Cloudflare.Env;
			db?: AppDatabase;
			auth?: AuthInstance;
			user?: AuthInstance['$Infer']['Session']['user'] | null;
			session?: AuthInstance['$Infer']['Session']['session'] | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: Env;
			cf?: import('@cloudflare/workers-types').Request['cf'];
			ctx: ExecutionContext;
			caches: CacheStorage;
		}
	}
}

export { };

