import type { PageServerLoad, Actions } from './$types';
import { listWallets, createWallet, updateWallet, archiveWallet } from '$lib/server/services/wallets';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	try {
		const wallets = await listWallets(event, false);
		return { wallets };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Gagal memuat daftar dompet';
		return { wallets: [], error: message };
	}
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() || '';
		const type = formData.get('type')?.toString() || 'cash';
		const balanceStr = formData.get('initialBalance')?.toString() || '0';
		const initialBalance = parseInt(balanceStr, 10) || 0;

		try {
			await createWallet(event, { name, type, initialBalance });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal membuat dompet';
			return fail(400, { error: message, values: { name, type, initialBalance } });
		}
	},

	update: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString() || '';
		const name = formData.get('name')?.toString() || '';
		const type = formData.get('type')?.toString() || 'cash';

		try {
			await updateWallet(event, id, { name, type });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal memperbarui dompet';
			return fail(400, { error: message });
		}
	},

	archive: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString() || '';

		try {
			await archiveWallet(event, id);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal mengarsipkan dompet';
			return fail(400, { error: message });
		}
	}
};
