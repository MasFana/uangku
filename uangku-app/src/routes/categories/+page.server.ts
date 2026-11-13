import type { PageServerLoad, Actions } from './$types';
import {
	listCategories,
	createCategory,
	updateCategory,
	archiveCategory,
	seedDefaultCategories
} from '$lib/server/services/categories';
import { invalidateDashboard } from '$lib/server/cache';
import { assertUser } from '$lib/server/types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	try {
		const categories = await listCategories(event, { includeArchived: false });
		return { categories };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Gagal memuat kategori';
		return { categories: [], error: message };
	}
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() || '';
		const kind = (formData.get('kind')?.toString() || 'expense') as 'income' | 'expense';
		const icon = formData.get('icon')?.toString() || 'tag';
		const color = formData.get('color')?.toString() || '#22c55e';

		try {
			await createCategory(event, { name, kind, icon, color });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal membuat kategori';
			return fail(400, { error: message });
		}
	},

	update: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString() || '';
		const name = formData.get('name')?.toString() || '';
		const kind = (formData.get('kind')?.toString() || 'expense') as 'income' | 'expense';
		const icon = formData.get('icon')?.toString() || 'tag';
		const color = formData.get('color')?.toString() || '#22c55e';

		try {
			await updateCategory(event, id, { name, kind, icon, color });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal memperbarui kategori';
			return fail(400, { error: message });
		}
	},

	archive: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString() || '';

		try {
			await archiveCategory(event, id);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal mengarsipkan kategori';
			return fail(400, { error: message });
		}
	},

	seedDefaults: async (event) => {
		try {
			const { userId } = assertUser(event);
			const inserted = await seedDefaultCategories(event);
			await invalidateDashboard(event, userId);
			return { success: true, inserted };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal menyalin kategori bawaan';
			return fail(400, { error: message });
		}
	}
};
