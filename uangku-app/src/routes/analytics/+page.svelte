<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CashflowChart from '$lib/components/CashflowChart.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatDateIndo, formatRupiah } from '$lib/utils';
	import { bucketRange } from '$lib/shared/dates';
	import { goto } from '$app/navigation';
	import { currentUrl } from '$lib/client/url-state';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { deriveAnalytics } from '$lib/client/derive';

	let showFilterSheet = $state(false);

	// Filters live in the URL only (deep-linkable). This route has no `load`, so a filter
	// change re-derives locally and issues no request.
	const urlParams = $derived(currentUrl().searchParams);
	const result = $derived(
		deriveAnalytics(syncEngine.transactions, syncEngine.wallets, syncEngine.categories, {
			range: urlParams.get('range'),
			from: urlParams.get('from'),
			to: urlParams.get('to'),
			granularity: urlParams.get('granularity'),
			walletId: urlParams.get('walletId'),
			categoryId: urlParams.get('categoryId'),
			type: urlParams.get('type')
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
	const expenseBasis = $derived(filters.categoriesBasis === 'expense');

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

	// Label rentang aktif datang dari hasil derivasi, jadi bentuknya sama untuk semua rentang.
	const currentRangeLabel = $derived(filters.label);

	/** Jumlah filter yang dipilih user, dihitung dari URL (bukan dari hasil derivasi). */
	const activeFilterCount = $derived.by(() => {
		let count = 0;
		const range = urlParams.get('range');
		if (range && range !== 'month') count++;
		if (urlParams.get('granularity')) count++;
		if (urlParams.get('from') || urlParams.get('to')) count++;
		if (urlParams.get('type') && urlParams.get('type') !== 'all') count++;
		if (urlParams.get('walletId')) count++;
		if (urlParams.get('categoryId')) count++;
		return count;
	});

	/**
	 * Deep link ke daftar Transaksi dengan filter yang sama.
	 * `extra` menimpa nilai dasar, misalnya untuk membuka satu kategori atau satu hari.
	 */
	function txHref(extra: Record<string, string | null> = {}): string {
		const params = new URLSearchParams();
		if (filters.range === 'month') {
			params.set('period', filters.startDate.slice(0, 7));
		} else if (filters.range === 'all') {
			params.set('period', 'all');
		} else {
			params.set('period', 'custom');
			params.set('startDate', filters.startDate);
			params.set('endDate', filters.endDate);
		}
		if (filters.type !== 'all') params.set('type', filters.type);
		if (filters.walletId) params.set('walletId', filters.walletId);
		if (filters.categoryId) params.set('categoryId', filters.categoryId);
		for (const [key, value] of Object.entries(extra)) {
			if (value) params.set(key, value);
			else params.delete(key);
		}
		return `/transactions?${params.toString()}`;
	}

	/**
	 * Tautan daftar Transaksi untuk satu titik grafik.
	 * Bulanan memakai preset `YYYY-MM`, harian dan mingguan memakai rentang kustom.
	 */
	function txHrefForBucket(bucket: string): string {
		const range = bucketRange(bucket, filters.granularity);
		if (!range) return txHref();
		if (filters.granularity === 'month') return txHref({ period: bucket });
		return txHref({ period: 'custom', startDate: range.startDate, endDate: range.endDate });
	}

	const largestHref = $derived.by(() => {
		if (!summary.largest) return null;
		const day = summary.largest.occurredAt.slice(0, 10);
		return txHref({
			period: 'custom',
			startDate: day,
			endDate: day,
			type: summary.largest.type,
			walletId: summary.largest.walletId
		});
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

	const granularityLabel = $derived(
		filters.granularity === 'month' ? 'Bulanan' : filters.granularity === 'week' ? 'Mingguan' : 'Harian'
	);
	/** Bentuk sifat untuk kalimat: "pemasukan dan pengeluaran harian", bukan "per harian". */
	const granularityAdjective = $derived(granularityLabel.toLowerCase());
	const basisLabel = $derived(expenseBasis ? 'Pengeluaran' : 'Pemasukan');
</script>

<svelte:head>
	<title>Analisis Keuangan — Uangku</title>
</svelte:head>

<div class="space-y-3 sm:space-y-4">
	<h1 class="sr-only">Analisis & Laporan</h1>

	{#if !syncEngine.ready}
		<div class="space-y-3" aria-busy="true" aria-live="polite">
			<span class="sr-only">Memuat data tersimpan...</span>
			<div class="h-14 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
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
						<span class="sr-only">{activeFilterCount} filter aktif</span>
					{/if}
				</Button>
			</div>
		</div>
	</Card>

	{#if !hasData}
		{#if activeFilterCount > 0}
			<EmptyState
				title="Tidak ada transaksi yang cocok"
				description="Filter yang aktif tidak punya hasil di periode ini. Longgarkan filter atau ubah rentang waktu."
				actionLabel="Hapus semua filter"
				actionHref="/analytics"
			/>
		{:else}
			<EmptyState
				title="Belum ada transaksi"
				description="Catat transaksi pertama untuk melihat ringkasan, tren arus kas, dan rincian per kategori."
				actionLabel="+ Catat Transaksi"
				actionHref="/transactions?new=1"
			/>
		{/if}
	{:else}
		{#if summary.transferCount === summary.count}
			<p class="text-xs font-bold text-content-muted bg-surface-subtle border-2 border-border/30 rounded-md px-3 py-2">
				Periode ini hanya berisi transfer antar dompet. Transfer tidak masuk pemasukan atau pengeluaran.
			</p>
		{/if}

		<!-- Ringkasan Statistik: 2 kolom di ponsel, 3 kolom di desktop -->
		<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
			<!-- Pemasukan Total -->
			<Card class="p-3 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Total Pemasukan</p>
				<p class="text-base sm:text-lg font-black font-mono text-income tabular-nums whitespace-nowrap">
					+{formatRupiah(summary.income)}
				</p>
				<a href={txHref({ type: 'income' })} class="mt-1 inline-flex items-center min-h-[44px] text-[11px] font-bold text-brand underline whitespace-nowrap">
					Lihat transaksi
				</a>
			</Card>

			<!-- Pengeluaran Total -->
			<Card class="p-3 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Total Pengeluaran</p>
				<p class="text-base sm:text-lg font-black font-mono text-expense tabular-nums whitespace-nowrap">
					-{formatRupiah(summary.expense)}
				</p>
				<a href={txHref({ type: 'expense' })} class="mt-1 inline-flex items-center min-h-[44px] text-[11px] font-bold text-brand underline whitespace-nowrap">
					Lihat transaksi
				</a>
			</Card>

			<!-- Net Cashflow -->
			<Card class="p-3 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Selisih Bersih</p>
				<p class="text-base sm:text-lg font-black font-mono tabular-nums whitespace-nowrap {summary.net >= 0 ? 'text-income' : 'text-expense'}">
					{summary.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(summary.net))}
				</p>
				{#if netDiff}
					<p class="text-[11px] font-bold mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 {netDiff.isPositive ? 'text-income' : 'text-expense'}">
						<span aria-hidden="true">{netDiff.isPositive ? '▲' : '▼'}</span>
						<span class="whitespace-nowrap">{netDiff.label}</span>
						<span class="whitespace-nowrap">vs {previous?.label}</span>
					</p>
				{/if}
			</Card>

			<!-- Jumlah Transaksi -->
			<Card class="p-3 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Total Transaksi</p>
				<p class="text-base sm:text-lg font-black font-mono text-content tabular-nums whitespace-nowrap">
					{summary.count} transaksi
				</p>
				<p class="text-[11px] text-content-muted mt-1">
					{#if summary.transferCount > 0}
						termasuk {summary.transferCount} transfer
					{:else}
						tanpa transfer
					{/if}
				</p>
				<a href={txHref()} class="mt-1 inline-flex items-center min-h-[44px] text-[11px] font-bold text-brand underline whitespace-nowrap">
					Lihat transaksi
				</a>
			</Card>

			<!-- Rata-rata per Hari -->
			<Card class="p-3 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">
					Rata-rata {basisLabel} / Hari
				</p>
				<p class="text-base sm:text-lg font-black font-mono text-content tabular-nums whitespace-nowrap">
					{formatRupiah(summary.avgPerDay)}
				</p>
				<p class="text-[11px] text-content-muted mt-1">
					dari {filters.daysCount} hari{filters.daysCount < 2 ? '' : ' terakhir di periode ini'}
				</p>
			</Card>

			<!-- Transaksi Terbesar -->
			<Card class="p-3 sm:p-4">
				<p class="text-[11px] font-bold text-content-muted uppercase tracking-wider mb-0.5">Transaksi Terbesar</p>
				{#if summary.largest}
					{@const largest = summary.largest}
					{@const isIncome = largest.type === 'income'}
					<p class="text-base sm:text-lg font-black font-mono tabular-nums whitespace-nowrap {isIncome ? 'text-income' : 'text-expense'}">
						{isIncome ? '+' : '-'}{formatRupiah(largest.amount)}
					</p>
					<p class="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
						<span class="font-bold whitespace-nowrap {isIncome ? 'text-income' : 'text-expense'}">
							{isIncome ? 'Pemasukan' : 'Pengeluaran'}
						</span>
						<span class="text-content-muted whitespace-nowrap">· {formatDateIndo(largest.occurredAt)}</span>
					</p>
					<p class="text-[11px] text-content-muted truncate">
						{largest.note || largest.categoryName || 'Tanpa catatan'}{#if largest.note && largest.categoryName} · {largest.categoryName}{/if}
						{#if largest.walletName} · {largest.walletName}{/if}
					</p>
					{#if largestHref}
						<a href={largestHref} class="mt-1 inline-flex items-center min-h-[44px] text-[11px] font-bold text-brand underline whitespace-nowrap">
							Lihat transaksi
						</a>
					{/if}
				{:else}
					<p class="text-xs font-semibold text-content-muted mt-0.5">-</p>
				{/if}
			</Card>
		</div>

		<!-- GRAFIK DAN RINCIAN: kelompok analisis, jaraknya lebih lega dari baris angka di atas. -->
		<div class="space-y-4 sm:space-y-5">
			<!-- Grid 2 Kolom Desktop: Grafik Tren + Rincian per Kategori -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<!-- Grafik Arus Kas -->
				<Card class="p-4 sm:p-5">
					<div class="flex items-start justify-between gap-2 mb-2">
						<div class="min-w-0">
							<h2 class="text-sm sm:text-base font-black text-content tracking-tight">Tren Arus Kas</h2>
							<p class="text-[11px] font-semibold text-content-muted">
								Pemasukan dan pengeluaran {granularityAdjective}
							</p>
						</div>
						<span class="text-xs font-bold text-content-muted shrink-0 text-right max-w-[45%]">
							{currentRangeLabel}
						</span>
					</div>
					{#if filters.granularityAdjusted}
						<p class="text-[11px] text-content-muted mb-2">
							Granularitas dinaikkan otomatis karena rentang terlalu panjang untuk grafik harian.
						</p>
					{/if}
					<CashflowChart
						data={series}
						height={160}
						granularity={filters.granularity}
						hrefForBucket={txHrefForBucket}
					/>
				</Card>

				<!-- Rincian per Kategori (pengeluaran, atau pemasukan saat filter jenis pemasukan) -->
				<Card class="p-4 sm:p-5 space-y-3">
					<div class="flex items-center justify-between gap-2 border-b-2 border-border/10 pb-2">
						<h2 class="text-sm sm:text-base font-black text-content tracking-tight">
							{basisLabel} per Kategori
						</h2>
						<span class="text-xs font-bold text-content-muted font-mono tabular-nums whitespace-nowrap">
							{formatRupiah(expenseBasis ? summary.expense : summary.income)}
						</span>
					</div>
					{#if categories.length === 0}
						<p class="text-xs text-content-muted">
							Belum ada {basisLabel.toLowerCase()} di kategori mana pun pada periode ini.
						</p>
					{:else}
						<div class="space-y-2.5">
							{#each categories as cat}
								{@const pct = Math.round(cat.share * 100)}
								<div class="space-y-1">
									<div class="flex items-center justify-between gap-2 text-xs font-bold">
										{#if cat.categoryId}
											<a
												href={txHref({ categoryId: cat.categoryId })}
												class="inline-flex items-center min-h-[44px] text-content underline decoration-border/40"
											>
												<span class="truncate">{cat.name}</span>
											</a>
										{:else}
											<span class="text-content truncate">{cat.name}</span>
										{/if}
										<span class="font-mono tabular-nums text-content-muted shrink-0 whitespace-nowrap">
											{formatRupiah(cat.total)} ({pct}%)
										</span>
									</div>
									<div class="w-full h-2 rounded-full bg-surface-muted overflow-hidden border border-border/30">
										<div
											class="h-full rounded-full transition-all duration-300 {expenseBasis ? 'bg-expense' : 'bg-income'}"
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
									<th class="py-2 pr-2 font-bold">Dompet</th>
									<th class="py-2 px-2 text-right font-bold">Masuk</th>
									<th class="py-2 px-2 text-right font-bold">Keluar</th>
									<th class="py-2 pl-2 text-right font-bold">Net</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border/10">
								{#each wallets as w}
									<tr>
										<td class="py-2 pr-2 align-top">
											<a
												href={txHref({ walletId: w.walletId, type: '' })}
												class="inline-flex items-center min-h-[44px] max-w-[140px] sm:max-w-[200px] font-bold text-content underline decoration-border/40"
											>
												<span class="truncate">{w.name}</span>
											</a>
											{#if w.transferIn > 0 || w.transferOut > 0}
												<span class="text-[11px] text-content-muted block">
													{#if w.transferIn > 0}⇄ masuk {formatRupiah(w.transferIn)}{/if}
													{#if w.transferIn > 0 && w.transferOut > 0} · {/if}
													{#if w.transferOut > 0}keluar {formatRupiah(w.transferOut)}{/if}
												</span>
											{/if}
											<span class="text-[11px] font-semibold {w.netChange >= 0 ? 'text-income' : 'text-expense'} block">
												saldo {w.netChange >= 0 ? '+' : '-'}{formatRupiah(Math.abs(w.netChange))}
											</span>
										</td>
										<td class="py-2 px-2 text-right font-mono tabular-nums text-income align-top whitespace-nowrap">+{formatRupiah(w.income)}</td>
										<td class="py-2 px-2 text-right font-mono tabular-nums text-expense align-top whitespace-nowrap">-{formatRupiah(w.expense)}</td>
										<td class="py-2 pl-2 text-right font-mono tabular-nums font-bold align-top whitespace-nowrap {w.net >= 0 ? 'text-income' : 'text-expense'}">
											{w.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(w.net))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="text-[11px] text-content-muted">
						Net = pemasukan - pengeluaran. Baris "saldo" adalah perubahan saldo dompet, termasuk transfer masuk dan keluar.
					</p>
				{/if}
			</Card>
		</div>
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
								value={filters.startDate || ''}
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
								value={filters.endDate || ''}
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
						value={urlParams.get('granularity') ?? 'auto'}
						onchange={(e) => applyFilter('granularity', e.currentTarget.value === 'auto' ? null : e.currentTarget.value)}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="auto">Otomatis ({granularityLabel})</option>
						<option value="day">Harian</option>
						<option value="week">Mingguan</option>
						<option value="month">Bulanan</option>
					</select>
					{#if filters.granularityAdjusted}
						<p class="text-[11px] text-content-muted">
							Rentang ini terlalu panjang untuk granularitas pilihan, jadi grafik memakai {granularityAdjective}.
						</p>
					{/if}
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
							<option value={w.id}>{w.name}{w.archived ? ' (arsip)' : ''}</option>
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
							<option value={c.id}>
								{c.name} ({c.kind === 'income' ? 'Masuk' : 'Keluar'}){c.archived ? ' (arsip)' : ''}
							</option>
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
