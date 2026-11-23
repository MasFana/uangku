import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

// No `load`: the account is delivered by `+layout.server.ts`, so navigating here costs
// zero data requests. Only the account actions need the server.
export const actions: Actions = {
	logout: async (event) => {
		if (event.locals.auth) {
			await event.locals.auth.api.signOut({ headers: event.request.headers });
		}
		event.cookies.delete('better-auth.session_token', { path: '/' });
		throw redirect(303, '/login');
	},

	/** Adds email-and-password sign-in to an account that only has a social provider. */
	setPassword: async (event) => {
		const auth = event.locals.auth;
		if (!auth) return fail(500, { error: 'Server belum siap. Coba lagi sebentar lagi.' });

		const form = await event.request.formData();
		const newPassword = String(form.get('newPassword') ?? '');
		if (newPassword.length < 8) return fail(400, { error: 'Kata sandi minimal 8 karakter.' });

		// `setPassword` is a server-only endpoint, and a live session alone must not
		// replace a password that already exists: that would hand over the account.
		const accounts = await auth.api.listUserAccounts({ headers: event.request.headers });
		if (accounts.some((account) => account.providerId === 'credential')) {
			return fail(400, { error: 'Akun ini sudah punya kata sandi.' });
		}

		try {
			await auth.api.setPassword({ body: { newPassword }, headers: event.request.headers });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('SESSION_NOT_FRESH')) {
				return fail(400, { error: 'Sesi Anda terlalu lama. Masuk ulang, lalu buat kata sandi.' });
			}
			return fail(400, { error: 'Kata sandi gagal disimpan. Coba lagi.' });
		}

		return { message: 'Kata sandi dibuat. Sekarang Anda bisa masuk pakai email dan kata sandi.' };
	}
};
