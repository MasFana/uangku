<script lang="ts">
	import Card from '../../lib/components/Card.svelte';
	import Input from '../../lib/components/Input.svelte';
	import Button from '../../lib/components/Button.svelte';
	import Logo from '../../lib/components/Logo.svelte';
	import GoogleButton from '../../lib/components/GoogleButton.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let nameError = $state<string | null>(null);
	let emailError = $state<string | null>(null);
	let passwordError = $state<string | null>(null);
	let confirmPasswordError = $state<string | null>(null);

	function validate(): boolean {
		let valid = true;
		nameError = null;
		emailError = null;
		passwordError = null;
		confirmPasswordError = null;
		errorMessage = null;

		if (!name.trim()) {
			nameError = 'Nama lengkap wajib diisi.';
			valid = false;
		}

		if (!email.trim()) {
			emailError = 'Email wajib diisi.';
			valid = false;
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			emailError = 'Format email tidak valid.';
			valid = false;
		}

		if (!password) {
			passwordError = 'Kata sandi wajib diisi.';
			valid = false;
		} else if (password.length < 8) {
			passwordError = 'Kata sandi minimal 8 karakter.';
			valid = false;
		}

		if (password !== confirmPassword) {
			confirmPasswordError = 'Konfirmasi kata sandi tidak cocok.';
			valid = false;
		}

		return valid;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!validate()) return;

		loading = true;
		errorMessage = null;

		try {
			// Hook into Better-Auth sign-up endpoint
			const res = await fetch('/api/auth/sign-up/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, password })
			});

			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				errorMessage = data.message || 'Pendaftaran gagal. Email mungkin sudah terdaftar.';
				loading = false;
				return;
			}

			// Sign up success -> redirect to dashboard
			window.location.href = '/';
		} catch (err) {
			errorMessage = 'Koneksi ke server gagal. Periksa sambungan internet Anda.';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Daftar Akun — Uangku</title>
</svelte:head>

<div class="min-h-[85vh] flex flex-col items-center justify-center py-6 px-4">
	<div class="mb-6 text-center">
		<Logo size="lg" showText={true} />
	</div>

	<Card variant="default" shadow="lg" class="w-full max-w-sm p-6">
		<h1 class="text-xl font-black text-content tracking-tight mb-5">
			Buat Akun Baru
		</h1>

		{#if errorMessage}
			<div
				class="mb-4 p-3 rounded border-2 border-border bg-expense text-expense-foreground text-xs font-bold flex items-start gap-2 shadow-hard-sm"
				role="alert"
			>
				<svg class="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
				</svg>
				<span>{errorMessage}</span>
			</div>
		{/if}

		{#if data.googleEnabled}
			<div class="mb-5">
				<GoogleButton callbackURL="/" />
				<div class="mt-4 flex items-center gap-3" aria-hidden="true">
					<span class="h-0.5 flex-1 bg-border/30"></span>
					<span class="text-xs font-bold text-content-muted">atau</span>
					<span class="h-0.5 flex-1 bg-border/30"></span>
				</div>
			</div>
		{/if}
		<form onsubmit={handleSubmit} class="space-y-3.5" novalidate>
			<Input
				label="Nama Lengkap"
				id="register-name"
				type="text"
				autocomplete="name"
				required
				placeholder="Nama Anda"
				bind:value={name}
				error={nameError ?? undefined}
				disabled={loading}
			/>

			<Input
				label="Email"
				id="register-email"
				type="email"
				autocomplete="email"
				required
				placeholder="nama@domain.com"
				bind:value={email}
				error={emailError ?? undefined}
				disabled={loading}
			/>

			<Input
				label="Kata Sandi"
				id="register-password"
				type="password"
				autocomplete="new-password"
				required
				placeholder="Minimal 8 karakter"
				bind:value={password}
				error={passwordError ?? undefined}
				disabled={loading}
			/>

			<Input
				label="Ulangi Kata Sandi"
				id="register-confirm-password"
				type="password"
				autocomplete="new-password"
				required
				placeholder="Ketik ulang kata sandi"
				bind:value={confirmPassword}
				error={confirmPasswordError ?? undefined}
				disabled={loading}
			/>

			<div class="pt-2">
				<Button
					type="submit"
					variant="primary"
					size="lg"
					{loading}
					disabled={loading}
					class="w-full"
				>
					{loading ? 'Mendaftarkan...' : 'Daftar Akun'}
				</Button>
			</div>
		</form>

		<div class="mt-6 pt-4 border-t-2 border-border/20 text-center">
			<p class="text-xs text-content-muted">
				Sudah memiliki akun?
				<a
					href="/login"
					class="font-bold text-content hover:underline underline-offset-2 ml-1 inline-flex items-center min-h-[44px] px-1"
				>
					Masuk di sini
				</a>
			</p>
		</div>
	</Card>
</div>
