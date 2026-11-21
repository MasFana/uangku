<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CashflowChart from '$lib/components/CashflowChart.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatRupiah } from '$lib/utils';
	import { goto } from '$app/navigation';
	import { currentUrl } from '$lib/client/url-state';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { deriveAnalytics } from '$lib/client/derive';

	let showFilterSheet = $state(false);

	// Filters live in the URL only (deep-linkable). This route has no `load`, so a filter
	// change re-derives locally and issues no request.
	const result = $derived(
		deriveAnalytics(syncEngine.transactions, syncEngine.wallets, syncEngine.categories, {
			range: currentUrl().searchParams.get('range'),
			from: currentUrl().searchParams.get('from'),
			to: currentUrl().searchParams.get('to'),
			granularity: currentUrl().searchParams.get('granularity'),
			walletId: currentUrl().searchParams.get('walletId'),
			categoryId: currentUrl().searchParams.get('categoryId'),
			type: currentUrl().searchParams.get('type')
		})
	);

	const filters = $derived(result.filters);
	const summary = $derived(result.summary);
	const series = $derived(result.series);
	const categories = $derived(result.categories);
	const wallets = $derived(result.wallets);
	const previous = $derived(result.previous);
	const options = $derived(result.options);

	const hasData = $derived(summary.count > 0);

	/** Writes one filter into the URL; `null`/'' removes it. */
	function applyFilter(key: string, value: string | null) {
		const params = new URLSearchParams(currentUrl().search);
		if (value) params.set(key, value);
		else params.delete(key);
		// `from`/`to` only mean anything for a custom range.
		if (key === 'range' && value !== 'custom') {
			params.delete('from');
			params.delete('to');
		}
		const q = params.toString();
		// Shallow: same page, no `load` exists here, so this issues no request.
		void goto(q ? `/analytics?${q}` : '/analytics', { shallow: true, reset: false });
	}

	// Label rentang aktif
	const rangeLabels: Record<string, string> = {
		week: 'Minggu Ini',
		month: 'Bulan Ini',
		year: 'Tahun Ini',
		all: 'Semua Periode',
		custom: 'Rentang Kustom'
	};
	const currentRangeLabel = $derived(
		filters.range === 'custom' && (filters.from || filters.to)
			? `${filters.from || '...'} – ${filters.to || '...'}`
			: rangeLabels[filters.range] || 'Bulan Ini'
	);

	// Count active filters beyond default (month, day, all type, all wallet, all cat)
	const activeFilterCount = $derived.by(() => {
		let count = 0;
		if (filters.range && filters.range !== 'month') count++;
		if (filters.granularity && filters.granularity !== 'day') count++;
		if (filters.type && filters.type !== 'all') count++;
		if (filters.walletId) count++;
		if (filters.categoryId) count++;
		return count;
	});

	// Difference calculation vs previous period
	const netDiff = $derived.by(() => {
		if (!previous) return null;
		const diff = summary.net - previous.net;
		return {
			amount: Math.abs(diff),
			isPositive: diff >= 0,
			label: diff >= 0 ? `+${formatRupiah(diff)}` : `-${formatRupiah(Math.abs(diff))}`
		};
	});
</script>

<svelte:head>
	<title>Analisis Keuangan — Uangku</title>
</svelte:head>

