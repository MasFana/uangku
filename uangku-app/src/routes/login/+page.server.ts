import type { PageServerLoad } from './$types';
import { safeRedirectPath } from '$lib/shared/safe-redirect';

/**
 * Reasons Better-Auth sends back on `/login?error=...` when a Google sign-in
 * cannot continue. Only the first one can be fixed by the person: the email is
 * already an email-and-password account, and linking happens while signed in.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
	account_not_linked:
		'Email ini sudah terdaftar dengan kata sandi. Masuk dengan kata sandi, lalu hubungkan Google dari halaman Setelan.',
	email_does_not_match: 'Email akun Google berbeda dengan email akun yang sedang masuk.',
	account_already_linked_to_different_user:
		'Akun Google ini sudah terhubung ke pengguna Uangku yang lain.',
	email_not_verified: 'Email pada akun Google Anda belum terverifikasi.',
	unable_to_link_account: 'Google tidak bisa dihubungkan sekarang. Coba lagi.'
};

export const load: PageServerLoad = async ({ url }) => {
	const error = url.searchParams.get('error');
	return {
		redirectTo: safeRedirectPath(url.searchParams.get('redirectTo')),
		oauthError: error
			? (OAUTH_ERROR_MESSAGES[error] ??
				'Masuk dengan Google gagal. Coba lagi atau pakai kata sandi.')
			: null
	};
};
