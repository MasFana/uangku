import type { AppDatabase } from './db/client';

export interface AppEvent {
	locals: {
		db?: AppDatabase;
		user?: { id: string } | null;
		session?: unknown | null;
		r2?: unknown;
	};
	platform?: {
		env?: {
			APP_DB?: unknown;
			RECEIPTS?: unknown;
		};
	};
}

export function assertUser(event: AppEvent): { userId: string; db: AppDatabase } {
	const userId = event.locals?.user?.id;
	if (!userId) {
		throw new Error('UNAUTHENTICATED');
	}
	const db = event.locals?.db;
	if (!db) {
		throw new Error('Database not initialized');
	}
	return { userId, db };
}