<div class="space-y-4">
	<h1 class="sr-only">Analisis & Laporan</h1>

	{#if !syncEngine.ready}
		<div class="space-y-3" aria-busy="true" aria-live="polite">
			<span class="sr-only">Memuat data tersimpan…</span>
			<div class="h-14 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			<div class="grid grid-cols-2 gap-3 sm:gap-4">
				<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<div class="h-56 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="h-56 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			</div>
		</div>
	{:else}
	<!-- Baris Kontrol Filter Ringkas -->
	<Card class="p-2 sm:p-2.5">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-1.5 min-w-0">
				<span class="text-xs font-bold text-content-muted shrink-0">Periode:</span>
				<span class="font-black text-xs sm:text-sm text-content truncate">
					{currentRangeLabel}
				</span>
			</div>

			<div class="flex items-center gap-1.5 shrink-0">
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="min-h-[44px] px-2.5 sm:px-3 relative font-bold text-xs"
					onclick={() => (showFilterSheet = true)}
				>
					<svg class="w-4 h-4 mr-1 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
					</svg>
					Filter
					{#if activeFilterCount > 0}
						<span class="ml-1 px-1.5 py-0.2 bg-brand text-brand-foreground text-[10px] font-black rounded-full border border-border">
							{activeFilterCount}
						</span>
					{/if}
				</Button>
			</div>
		</div>
	</Card>

	{#if !hasData}
		<EmptyState
			title="Tidak ada transaksi di periode ini"
			description="Coba ubah rentang waktu filter atau catat transaksi baru untuk melihat laporan analitik."
			actionLabel="+ Catat Transaksi"
			actionHref="/transactions?new=1"
		/>
	{:else}
		<!-- Ringkasan Statistik: 2 kolom (mobile & desktop) -->
		<div class="grid grid-cols-2 lg:grid-cols-2 gap-3 sm:gap-4">
			<!-- Pemasukan Total -->
			<Card class="p-3.5 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Total Pemasukan</p>
				<p class="text-base sm:text-lg font-black font-mono text-income tabular-nums">
					+{formatRupiah(summary.income)}
				</p>
			</Card>

			<!-- Pengeluaran Total -->
			<Card class="p-3.5 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Total Pengeluaran</p>
				<p class="text-base sm:text-lg font-black font-mono text-danger tabular-nums">
					-{formatRupiah(summary.expense)}
				</p>
			</Card>

			<!-- Net Cashflow -->
			<Card class="p-3.5 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Selisih Bersih</p>
				<p class="text-base sm:text-lg font-black font-mono tabular-nums {summary.net >= 0 ? 'text-brand' : 'text-danger'}">
					{summary.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(summary.net))}
				</p>
				{#if netDiff}
					<p class="text-[11px] font-bold mt-1 flex items-center gap-1 {netDiff.isPositive ? 'text-income' : 'text-danger'}">
						<span aria-hidden="true">{netDiff.isPositive ? '▲' : '▼'}</span>
						<span>{netDiff.label} vs lalu</span>
					</p>
				{/if}
			</Card>

			<!-- Jumlah Transaksi -->
			<Card class="p-3.5 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Total Transaksi</p>
				<p class="text-base sm:text-lg font-black font-mono text-content tabular-nums">
					{summary.count} transaksi
				</p>
			</Card>

			<!-- Rata-rata per Hari -->
			<Card class="p-3.5 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Rata-rata / Hari</p>
				<p class="text-base sm:text-lg font-black font-mono text-content tabular-nums">
					{formatRupiah(summary.avgPerDay ?? 0)}
				</p>
			</Card>

			<!-- Transaksi Terbesar -->
			<Card class="p-3.5 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Transaksi Terbesar</p>
				{#if summary.largest}
					<p class="text-base sm:text-lg font-black font-mono text-content tabular-nums">
						{formatRupiah(summary.largest.amount)}
					</p>
					<p class="text-[11px] text-content-muted truncate mt-0.5">
						{summary.largest.note || summary.largest.categoryName || 'Tanpa catatan'}
					</p>
				{:else}
					<p class="text-xs font-semibold text-content-muted mt-0.5">-</p>
				{/if}
			</Card>
		</div>

		<!-- Grid 2 Kolom Desktop: Grafik Tren + Pengeluaran per Kategori -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Grafik Arus Kas -->
			<Card class="p-4 sm:p-5">
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-sm sm:text-base font-black text-content tracking-tight">Tren Arus Kas</h2>
					<span class="text-xs font-semibold text-content-muted">
						{filters.granularity === 'month' ? 'Bulanan' : filters.granularity === 'week' ? 'Mingguan' : 'Harian'}
					</span>
				</div>
				<CashflowChart data={series} height={160} />
			</Card>

			<!-- Komposisi per Kategori -->
			<Card class="p-4 sm:p-5 space-y-3">
				<h2 class="text-sm sm:text-base font-black text-content tracking-tight border-b-2 border-border/10 pb-2">
					Pengeluaran per Kategori
				</h2>
				{#if categories.length === 0}
					<p class="text-xs text-content-muted">Belum ada pengeluaran di kategori mana pun.</p>
				{:else}
					<div class="space-y-2.5">
						{#each categories as cat}
							{@const pct = Math.round(cat.share * 100)}
							<div class="space-y-1">
								<div class="flex items-center justify-between text-xs font-bold">
									<span class="text-content truncate">{cat.name}</span>
									<span class="font-mono tabular-nums text-content-muted">{formatRupiah(cat.total)} ({pct}%)</span>
								</div>
								<div class="w-full h-2 rounded-full bg-surface-muted overflow-hidden border border-border/30">
									<div
										class="h-full bg-brand rounded-full transition-all duration-300"
										style="width: {pct}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</Card>
		</div>

		<!-- Rincian Arus Kas per Dompet -->
		<Card class="p-4 sm:p-5 space-y-3">
			<h2 class="text-sm sm:text-base font-black text-content tracking-tight border-b-2 border-border/10 pb-2">
				Kinerja per Dompet
			</h2>
			{#if wallets.length === 0}
				<p class="text-xs text-content-muted">Belum ada mutasi dompet di periode ini.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left text-xs font-sans">
						<thead>
							<tr class="border-b-2 border-border/20 text-content-muted uppercase tracking-wider">
								<th class="py-2 font-bold">Dompet</th>
								<th class="py-2 text-right font-bold">Masuk</th>
								<th class="py-2 text-right font-bold">Keluar</th>
								<th class="py-2 text-right font-bold">Net</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border/10">
							{#each wallets as w}
								<tr>
									<td class="py-2 font-bold text-content truncate max-w-[120px]">{w.name}</td>
									<td class="py-2 text-right font-mono tabular-nums text-income">+{formatRupiah(w.income)}</td>
									<td class="py-2 text-right font-mono tabular-nums text-danger">-{formatRupiah(w.expense)}</td>
									<td class="py-2 text-right font-mono tabular-nums font-bold {w.net >= 0 ? 'text-brand' : 'text-danger'}">
										{w.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(w.net))}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	{/if}

	<!-- Sheet Filter Modal -->
	<Dialog.Root bind:open={showFilterSheet}>
		<Dialog.Content class="space-y-4 max-h-[90vh] overflow-y-auto sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title class="text-lg font-black text-content">Filter Analisis</Dialog.Title>
			</Dialog.Header>

			<div class="space-y-4">
				<div class="space-y-1.5">
					<label for="sheet-analytics-range" class="block text-sm font-bold text-content">Rentang Waktu</label>
					<select
						id="sheet-analytics-range"
						name="range"
						value={filters.range || 'month'}
						onchange={(e) => applyFilter('range', e.currentTarget.value)}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="week">Minggu Ini</option>
						<option value="month">Bulan Ini</option>
						<option value="year">Tahun Ini</option>
						<option value="all">Semua</option>
						<option value="custom">Kustom</option>
					</select>
				</div>

				{#if filters.range === 'custom'}
					<div class="space-y-3 pt-2 border-t border-border/20">
						<div class="space-y-1.5">
							<label for="from" class="block text-xs font-bold text-content">Dari Tanggal</label>
							<input
								type="date"
								id="from"
								name="from"
								value={filters.from || ''}
								onchange={(e) => applyFilter('from', e.currentTarget.value)}
								class="w-full min-h-[44px] px-3 py-2 text-sm font-mono rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
						<div class="space-y-1.5">
							<label for="to" class="block text-xs font-bold text-content">Sampai Tanggal</label>
							<input
								type="date"
								id="to"
								name="to"
								value={filters.to || ''}
								onchange={(e) => applyFilter('to', e.currentTarget.value)}
								class="w-full min-h-[44px] px-3 py-2 text-sm font-mono rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
					</div>
				{/if}

				<div class="space-y-1.5">
					<label for="granularity" class="block text-sm font-bold text-content">Granularitas Grafik</label>
					<select
						id="granularity"
						name="granularity"
						value={filters.granularity || 'day'}
						onchange={(e) => applyFilter('granularity', e.currentTarget.value)}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="day">Harian</option>
						<option value="week">Mingguan</option>
						<option value="month">Bulanan</option>
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="type" class="block text-sm font-bold text-content">Jenis Transaksi</label>
					<select
						id="type"
						name="type"
						value={filters.type || 'all'}
						onchange={(e) => applyFilter('type', e.currentTarget.value)}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="all">Semua Jenis</option>
						<option value="income">Pemasukan Saja</option>
						<option value="expense">Pengeluaran Saja</option>
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="walletId" class="block text-sm font-bold text-content">Dompet</label>
					<select
						id="walletId"
						name="walletId"
						value={filters.walletId || ''}
						onchange={(e) => applyFilter('walletId', e.currentTarget.value)}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Dompet</option>
						{#each options.wallets as w}
							<option value={w.id}>{w.name}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="categoryId" class="block text-sm font-bold text-content">Kategori</label>
					<select
						id="categoryId"
						name="categoryId"
						value={filters.categoryId || ''}
						onchange={(e) => applyFilter('categoryId', e.currentTarget.value)}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Kategori</option>
						{#each options.categories as c}
							<option value={c.id}>{c.name} ({c.kind === 'income' ? 'Masuk' : 'Keluar'})</option>
						{/each}
					</select>
				</div>

				<div class="flex items-center justify-between gap-2 pt-3 border-t-2 border-border/10">
					<a
						href="/analytics"
						class="min-h-[44px] px-4 py-2 text-xs font-bold rounded-md border-2 border-border bg-surface text-content hover:bg-surface-subtle flex items-center justify-center"
					>
						Reset
					</a>
					<Button
						type="button"
						variant="primary"
						class="min-h-[44px]"
						onclick={() => (showFilterSheet = false)}
					>
						Selesai
					</Button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Root>
	{/if}
</div>
