import { CategoriesRepo } from '../repos/categories';
import type { AppEvent } from '../types';
import { assertUser } from '../types';
import { categories, type CategoryKind } from '../db/schema';
import { DEFAULT_CATEGORIES } from '../defaults';
import type { AppDatabase } from '../db/client';
import { nowHLC, createHLCState } from '$lib/shared/hlc';

export async function listCategories(
	event: AppEvent,
	options?: { kind?: CategoryKind; includeArchived?: boolean }
) {
	const { userId, db } = assertUser(event);
	const repo = new CategoriesRepo(db);
	return repo.list(userId, options);
}

/**
 * Seeds default categories for a user directly using database instance.
 * Matches existing active categories by (kind, case-insensitive name).
 * Idempotent: safe to run multiple times without creating duplicates.
 * Returns the count of newly inserted categories.
 */
export async function seedDefaultsForUser(db: AppDatabase, userId: string): Promise<number> {
	const repo = new CategoriesRepo(db);

	// Read existing active categories for user
	const existing = await repo.list(userId, { includeArchived: false });
	const existingSet = new Set(
		existing.map((c) => `${c.kind}:${c.name.trim().toLowerCase()}`)
	);

	const toInsert = DEFAULT_CATEGORIES.filter(
		(def) => !existingSet.has(`${def.kind}:${def.name.trim().toLowerCase()}`)
	);

	if (toInsert.length === 0) {
		return 0;
	}

	const now = new Date().toISOString();
	const serverNow = Date.now();
	const hlcState = createHLCState('srv');
	const records = toInsert.map((item) => ({
		id: crypto.randomUUID(),
		userId,
		name: item.name,
		kind: item.kind,
		icon: null,
		color: item.color,
		archived: false,
		hlc: nowHLC(hlcState, serverNow),
		serverUpdatedAt: serverNow,
		createdAt: now
	}));

	// Chunk inserts to prevent exceeding SQLite/D1 SQL variable limit
	const CHUNK_SIZE = 5;
	for (let i = 0; i < records.length; i += CHUNK_SIZE) {
		const chunk = records.slice(i, i + CHUNK_SIZE);
		await db.insert(categories).values(chunk);
	}

	return records.length;
}

/**
 * Seeds default categories for the current user if not already present.
 * Thin wrapper around seedDefaultsForUser.
 */
export async function seedDefaultCategories(event: AppEvent): Promise<number> {
	const { userId, db } = assertUser(event);
	return seedDefaultsForUser(db, userId);
}
