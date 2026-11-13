import { CategoriesRepo } from '../repos/categories';
import { CreateCategorySchema, UpdateCategorySchema, parseInput } from '../validation';
import type { AppEvent } from '../types';
import { assertUser } from '../types';
import { categories, type CategoryKind } from '../db/schema';
import { DEFAULT_CATEGORIES } from '../defaults';

export async function listCategories(
	event: AppEvent,
	options?: { kind?: CategoryKind; includeArchived?: boolean }
) {
	const { userId, db } = assertUser(event);
	const repo = new CategoriesRepo(db);
	return repo.list(userId, options);
}

export async function createCategory(event: AppEvent, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(CreateCategorySchema, input);
	const repo = new CategoriesRepo(db);
	return repo.create(userId, validated);
}

export async function updateCategory(event: AppEvent, id: string, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(UpdateCategorySchema, input);
	const repo = new CategoriesRepo(db);
	const updated = await repo.update(userId, id, validated);
	if (!updated) throw new Error('NOT_FOUND');
	return updated;
}

export async function archiveCategory(event: AppEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new CategoriesRepo(db);
	const ok = await repo.archive(userId, id);
	if (!ok) throw new Error('NOT_FOUND');
	return { success: true };
}

/**
 * Seeds default categories for the current user if not already present.
 * Matches existing active categories by (kind, case-insensitive name).
 * Idempotent: safe to run multiple times without creating duplicates.
 * Returns the count of newly inserted categories.
 */
export async function seedDefaultCategories(event: AppEvent): Promise<number> {
	const { userId, db } = assertUser(event);
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
	const records = toInsert.map((item) => ({
		id: crypto.randomUUID(),
		userId,
		name: item.name,
		kind: item.kind,
		icon: null,
		color: item.color,
		archived: false,
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
