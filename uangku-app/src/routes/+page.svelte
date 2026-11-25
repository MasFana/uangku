<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CashflowChart from '$lib/components/CashflowChart.svelte';
	import { formatRupiah, formatDateIndo } from '$lib/utils';
	import { monthKeyShortLabel } from '$lib/shared/dates';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { deriveDashboard } from '$lib/client/derive';

	// Whole dashboard renders from the local IndexedDB snapshot (no route load, no fetch).
	const summary = $derived(
		deriveDashboard(syncEngine.transactions, syncEngine.wallets, syncEngine.categories)
	);
	/** Tren dari derivasi berkunci `YYYY-MM`; grafik menerima label sumbu ringkas + kunci periode. */
	const trendData = $derived(
		(summary.sixMonthTrend ?? []).map((row) => ({
			month: monthKeyShortLabel(row.month),
			bucket: row.month,
			income: row.income,
			expense: row.expense
		}))
	);
	const wallets = $derived(summary.wallets);
	const totalBalance = $derived(summary.totalBalance);
	const hasWallets = $derived(wallets.length > 0);
	const hasTransactions = $derived(summary.recentTransactions.length > 0);
	const hasBreakdown = $derived(summary.categoryBreakdown.length > 0);

	const totalExpense = $derived(
		summary.categoryBreakdown.reduce((sum, c) => sum + c.total, 0)
	);

	const walletMap = $derived(
		new Map(wallets.map((w) => [w.id, w.name]))
	);
</script>

<svelte:head>
	<title>Dasbor — Uangku</title>
</svelte:head>

