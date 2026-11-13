<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CashflowChart from '$lib/components/CashflowChart.svelte';
	import { formatRupiah, formatDateIndo } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const filters = $derived(data.filters);
	const summary = $derived(data.summary);
	const series = $derived(data.series ?? []);
	const categories = $derived(data.categories ?? []);
	const wallets = $derived(data.wallets ?? []);
	const previous = $derived(data.previous);
	const options = $derived(data.options ?? { wallets: [], categories: [] });

	const hasData = $derived(summary.count > 0);

	// Adapt series to CashflowChart expected structure { month: string, income: number, expense: number }
	const chartData = $derived(
		series.map((s: { label?: string; bucket?: string; income: number; expense: number }) => ({
			month: s.label || s.bucket || '',
			income: s.income,
			expense: s.expense
		}))
	);

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

<div class="space-y-6">
	<h1 class="sr-only">Analisis & Laporan</h1>

	<!-- Header Page -->
	<div>
		<p class="text-sm font-semibold text-content-muted">
			Visualisasi arus kas, rasio pengeluaran per kategori, dan kinerja dompet Anda.
		</p>
	</div>

	<!-- Form Filter GET -->
	<Card class="p-4 sm:p-5">
		<form method="GET" class="space-y-4">
			<!-- Preset Rentang Waktu -->
			<div class="space-y-1.5">
				<label for="range-select" class="text-xs font-bold text-content-muted uppercase tracking-wider block">
					Rentang Waktu
				</label>
				<div class="flex flex-wrap gap-2">
					{#each [
						{ value: 'week', label: 'Minggu Ini' },
						{ value: 'month', label: 'Bulan Ini' },
						{ value: 'year', label: 'Tahun Ini' },
						{ value: 'all', label: 'Semua' },
						{ value: 'custom', label: 'Kustom' }
					] as preset}
						<button
							type="submit"
							name="range"
							value={preset.value}
							class="min-h-[44px] px-3.5 py-2 rounded-md font-bold text-xs sm:text-sm border-2 transition-all {filters.range === preset.value
								? 'bg-brand text-brand-foreground border-border shadow-hard-xs'
								: 'bg-surface hover:bg-surface-subtle border-border text-content'}"
						>
							{preset.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Filter Kustom Tanggal & Granularitas & Kategori & Dompet -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t-2 border-border/10">
				{#if filters.range === 'custom'}
					<div>
						<label for="from" class="text-xs font-bold text-content-muted block mb-1">
							Dari Tanggal
						</label>
						<input
							type="date"
							id="from"
							name="from"
							value={filters.from || ''}
							class="w-full min-h-[44px] px-3 py-2 text-sm font-mono rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content"
						/>
					</div>
					<div>
						<label for="to" class="text-xs font-bold text-content-muted block mb-1">
							Sampai Tanggal
						</label>
						<input
							type="date"
							id="to"
							name="to"
							value={filters.to || ''}
							class="w-full min-h-[44px] px-3 py-2 text-sm font-mono rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content"
						/>
					</div>
				{/if}

				<div>
					<label for="granularity" class="text-xs font-bold text-content-muted block mb-1">
						Granularitas Grafik
					</label>
					<select
						id="granularity"
						name="granularity"
						value={filters.granularity || 'day'}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content"
					>
						<option value="day">Harian</option>
						<option value="week">Mingguan</option>
						<option value="month">Bulanan</option>
					</select>
				</div>

				<div>
					<label for="type" class="text-xs font-bold text-content-muted block mb-1">
						Jenis Transaksi
					</label>
					<select
						id="type"
						name="type"
						value={filters.type || 'all'}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content"
					>
						<option value="all">Semua Jenis</option>
						<option value="income">Pemasukan Saja</option>
						<option value="expense">Pengeluaran Saja</option>
					</select>
				</div>

				<div>
					<label for="walletId" class="text-xs font-bold text-content-muted block mb-1">
						Dompet
					</label>
					<select
						id="walletId"
						name="walletId"
						value={filters.walletId || ''}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content"
					>
						<option value="">Semua Dompet</option>
						{#each options.wallets as w}
							<option value={w.id}>{w.name}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="categoryId" class="text-xs font-bold text-content-muted block mb-1">
						Kategori
					</label>
					<select
						id="categoryId"
						name="categoryId"
						value={filters.categoryId || ''}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content"
					>
						<option value="">Semua Kategori</option>
						{#each options.categories as c}
							<option value={c.id}>{c.name} ({c.kind === 'income' ? 'Masuk' : 'Keluar'})</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="flex justify-end pt-2">
				<Button type="submit" variant="primary" class="min-h-[44px]">
					Terapkan Filter
				</Button>
			</div>
		</form>
	</Card>

	{#if !hasData}
		<EmptyState
			title="Tidak ada transaksi di periode ini"
			description="Coba ubah rentang waktu filter atau catat transaksi baru untuk melihat laporan analitik."
			actionLabel="+ Catat Transaksi"
			actionHref="/transactions?new=1"
		/>
	{:else}
		<!-- Ringkasan Statistik -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			<!-- Pemasukan Total -->
			<Card class="p-5">
				<p class="text-xs font-bold text-content-muted uppercase tracking-wider mb-1">Total Pemasukan</p>
				<p class="text-2xl font-black font-mono text-income tabular-nums">
					+{formatRupiah(summary.income)}
				</p>
				<p class="text-xs text-content-muted mt-2 font-medium">Periode aktif</p>
			</Card>

			<!-- Pengeluaran Total -->
			<Card class="p-5">
				<p class="text-xs font-bold text-content-muted uppercase tracking-wider mb-1">Total Pengeluaran</p>
				<p class="text-2xl font-black font-mono text-danger tabular-nums">
					-{formatRupiah(summary.expense)}
				</p>
				<p class="text-xs text-content-muted mt-2 font-medium">Periode aktif</p>
			</Card>

			<!-- Net Cashflow & Bandingkan Periode Lalu -->
			<Card class="p-5">
				<p class="text-xs font-bold text-content-muted uppercase tracking-wider mb-1">Selisih Bersih (Net)</p>
				<p class="text-2xl font-black font-mono tabular-nums {summary.net >= 0 ? 'text-brand' : 'text-danger'}">
					{summary.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(summary.net))}
				</p>
				{#if netDiff}
					<p class="text-xs font-bold mt-2 flex items-center gap-1 {netDiff.isPositive ? 'text-income' : 'text-danger'}">
						<span aria-hidden="true">{netDiff.isPositive ? '▲ Naik' : '▼ Turun'}</span>
						<span>{netDiff.label} dibanding periode lalu</span>
					</p>
				{:else}
					<p class="text-xs text-content-muted mt-2 font-medium">Data periode lalu tidak tersedia</p>
				{/if}
			</Card>

			<!-- Jumlah Transaksi -->
			<Card class="p-4 sm:p-5">
				<p class="text-xs font-bold text-content-muted uppercase tracking-wider mb-1">Total Transaksi</p>
				<p class="text-xl font-black font-mono text-content tabular-nums">
					{summary.count} transaksi
				</p>
			</Card>

			<!-- Rata-rata per Hari -->
			<Card class="p-4 sm:p-5">
				<p class="text-xs font-bold text-content-muted uppercase tracking-wider mb-1">Rata-rata Pengeluaran / Hari</p>
				<p class="text-xl font-black font-mono text-content tabular-nums">
					{formatRupiah(summary.avgPerDay ?? 0)}
				</p>
			</Card>

			<!-- Transaksi Terbesar -->
			<Card class="p-4 sm:p-5">
				<p class="text-xs font-bold text-content-muted uppercase tracking-wider mb-1">Transaksi Terbesar</p>
				{#if summary.largest}
					<p class="text-xl font-black font-mono text-content tabular-nums">
						{formatRupiah(summary.largest.amount)}
					</p>
					<p class="text-xs text-content-muted truncate mt-1">
						{summary.largest.note || summary.largest.categoryName || 'Tanpa catatan'}
					</p>
				{:else}
					<p class="text-sm font-semibold text-content-muted mt-1">-</p>
				{/if}
			</Card>
		</div>

		<!-- Grafik Arus Kas -->
		<Card class="p-6">
			<div class="flex items-center justify-between mb-4">
				<div>
					<h2 class="text-base font-black text-content tracking-tight">Tren Arus Kas</h2>
					<p class="text-xs font-semibold text-content-muted">Pemasukan vs Pengeluaran per bucket {filters.granularity || 'harian'}</p>
				</div>
			</div>
			<CashflowChart data={chartData} height={200} />
		</Card>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Komposisi per Kategori -->
			<Card class="p-6 space-y-4">
				<h2 class="text-base font-black text-content tracking-tight border-b-2 border-border/10 pb-2">
					Pengeluaran per Kategori
				</h2>
				{#if categories.length === 0}
					<p class="text-xs text-content-muted">Belum ada pengeluaran di kategori mana pun.</p>
				{:else}
					<div class="space-y-3">
						{#each categories as cat}
							{@const pct = Math.round(cat.share * 100)}
							<div class="space-y-1">
								<div class="flex items-center justify-between text-xs font-bold">
									<span class="text-content truncate">{cat.name}</span>
									<span class="font-mono tabular-nums text-content-muted">{formatRupiah(cat.total)} ({pct}%)</span>
								</div>
								<div class="w-full h-2.5 rounded-full bg-surface-muted overflow-hidden border border-border/30">
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

			<!-- Rincian Arus Kas per Dompet -->
			<Card class="p-6 space-y-4">
				<h2 class="text-base font-black text-content tracking-tight border-b-2 border-border/10 pb-2">
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
										<td class="py-2.5 font-bold text-content truncate max-w-[120px]">{w.name}</td>
										<td class="py-2.5 text-right font-mono tabular-nums text-income">+{formatRupiah(w.income)}</td>
										<td class="py-2.5 text-right font-mono tabular-nums text-danger">-{formatRupiah(w.expense)}</td>
										<td class="py-2.5 text-right font-mono tabular-nums font-bold {w.net >= 0 ? 'text-brand' : 'text-danger'}">
											{w.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(w.net))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>
		</div>
	{/if}
</div>
