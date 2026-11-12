<script lang="ts">
	import Card from '../lib/components/Card.svelte';
	import Button from '../lib/components/Button.svelte';
	import Badge from '../lib/components/Badge.svelte';
	import EmptyState from '../lib/components/EmptyState.svelte';
	import { formatRupiah, formatDateIndo } from '../lib/utils';

	// Initial reactive state: starts at 0 for fresh user
	let totalSaldo = $state(0);
	let totalIncome = $state(0);
	let totalExpense = $state(0);

	// Empty array by default (in production, users start from scratch)
	interface WalletItem {
		id: string;
		name: string;
		type: string;
		balance: number;
	}

	interface TransactionItem {
		id: string;
		title: string;
		category: string;
		amount: number;
		type: 'income' | 'expense' | 'transfer';
		date: string;
		walletName: string;
	}

	let wallets = $state<WalletItem[]>([]);
	let recentTransactions = $state<TransactionItem[]>([]);
</script>

<svelte:head>
	<title>Dasbor — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<!-- Hero: Total Saldo Bersih -->
	<Card variant="brand" shadow="lg" class="p-6">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<p class="text-xs font-bold uppercase tracking-wider text-neutral-900/80 mb-1">
					Total Saldo Bersih
				</p>
				<h1 class="text-3xl sm:text-4xl font-black font-mono tracking-tight tabular-nums text-neutral-900">
					{formatRupiah(totalSaldo)}
				</h1>
			</div>
			<div class="flex items-center gap-2">
				<a
					href="/transactions/new"
					class="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-md border-2 border-border bg-surface text-content font-bold text-sm shadow-hard-sm hover:bg-surface-subtle active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
				>
					+ Transaksi Baru
				</a>
			</div>
		</div>

		<!-- Income & Expense Summary Columns -->
		<div class="grid grid-cols-2 gap-3 mt-6 pt-5 border-t-2 border-border/20">
			<div>
				<p class="text-xs font-bold text-neutral-900/80 mb-0.5">Pemasukan Bulan Ini</p>
				<p class="text-lg sm:text-xl font-bold font-mono tabular-nums text-neutral-900">
					+{formatRupiah(totalIncome)}
				</p>
			</div>
			<div>
				<p class="text-xs font-bold text-neutral-900/80 mb-0.5">Pengeluaran Bulan Ini</p>
				<p class="text-lg sm:text-xl font-bold font-mono tabular-nums text-neutral-900">
					-{formatRupiah(totalExpense)}
				</p>
			</div>
		</div>
	</Card>

	<!-- Dompet Saya -->
	<section aria-labelledby="heading-wallets" class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 id="heading-wallets" class="text-lg font-black tracking-tight text-content">
				Dompet Saya
			</h2>
			<a
				href="/wallets/new"
				class="text-xs font-bold text-content hover:underline inline-flex items-center min-h-[44px] px-2"
			>
				+ Tambah Dompet
			</a>
		</div>

		{#if wallets.length === 0}
			<EmptyState
				title="Belum ada dompet"
				description="Tambahkan rekening bank, dompet digital, atau uang tunai untuk mulai mengelola saldo."
				actionLabel="+ Buat Dompet Pertama"
				actionHref="/wallets/new"
			/>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{#each wallets as wallet}
					<div class="p-4 rounded-lg border-2 border-border bg-surface shadow-hard-sm flex items-center justify-between">
						<div>
							<p class="text-sm font-bold text-content">{wallet.name}</p>
							<span class="text-xs text-content-muted capitalize">{wallet.type}</span>
						</div>
						<p class="text-base font-bold font-mono tabular-nums text-content">
							{formatRupiah(wallet.balance)}
						</p>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Transaksi Terakhir -->
	<section aria-labelledby="heading-transactions" class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 id="heading-transactions" class="text-lg font-black tracking-tight text-content">
				Transaksi Terakhir
			</h2>
			{#if recentTransactions.length > 0}
				<a
					href="/transactions"
					class="text-xs font-bold text-content hover:underline inline-flex items-center min-h-[44px] px-2"
				>
					Lihat Semua
				</a>
			{/if}
		</div>

		{#if recentTransactions.length === 0}
			<EmptyState
				title="Belum ada transaksi"
				description="Catat pengeluaran harian atau pemasukan Anda agar kondisi finansial tetap terpantau rapi."
				actionLabel="+ Catat Transaksi"
				actionHref="/transactions/new"
			/>
		{:else}
			<div class="space-y-2">
				{#each recentTransactions as tx}
					<div class="p-3.5 rounded-lg border-2 border-border bg-surface shadow-hard-sm flex items-center justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1">
								<Badge variant={tx.type}>{tx.category}</Badge>
								<span class="text-xs text-content-muted">{formatDateIndo(tx.date)}</span>
							</div>
							<p class="text-sm font-bold text-content truncate">{tx.title}</p>
							<p class="text-xs text-content-muted">{tx.walletName}</p>
						</div>
						<div class="text-right shrink-0">
							<p class="text-base font-bold font-mono tabular-nums {tx.type === 'income' ? 'text-income' : 'text-expense'}">
								{tx.type === 'income' ? '+' : '-'}{formatRupiah(tx.amount)}
							</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
