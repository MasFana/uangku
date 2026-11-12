import type { PageServerLoad, Actions } from './$types';
import {
	listTransactions,
	createTransaction,
	updateTransaction,
	deleteTransaction,
	createTransfer
} from '$lib/server/services/transactions';
import { listWallets } from '$lib/server/services/wallets';
import { listCategories } from '$lib/server/services/categories';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	const url = event.url;
	const walletId = url.searchParams.get('walletId') || undefined;
	const categoryId = url.searchParams.get('categoryId') || undefined;
	const typeParam = url.searchParams.get('type') || undefined;
	const type = typeParam === 'income' || typeParam === 'expense' || typeParam === 'transfer' ? typeParam : undefined;
	const startDate = url.searchParams.get('startDate') || undefined;
	const endDate = url.searchParams.get('endDate') || undefined;
	const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
	const limit = Math.min(Math.max(limitParam, 5), 100);
	const cursor = url.searchParams.get('cursor') || undefined;

	try {
		const [txResult, wallets, categories] = await Promise.all([
			listTransactions(event, {
				walletId,
				categoryId,
				type,
				startDate,
				endDate,
				limit,
				cursor
			}),
			listWallets(event, false),
			listCategories(event, { includeArchived: false })
		]);

		return {
			transactions: txResult.items,
			nextCursor: txResult.nextCursor,
			hasMore: txResult.hasMore,
			wallets,
			categories,
			filters: {
				walletId: walletId || '',
				categoryId: categoryId || '',
				type: type || '',
				startDate: startDate || '',
				endDate: endDate || ''
			}
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Gagal memuat transaksi';
		return {
			transactions: [],
			nextCursor: null,
			hasMore: false,
			wallets: [],
			categories: [],
			filters: { walletId: '', categoryId: '', type: '', startDate: '', endDate: '' },
			error: message
		};
	}
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const kind = formData.get('formKind')?.toString() || 'transaction';

		if (kind === 'transfer') {
			const fromWalletId = formData.get('fromWalletId')?.toString() || '';
			const toWalletId = formData.get('toWalletId')?.toString() || '';
			const amount = parseInt(formData.get('amount')?.toString() || '0', 10);
			const date = formData.get('date')?.toString() || new Date().toISOString().slice(0, 10);
			const note = formData.get('note')?.toString() || undefined;

			try {
				await createTransfer(event, { fromWalletId, toWalletId, amount, date, note });
				return { success: true };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Gagal memproses transfer';
				return fail(400, { error: message });
			}
		}

		// Income / Expense
		const walletId = formData.get('walletId')?.toString() || '';
		const categoryId = formData.get('categoryId')?.toString() || '';
		const amount = parseInt(formData.get('amount')?.toString() || '0', 10);
		const type = (formData.get('type')?.toString() || 'expense') as 'income' | 'expense';
		const date = formData.get('date')?.toString() || new Date().toISOString().slice(0, 10);
		const note = formData.get('note')?.toString() || undefined;

		try {
			await createTransaction(event, { walletId, categoryId, amount, type, date, note });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal mencatat transaksi';
			return fail(400, { error: message });
		}
	},

	update: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString() || '';
		const walletId = formData.get('walletId')?.toString() || '';
		const categoryId = formData.get('categoryId')?.toString() || '';
		const amount = parseInt(formData.get('amount')?.toString() || '0', 10);
		const type = (formData.get('type')?.toString() || 'expense') as 'income' | 'expense';
		const date = formData.get('date')?.toString() || new Date().toISOString().slice(0, 10);
		const note = formData.get('note')?.toString() || undefined;

		try {
			await updateTransaction(event, id, { walletId, categoryId, amount, type, date, note });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal memperbarui transaksi';
			return fail(400, { error: message });
		}
	},

	delete: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString() || '';

		try {
			await deleteTransaction(event, id);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Gagal menghapus transaksi';
			return fail(400, { error: message });
		}
	}
};
