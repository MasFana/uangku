<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Pengaturan — Uangku</title>
</svelte:head>

<div class="space-y-6 max-w-xl mx-auto">
	<div>
		<h1 class="text-2xl sm:text-3xl font-black tracking-tight text-content">
			Pengaturan Akun
		</h1>
		<p class="text-sm font-semibold text-content-muted mt-0.5">
			Kelola akun dan preferensi aplikasi pencatatan keuangan Anda.
		</p>
	</div>

	<!-- Info Akun -->
	<Card class="p-6 space-y-4">
		<h2 class="text-base font-black text-content border-b-2 border-border/10 pb-2">
			Informasi Pengguna
		</h2>

		<div class="space-y-3">
			<div>
				<span class="text-xs font-bold text-content-muted block">Nama Pengguna</span>
				<p class="text-sm font-bold text-content mt-0.5">
					{data.user?.name || 'Pengguna Uangku'}
				</p>
			</div>

			<div>
				<span class="text-xs font-bold text-content-muted block">Alamat Email</span>
				<p class="text-sm font-bold font-mono text-content mt-0.5">
					{data.user?.email || 'email@domain.com'}
				</p>
			</div>

			<div>
				<span class="text-xs font-bold text-content-muted block">ID Pengguna</span>
				<p class="text-xs font-mono text-content-muted mt-0.5 break-all">
					{data.user?.id || '-'}
				</p>
			</div>
		</div>
	</Card>

	<!-- Navigasi Cepat Pengaturan -->
	<Card class="p-6 space-y-4">
		<h2 class="text-base font-black text-content border-b-2 border-border/10 pb-2">
			Data & Entitas
		</h2>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<a
				href="/wallets"
				class="p-4 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-between"
			>
				<span>Kelola Dompet</span>
				<span class="text-content-muted">→</span>
			</a>

			<a
				href="/categories"
				class="p-4 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-between"
			>
				<span>Kelola Kategori</span>
				<span class="text-content-muted">→</span>
			</a>

	<!-- Ekspor Data -->
	<Card class="p-6 space-y-3">
		<h2 class="text-base font-black text-content">
			Ekspor Data
		</h2>
		<p class="text-xs text-content-muted leading-relaxed">
			Unduh seluruh data transaksi Anda dalam satu berkas CSV untuk arsip pribadi atau analisis mandiri.
		</p>
		<div class="pt-1">
			<a
				href="/api/export"
				download
				class="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle text-content font-bold text-sm shadow-hard-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content transition-all"
			>
				<span>Unduh Transaksi (CSV)</span>
				<span class="ml-2 text-content-muted" aria-hidden="true">↓</span>
			</a>
		</div>
	</Card>
		</div>
	</Card>

	<!-- Keluar Akun -->
	<Card class="p-6 border-danger/40 bg-danger/5 space-y-3">
		<h2 class="text-base font-black text-danger">
			Keluar dari Sesi
		</h2>
		<p class="text-xs text-content-muted leading-relaxed">
			Keluar dari akun Anda pada perangkat ini. Untuk mengakses kembali data Anda, silakan masuk dengan email dan kata sandi.
		</p>

		<form method="POST" action="?/logout" class="pt-2">
			<Button
				type="submit"
				variant="outline"
				class="border-danger text-danger hover:bg-danger hover:text-white"
			>
				Keluar dari Akun
			</Button>
		</form>
	</Card>

	<div class="text-center pt-4">
		<p class="text-xs text-content-muted font-mono">
			Uangku v0.1.0 • Cloudflare Edge Architecture
		</p>
	</div>
</div>
