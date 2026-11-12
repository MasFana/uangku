import { CategoriesRepo } from '../repos/categories';
import { CreateCategorySchema, UpdateCategorySchema, parseInput } from '../validation';
import type { AppEvent } from '../types';
import { assertUser } from '../types';
import type { CategoryKind } from '../db/schema';

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
