import { CategoriesRepo } from './server/repos/categories';
import { CreateCategorySchema, UpdateCategorySchema, parseInput } from './server/validation';
import type { RequestEvent } from '@sveltejs/kit';
import type { AppDatabase } from './server/db/client';
import type { CategoryKind } from './server/db/schema';

function assertUser(event: RequestEvent): { userId: string; db: AppDatabase } {
	const locals = event.locals as unknown as { user?: { id: string }; db?: AppDatabase };
	if (!locals.user?.id) {
		throw new Error('UNAUTHENTICATED');
	}
	if (!locals.db) {
		throw new Error('Database not initialized');
	}
	return { userId: locals.user.id, db: locals.db };
}

export async function listCategories(
	event: RequestEvent,
	options?: { kind?: CategoryKind; includeArchived?: boolean }
) {
	const { userId, db } = assertUser(event);
	const repo = new CategoriesRepo(db);
	return repo.list(userId, options);
}

export async function createCategory(event: RequestEvent, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(CreateCategorySchema, input);
	const repo = new CategoriesRepo(db);
	return repo.create(userId, validated);
}

export async function updateCategory(event: RequestEvent, id: string, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(UpdateCategorySchema, input);
	const repo = new CategoriesRepo(db);
	const updated = await repo.update(userId, id, validated);
	if (!updated) throw new Error('NOT_FOUND');
	return updated;
}

export async function archiveCategory(event: RequestEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new CategoriesRepo(db);
	const ok = await repo.archive(userId, id);
	if (!ok) throw new Error('NOT_FOUND');
	return { success: true };
}
