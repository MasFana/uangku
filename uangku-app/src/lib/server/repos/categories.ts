import { eq, and } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { categories, type Category, type CategoryKind } from '../db/schema';

export interface CreateCategoryInput {
	name: string;
	kind: CategoryKind;
	icon?: string | null;
	color?: string | null;
}

export interface UpdateCategoryInput {
	name?: string;
	kind?: CategoryKind;
	icon?: string | null;
	color?: string | null;
}

export class CategoriesRepo {
	constructor(private db: AppDatabase) {}

	async list(
		userId: string,
		options: { kind?: CategoryKind; includeArchived?: boolean } = {}
	): Promise<Category[]> {
		const conditions = [eq(categories.userId, userId)];

		if (!options.includeArchived) {
			conditions.push(eq(categories.archived, false));
		}
		if (options.kind) {
			conditions.push(eq(categories.kind, options.kind));
		}

		return this.db
			.select()
			.from(categories)
			.where(and(...conditions));
	}

	async getById(userId: string, id: string): Promise<Category | null> {
		const [category] = await this.db
			.select()
			.from(categories)
			.where(and(eq(categories.userId, userId), eq(categories.id, id)))
			.limit(1);

		return category ?? null;
	}

	async create(userId: string, input: CreateCategoryInput): Promise<Category> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		const [created] = await this.db
			.insert(categories)
			.values({
				id,
				userId,
				name: input.name.trim(),
				kind: input.kind,
				icon: input.icon ?? null,
				color: input.color ?? null,
				archived: false,
				createdAt: now
			})
			.returning();

		return created;
	}

	async update(userId: string, id: string, input: UpdateCategoryInput): Promise<Category | null> {
		const patch: Partial<typeof categories.$inferInsert> = {};
		if (input.name !== undefined) patch.name = input.name.trim();
		if (input.kind !== undefined) patch.kind = input.kind;
		if (input.icon !== undefined) patch.icon = input.icon;
		if (input.color !== undefined) patch.color = input.color;

		const [updated] = await this.db
			.update(categories)
			.set(patch)
			.where(and(eq(categories.userId, userId), eq(categories.id, id)))
			.returning();

		return updated ?? null;
	}

	async archive(userId: string, id: string): Promise<boolean> {
		const res = await this.db
			.update(categories)
			.set({ archived: true })
			.where(and(eq(categories.userId, userId), eq(categories.id, id)))
			.returning({ id: categories.id });

		return res.length > 0;
	}

	async unarchive(userId: string, id: string): Promise<boolean> {
		const res = await this.db
			.update(categories)
			.set({ archived: false })
			.where(and(eq(categories.userId, userId), eq(categories.id, id)))
			.returning({ id: categories.id });

		return res.length > 0;
	}
}
