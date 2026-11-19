import type { AppDatabase } from './lib/server/db/client';
import type { AuthInstance } from './lib/server/auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			env?: Cloudflare.Env;
			db?: AppDatabase;
			r2?: R2Bucket;
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