<div class="space-y-3">
	{#if !syncEngine.ready}
		<div class="space-y-3" aria-busy="true" aria-live="polite">
			<span class="sr-only">Memuat data tersimpan…</span>
			<div class="h-28 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			<div class="h-44 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
				<div class="h-32 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
				<div class="lg:col-span-2 h-32 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
			</div>
			<div class="h-24 rounded-lg border-2 border-border bg-surface-muted animate-pulse"></div>
		</div>
	{:else}
	<!-- Hero: Total Saldo Bersih -->
	<Card variant="brand" shadow="lg" class="p-3 sm:p-4">
		<div class="flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-brand-foreground/90 leading-tight">
					Total Saldo Bersih
				</p>
				<h1 class="text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums text-brand-foreground truncate mt-0.5">
					{formatRupiah(totalBalance)}
				</h1>
			</div>
			<div class="shrink-0">
				<a
					href="/transactions?new=1"
					class="inline-flex items-center justify-center min-h-[44px] px-3.5 py-2 rounded-md border-2 border-border bg-surface text-content font-bold text-xs sm:text-sm shadow-hard-sm hover:bg-surface-subtle active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
				>
					+ Transaksi Baru
				</a>
			</div>
		</div>

		<!-- Monthly Cashflow -->
		<div class="grid grid-cols-2 gap-2 sm:gap-3 mt-3 pt-2.5 sm:pt-3 border-t-2 border-border/20">
			<div>
				<p class="text-[11px] sm:text-xs font-bold text-brand-foreground/90 leading-tight">Pemasukan Bulan Ini</p>
				<p class="text-sm sm:text-base font-bold font-mono tabular-nums text-brand-foreground leading-tight mt-0.5 whitespace-nowrap">
					+{formatRupiah(summary.currentMonth?.income ?? 0)}
				</p>
			</div>
			<div>
				<p class="text-[11px] sm:text-xs font-bold text-brand-foreground/90 leading-tight">Pengeluaran Bulan Ini</p>
				<p class="text-sm sm:text-base font-bold font-mono tabular-nums text-brand-foreground leading-tight mt-0.5 whitespace-nowrap">
					-{formatRupiah(summary.currentMonth?.expense ?? 0)}
				</p>
			</div>
		</div>
	</Card>

	<!-- Grafik Tren 6 Bulan (Custom SVG) -->
	<Card class="p-3 sm:p-4">
		<div class="flex items-center justify-between mb-2">
			<div>
				<h2 class="text-sm sm:text-base font-black text-content tracking-tight">Tren Arus Kas 6 Bulan</h2>
			</div>
			<a
				href="/analytics"
				class="text-xs font-bold text-content hover:underline inline-flex items-center min-h-[44px] px-2"
			>
				Lihat Analisis Detail →
			</a>
		</div>

		<CashflowChart data={trendData} height={140} granularity="month" />
	</Card>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
		<!-- Dompet Saya -->
		<div class="lg:col-span-1 space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-black tracking-tight text-content">
					Dompet ({wallets.length})
				</h2>
				<a
					href="/wallets"
					class="text-xs font-bold text-content hover:underline inline-flex items-center min-h-[44px] px-2"
				>
					Kelola
				</a>
			</div>

			{#if !hasWallets}
				<EmptyState
					title="Belum ada dompet"
					description="Tambahkan dompet pertama untuk mulai mengelola saldo."
					actionLabel="+ Buat Dompet"
					actionHref="/wallets"
				/>
			{:else}
				<div class="space-y-2">
					{#each wallets as wallet}
						<div class="p-3 rounded-lg border-2 border-border bg-surface shadow-hard-xs flex items-center justify-between">
							<div>
								<p class="text-sm font-bold text-content">{wallet.name}</p>
								<span class="text-xs text-content-muted capitalize">{wallet.type}</span>
							</div>
							<p class="text-sm font-bold font-mono tabular-nums text-content whitespace-nowrap">
								{formatRupiah(wallet.currentBalance ?? 0)}
							</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Breakdown Kategori Pengeluaran -->
		<div class="lg:col-span-2 space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="text-base font-black tracking-tight text-content">
					Pengeluaran per Kategori
				</h2>
				<a
					href="/categories"
					class="text-xs font-bold text-content hover:underline inline-flex items-center min-h-[44px] px-2"
				>
					Lihat Kategori
				</a>
			</div>

			{#if !hasBreakdown}
				<EmptyState
					title="Belum ada pengeluaran"
					description="Catat pengeluaran bulan ini untuk melihat komposisi belanja Anda."
					actionLabel="+ Catat Transaksi"
					actionHref="/transactions"
				/>
			{:else}
				<Card class="p-3 space-y-2.5">
					{#each summary.categoryBreakdown as cat}
						{@const percentage = totalExpense > 0 ? Math.round((cat.total / totalExpense) * 100) : 0}
						<div class="space-y-1">
							<div class="flex items-center justify-between text-xs font-bold">
								<span class="text-content truncate">{cat.categoryName}</span>
								<span class="font-mono tabular-nums text-content whitespace-nowrap">
									{formatRupiah(cat.total)} ({percentage}%)
								</span>
							</div>
							<!-- Progress bar brutalist -->
							<div class="w-full h-2 rounded-full border border-border bg-surface-subtle overflow-hidden">
								<div
									class="h-full bg-expense"
									style="width: {Math.min(percentage, 100)}%;"
								></div>
							</div>
						</div>
					{/each}
				</Card>
			{/if}
		</div>
	</div>

	<!-- 10 Transaksi Terakhir -->
	<section aria-labelledby="heading-dashboard-tx" class="space-y-2">
		<div class="flex items-center justify-between">
			<h2 id="heading-dashboard-tx" class="text-base sm:text-lg font-black tracking-tight text-content">
				Transaksi Terakhir
			</h2>
			{#if hasTransactions}
				<a
					href="/transactions"
					class="text-xs font-bold text-content hover:underline inline-flex items-center min-h-[44px] px-2"
				>
					Lihat Semua Transaksi →
				</a>
			{/if}
		</div>

		{#if !hasTransactions}
			<EmptyState
				title="Belum ada transaksi"
				description="Catat pengeluaran harian atau pemasukan Anda agar kondisi finansial tetap terpantau rapi."
				actionLabel="+ Catat Transaksi Baru"
				actionHref="/transactions?new=1"
			/>
		{:else}
			<div class="space-y-2">
				{#each summary.recentTransactions as tx}
					<div class="p-3 rounded-lg border-2 border-border bg-surface shadow-hard-xs flex items-center justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1 mb-0.5">
								<Badge variant={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'neutral'}>
									{tx.type === 'income' ? 'Pemasukan' : tx.type === 'expense' ? 'Pengeluaran' : 'Transfer'}
								</Badge>
								<span class="text-xs text-content-muted whitespace-nowrap">{formatDateIndo(tx.occurredAt)}</span>
							</div>
							<p class="text-sm font-bold text-content truncate">{tx.note || 'Transaksi'}</p>
							<p class="text-xs text-content-muted">{walletMap.get(tx.walletId) || 'Dompet'}</p>
						</div>
						<div class="text-right shrink-0">
							<p class="text-base font-bold font-mono tabular-nums whitespace-nowrap {tx.type === 'income' ? 'text-income' : tx.type === 'expense' ? 'text-expense' : 'text-content'}">
								{tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatRupiah(tx.amount)}
							</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
	{/if}
</div>
