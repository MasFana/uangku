<script lang="ts">
	import Button from './Button.svelte';
	import { safeRedirectPath } from '$lib/shared/safe-redirect';

	interface Props {
		/** Where to land after Google returns; a path on this site. */
		callbackURL?: string;
		/**
		 * `signin` starts or resumes a session, `link` attaches Google to the signed-in
		 * account from Settings. They are different endpoints: `/link-social` checks
		 * that the Google email matches the current account.
		 */
		mode?: 'signin' | 'link';
		label?: string;
		class?: string;
	}

	let {
		callbackURL = '/',
		mode = 'signin',
		label = mode === 'link' ? 'Hubungkan Google' : 'Lanjutkan dengan Google',
		class: className = ''
	}: Props = $props();
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);

	async function signInWithGoogle() {
		loading = true;
		errorMessage = null;
		try {
			// Both endpoints answer with the Google URL in `url` and set the signed
			// state cookie on this response, so a plain fetch keeps the flow.
			const res = await fetch(
				mode === 'link' ? '/api/auth/link-social' : '/api/auth/sign-in/social',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						provider: 'google',
						callbackURL: safeRedirectPath(callbackURL),
						errorCallbackURL: mode === 'link' ? '/settings?linkError=1' : '/login?oauth=google'
					})
				}
			);
			const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
			if (!res.ok || !data.url) {
				errorMessage =
					data.message ??
					(mode === 'link'
						? 'Google tidak bisa dihubungkan sekarang. Coba lagi.'
						: 'Tidak bisa membuka halaman Google. Coba lagi.');
				loading = false;
				return;
			}
			window.location.href = data.url;
		} catch {
			errorMessage = 'Koneksi ke server gagal. Periksa sambungan internet Anda.';
			loading = false;
		}
	}
</script>

<Button
	type="button"
	variant="secondary"
	size="lg"
	loading={loading}
	disabled={loading}
	class="w-full {className}"
	onclick={signInWithGoogle}
>
	{#if !loading}
		<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57Z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 24Z"
			/>
			<path
				fill="#FBBC05"
				d="M5.55 14.67a6.9 6.9 0 0 1 0-4.42V7.27H1.7a11.5 11.5 0 0 0 0 10.38l3.85-2.98Z"
			/>
			<path
				fill="#EA4335"
				d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.24 15.1 0 12 0 7.5 0 3.6 2.58 1.7 7.27l3.85 2.98C6.46 7.53 9 4.75 12 4.75Z"
			/>
		</svg>
	{/if}
	{loading ? 'Menghubungkan...' : label}
</Button>
{#if errorMessage}
	<p class="mt-2 text-xs font-bold text-danger" role="alert">{errorMessage}</p>
{/if}
