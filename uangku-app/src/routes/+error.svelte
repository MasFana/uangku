<script lang="ts">
	import { page } from '$app/state';
	import Card from '../lib/components/Card.svelte';
	import Button from '../lib/components/Button.svelte';

	const statusCode = $derived(page.status || 500);
	const message = $derived(
		page.error?.message ||
			(statusCode === 404
				? 'Halaman yang Anda cari tidak ditemukan.'
				: 'Terjadi kesalahan sistem yang tidak diharapkan.')
	);
</script>

<svelte:head>
	<title>{statusCode} — Kesalahan | Uangku</title>
</svelte:head>

<div class="min-h-[60vh] flex items-center justify-center p-4">
	<Card variant="default" shadow="lg" class="max-w-md w-full text-center p-6 md:p-8">
		<div class="inline-flex items-center justify-center px-4 py-1.5 rounded-full border-2 border-border bg-expense text-expense-foreground font-mono font-black text-2xl tracking-wider mb-4 shadow-hard-sm">
			{statusCode}
		</div>

		<h1 class="text-xl md:text-2xl font-black text-content tracking-tight mb-2">
			{#if statusCode === 404}
				Halaman Tidak Ditemukan
			{:else}
				Terjadi Gangguan
			{/if}
		</h1>

		<p class="text-sm text-content-muted leading-relaxed mb-6">
			{message}
		</p>

		<div class="flex flex-col sm:flex-row gap-3 justify-center">
			<a
				href="/"
				class="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-md border-2 border-border bg-brand text-brand-foreground font-bold text-sm shadow-hard-sm hover:bg-brand-hover active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
			>
				Kembali ke Beranda
			</a>
			<button
				type="button"
				onclick={() => history.back()}
				class="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-md border-2 border-border bg-surface text-content font-bold text-sm shadow-hard-sm hover:bg-surface-subtle active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
			>
				Halaman Sebelumnya
			</button>
		</div>
	</Card>
</div>
