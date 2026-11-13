<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import NumericInput from '$lib/components/NumericInput.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatRupiah, formatDateIndo } from '$lib/utils';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal / form states
	let showCreateModal = $state(page.url.searchParams.get('new') === '1');
	let showFilterSheet = $state(false);
	let transactionKind = $state<'expense' | 'income' | 'transfer'>('expense');
	let editingTransaction = $state<any | null>(null);

	function handleCreateOpenChange(open: boolean) {
		showCreateModal = open;
		if (!open && page.url.searchParams.get('new') === '1') {
			goto('/transactions', { invalidateAll: false, replaceState: true });
		}
	}

	// Client-side quick helper map for wallet & category names
	const walletMap = $derived(
		new Map((data.wallets || []).map((w) => [w.id, w.name]))
	);
	const categoryMap = $derived(
		new Map((data.categories || []).map((c) => [c.id, c.name]))
	);

	const availableCategories = $derived(
		(data.categories || []).filter((c) => c.kind === transactionKind)
	);

	// Count active secondary filters (exclude default period)
	const activeFilterCount = $derived.by(() => {
		let count = 0;
		if (data.filters.type) count++;
		if (data.filters.walletId) count++;
		if (data.filters.categoryId) count++;
		if (data.filters.period === 'custom' && (data.filters.startDate || data.filters.endDate)) count++;
		return count;
	});

	// Helper to build URL without a specific filter query param
	function buildUrlWithout(key: 'type' | 'walletId' | 'categoryId' | 'customDates'): string {
		const params = new URLSearchParams();
		if (data.filters.period && data.filters.period !== 'all') {
			params.set('period', data.filters.period);
		} else if (data.filters.period === 'all') {
			params.set('period', 'all');
		}

		if (key !== 'type' && data.filters.type) {
			params.set('type', data.filters.type);
		}
		if (key !== 'walletId' && data.filters.walletId) {
			params.set('walletId', data.filters.walletId);
		}
		if (key !== 'categoryId' && data.filters.categoryId) {
			params.set('categoryId', data.filters.categoryId);
		}
		if (key !== 'customDates' && data.filters.period === 'custom') {
			if (data.filters.startDate) params.set('startDate', data.filters.startDate);
			if (data.filters.endDate) params.set('endDate', data.filters.endDate);
		}

		const q = params.toString();
		return q ? `/transactions?${q}` : '/transactions';
	}

	function buildPeriodUrl(period: string): string {
		const params = new URLSearchParams();
		params.set('period', period);
		if (data.filters.type) params.set('type', data.filters.type);
		if (data.filters.walletId) params.set('walletId', data.filters.walletId);
		if (data.filters.categoryId) params.set('categoryId', data.filters.categoryId);
		return `/transactions?${params.toString()}`;
	}

	// Map day totals by date YYYY-MM-DD
	const dayTotalsMap = $derived(
		new Map((data.dayTotals || []).map((dt) => [dt.date, dt]))
	);

	// Group transactions by date string (YYYY-MM-DD)
	interface GroupedDay {
		date: string;
		items: typeof data.transactions;
		totalNet: number;
		totalCount: number;
	}

	const groupedDays = $derived.by<GroupedDay[]>(() => {
		const groups: GroupedDay[] = [];
		const groupMap = new Map<string, typeof data.transactions>();

		for (const tx of data.transactions || []) {
			const dateKey = tx.occurredAt.slice(0, 10);
			let list = groupMap.get(dateKey);
			if (!list) {
				list = [];
				groupMap.set(dateKey, list);
			}
			list.push(tx);
		}

		for (const [dateKey, items] of groupMap.entries()) {
			const dt = dayTotalsMap.get(dateKey);
			const totalNet = dt ? dt.net : items.reduce((sum, item) => {
				if (item.type === 'income') return sum + item.amount;
				if (item.type === 'expense') return sum - item.amount;
				return sum;
			}, 0);
			const totalCount = dt ? dt.count : items.length;

			groups.push({
				date: dateKey,
				items,
				totalNet,
				totalCount
			});
		}

		return groups;
	});
</script>

<svelte:head>
	<title>Daftar Transaksi — Uangku</title>
</svelte:head>

<div class="space-y-4">
	<h1 class="sr-only">Riwayat Transaksi</h1>

	<!-- Header Subtext -->
	<div>
		<p class="text-sm font-semibold text-content-muted">
			Pantau seluruh alur kas masuk, keluar, dan transfer antar dompet Anda.
		</p>
	</div>

	<!-- Baris Periode Ringkas & Kontrol Filter -->
	<Card class="p-3">
		<div class="flex flex-wrap items-center justify-between gap-2.5">
			<!-- Navigasi Periode Bulan (‹ Bulan Tahun ›) -->
			<div class="flex items-center gap-1.5 sm:gap-2">
				{#if data.periodNav.prev}
					<a
						href={buildPeriodUrl(data.periodNav.prev)}
						class="w-10 h-10 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle flex items-center justify-center font-black text-base shadow-hard-xs transition-all focus-visible:outline-2"
						aria-label="Periode sebelumnya"
						title="Periode sebelumnya"
					>
						‹
					</a>
				{:else}
					<span
						class="w-10 h-10 rounded-md border-2 border-border/30 text-content-muted flex items-center justify-center font-black text-base opacity-40 cursor-not-allowed"
						aria-hidden="true"
					>
						‹
					</span>
				{/if}

				<span class="px-2 font-black text-sm sm:text-base text-content select-none">
					{data.filters.label}
				</span>

				{#if data.periodNav.next}
					<a
						href={buildPeriodUrl(data.periodNav.next)}
						class="w-10 h-10 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle flex items-center justify-center font-black text-base shadow-hard-xs transition-all focus-visible:outline-2"
						aria-label="Periode berikutnya"
						title="Periode berikutnya"
					>
						›
					</a>
				{:else}
					<span
						class="w-10 h-10 rounded-md border-2 border-border/30 text-content-muted flex items-center justify-center font-black text-base opacity-40 cursor-not-allowed"
						aria-hidden="true"
					>
						›
					</span>
				{/if}

				<!-- Chip Pilihan "Semua" -->
				<a
					href={buildPeriodUrl('all')}
					class="min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-md border-2 transition-all flex items-center {data.filters.period === 'all'
						? 'bg-content text-canvas border-border shadow-hard-xs'
						: 'border-border/30 hover:border-border text-content bg-surface'}"
					aria-label="Tampilkan semua periode"
				>
					Semua
				</a>
			</div>

			<!-- Tombol Buka Sheet Filter (Ponsel) / Tombol Filter -->
			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="md:hidden min-h-[40px] relative font-bold text-xs"
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

		<!-- Desktop Inline Filter Bar (md+) -->
		<div class="hidden md:block pt-3 mt-3 border-t-2 border-border/10">
			<form method="GET" action="/transactions" class="grid grid-cols-5 gap-2.5 items-end">
				<input type="hidden" name="period" value={data.filters.period} />

				<div>
					<label for="desktop-filter-type" class="block text-xs font-bold text-content-muted mb-1">Tipe</label>
					<select
						id="desktop-filter-type"
						name="type"
						value={data.filters.type}
						class="w-full min-h-[40px] px-2.5 py-1 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Tipe</option>
						<option value="expense">Pengeluaran</option>
						<option value="income">Pemasukan</option>
						<option value="transfer">Transfer</option>
					</select>
				</div>

				<div>
					<label for="desktop-filter-wallet" class="block text-xs font-bold text-content-muted mb-1">Dompet</label>
					<select
						id="desktop-filter-wallet"
						name="walletId"
						value={data.filters.walletId}
						class="w-full min-h-[40px] px-2.5 py-1 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Dompet</option>
						{#each data.wallets || [] as w}
							<option value={w.id}>{w.name}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="desktop-filter-category" class="block text-xs font-bold text-content-muted mb-1">Kategori</label>
					<select
						id="desktop-filter-category"
						name="categoryId"
						value={data.filters.categoryId}
						class="w-full min-h-[40px] px-2.5 py-1 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Kategori</option>
						{#each data.categories || [] as c}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</div>

				{#if data.filters.period === 'custom'}
					<div class="col-span-2 grid grid-cols-2 gap-2">
						<div>
							<label for="desktop-filter-start" class="block text-xs font-bold text-content-muted mb-1">Dari</label>
							<input
								type="date"
								id="desktop-filter-start"
								name="startDate"
								value={data.filters.startDate}
								class="w-full min-h-[40px] px-2 py-1 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
						<div>
							<label for="desktop-filter-end" class="block text-xs font-bold text-content-muted mb-1">Sampai</label>
							<input
								type="date"
								id="desktop-filter-end"
								name="endDate"
								value={data.filters.endDate}
								class="w-full min-h-[40px] px-2 py-1 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
					</div>
				{/if}

				<div class="flex items-center gap-2">
					<Button type="submit" variant="primary" class="w-full min-h-[40px] text-xs">
						Terapkan
					</Button>
					{#if activeFilterCount > 0}
						<a
							href={buildPeriodUrl(data.filters.period)}
							class="min-h-[40px] px-3 py-1 flex items-center justify-center rounded-md border-2 border-border bg-surface text-xs font-bold text-content hover:bg-surface-subtle"
						>
							Reset
						</a>
					{/if}
				</div>
			</form>
		</div>

		<!-- Chip Filter Aktif (Removable) -->
		{#if activeFilterCount > 0}
			<div class="flex flex-wrap items-center gap-1.5 pt-2.5 mt-2.5 border-t border-border/10">
				<span class="text-xs font-bold text-content-muted mr-1">Filter aktif:</span>

				{#if data.filters.type}
					<a
						href={buildUrlWithout('type')}
						class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter tipe {data.filters.type}"
					>
						<span>Tipe: {data.filters.type === 'income' ? 'Pemasukan' : data.filters.type === 'expense' ? 'Pengeluaran' : 'Transfer'}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				{#if data.filters.walletId && walletMap.has(data.filters.walletId)}
					<a
						href={buildUrlWithout('walletId')}
						class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter dompet {walletMap.get(data.filters.walletId)}"
					>
						<span>Dompet: {walletMap.get(data.filters.walletId)}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				{#if data.filters.categoryId && categoryMap.has(data.filters.categoryId)}
					<a
						href={buildUrlWithout('categoryId')}
						class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter kategori {categoryMap.get(data.filters.categoryId)}"
					>
						<span>Kategori: {categoryMap.get(data.filters.categoryId)}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				{#if data.filters.period === 'custom' && (data.filters.startDate || data.filters.endDate)}
					<a
						href={buildUrlWithout('customDates')}
						class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter rentang kustom"
					>
						<span>Rentang: {data.filters.startDate || '...'} s/d {data.filters.endDate || '...'}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				<a
					href={buildPeriodUrl(data.filters.period)}
					class="text-xs font-bold text-content-muted hover:text-danger underline ml-1 px-1 py-1"
				>
					Hapus Semua
				</a>
			</div>
		{/if}
	</Card>

	{#if form?.error}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs">
			{form.error}
		</div>
	{/if}

	<!-- Transactions List (Grouped by Day) -->
	{#if !data.transactions || data.transactions.length === 0}
		{#if data.hasAnyTransaction}
			<EmptyState
				title="Tidak Ada Transaksi di Periode Ini"
				description="Tidak ditemukan riwayat kas untuk filter atau periode {data.filters.label}."
				actionLabel="Lihat Semua Periode"
				actionHref="?period=all"
			/>
		{:else}
			<EmptyState
				title="Belum Ada Transaksi"
				description="Mulai catat transaksi pertama Anda untuk memantau arus kas masuk dan keluar."
				actionLabel="+ Catat Transaksi"
				onclick={() => {
					transactionKind = 'expense';
					showCreateModal = true;
				}}
			/>
		{/if}
	{:else}
		<div class="space-y-4">
			{#each groupedDays as dayGroup}
				<div class="space-y-1.5">
					<!-- Divider Harian -->
					<div class="flex items-center justify-between px-3 py-1.5 bg-surface-subtle/80 border-2 border-border/30 rounded-md">
						<div class="flex items-center gap-2">
							<span class="text-xs font-black text-content uppercase tracking-wider">
								{formatDateIndo(dayGroup.date)}
							</span>
							{#if dayGroup.items.length < dayGroup.totalCount}
								<span class="text-[11px] font-semibold text-content-muted">
									(memuat {dayGroup.items.length} dari {dayGroup.totalCount})
								</span>
							{/if}
						</div>

						<div>
							<span class="sr-only">
								Total hari ini: {dayGroup.totalNet >= 0 ? 'pemasukan bersih' : 'pengeluaran bersih'} {formatRupiah(Math.abs(dayGroup.totalNet))}
							</span>
							<span
								class="text-xs font-black font-mono tabular-nums {dayGroup.totalNet > 0
									? 'text-income'
									: dayGroup.totalNet < 0
										? 'text-danger'
										: 'text-content-muted'}"
								aria-hidden="true"
							>
								{dayGroup.totalNet > 0 ? '+' : dayGroup.totalNet < 0 ? '−' : ''}{formatRupiah(Math.abs(dayGroup.totalNet))}
							</span>
						</div>
					</div>

					<!-- Baris Transaksi Padat (min-h 44px, tanpa kartu terpisah) -->
					<div class="divide-y-2 divide-border/20 border-2 border-border rounded-md bg-surface overflow-hidden shadow-hard-xs">
						{#each dayGroup.items as tx}
							<div class="px-3 py-2 min-h-[44px] flex items-center justify-between gap-2 hover:bg-surface-subtle/50 transition-colors">
								<!-- Kiri: Badge + Catatan/Kategori + Dompet -->
								<div class="flex items-center gap-2.5 min-w-0">
									<Badge
										size="sm"
										variant={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'neutral'}
										class="shrink-0"
									>
										{tx.type === 'income' ? 'Masuk' : tx.type === 'expense' ? 'Keluar' : 'Transfer'}
									</Badge>

									<div class="min-w-0">
										<p class="text-xs sm:text-sm font-bold text-content truncate leading-tight">
											{tx.note || (tx.categoryId ? categoryMap.get(tx.categoryId) : 'Transaksi')}
										</p>
										<p class="text-[11px] text-content-muted truncate leading-tight">
											{walletMap.get(tx.walletId) || 'Dompet'}
											{#if tx.categoryId && categoryMap.has(tx.categoryId) && tx.note}
												• {categoryMap.get(tx.categoryId)}
											{/if}
										</p>
									</div>
								</div>

								<!-- Kanan: Nominal + Tombol Aksi -->
								<div class="flex items-center gap-2 shrink-0">
									<p
										class="text-xs sm:text-sm font-black font-mono tabular-nums {tx.type === 'income'
											? 'text-income'
											: tx.type === 'expense'
												? 'text-danger'
												: 'text-content'}"
									>
										{tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{formatRupiah(tx.amount)}
									</p>

									<div class="flex items-center gap-1">
										<button
											type="button"
											onclick={() => {
												editingTransaction = tx;
												showCreateModal = false;
											}}
											class="px-2 py-1 text-xs font-bold rounded border border-border bg-surface hover:bg-surface-subtle transition-all min-h-[36px] min-w-[36px]"
											aria-label="Edit transaksi"
										>
											Edit
										</button>
										<form method="POST" action="?/delete" class="inline">
											<input type="hidden" name="id" value={tx.id} />
											<button
												type="submit"
												onclick={(e) => {
													if (!confirm('Hapus transaksi ini? Saldo dompet akan disesuaikan kembali.')) e.preventDefault();
												}}
												class="px-2 py-1 text-xs font-bold rounded border border-border bg-surface text-danger hover:bg-danger/10 transition-all min-h-[36px] min-w-[36px]"
												aria-label="Hapus transaksi"
											>
												Hapus
											</button>
										</form>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Pagination / Load More cursor -->
		{#if data.hasMore && data.nextCursor}
			<div class="flex justify-center pt-4">
				<a
					href="?cursor={data.nextCursor}&period={data.filters.period}&walletId={data.filters.walletId}&categoryId={data.filters.categoryId}&type={data.filters.type}&startDate={data.filters.startDate}&endDate={data.filters.endDate}"
					class="min-h-[44px] px-6 py-2.5 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-center transition-all"
				>
					Muat Lebih Banyak
				</a>
			</div>
		{/if}
	{/if}

	<!-- Sheet Filter Modal (Ponsel) -->
	<Dialog.Root bind:open={showFilterSheet}>
		<Dialog.Content class="space-y-4 max-h-[90vh] overflow-y-auto sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title class="text-lg font-black text-content">Filter Transaksi</Dialog.Title>
			</Dialog.Header>

			<form method="GET" action="/transactions" class="space-y-4">
				<input type="hidden" name="period" value={data.filters.period} />

				<div class="space-y-1.5">
					<label for="sheet-filter-type" class="block text-sm font-bold text-content">Tipe Transaksi</label>
					<select
						id="sheet-filter-type"
						name="type"
						value={data.filters.type}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Tipe</option>
						<option value="expense">Pengeluaran</option>
						<option value="income">Pemasukan</option>
						<option value="transfer">Transfer</option>
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="sheet-filter-wallet" class="block text-sm font-bold text-content">Dompet</label>
					<select
						id="sheet-filter-wallet"
						name="walletId"
						value={data.filters.walletId}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Dompet</option>
						{#each data.wallets || [] as w}
							<option value={w.id}>{w.name}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="sheet-filter-category" class="block text-sm font-bold text-content">Kategori</label>
					<select
						id="sheet-filter-category"
						name="categoryId"
						value={data.filters.categoryId}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Kategori</option>
						{#each data.categories || [] as c}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</div>

				{#if data.filters.period === 'custom'}
					<div class="space-y-3 pt-2 border-t border-border/20">
						<p class="text-xs font-bold text-content-muted uppercase tracking-wider">Rentang Kustom</p>
						<div class="space-y-1.5">
							<label for="sheet-filter-start" class="block text-xs font-bold text-content">Dari Tanggal</label>
							<input
								type="date"
								id="sheet-filter-start"
								name="startDate"
								value={data.filters.startDate}
								class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
						<div class="space-y-1.5">
							<label for="sheet-filter-end" class="block text-xs font-bold text-content">Sampai Tanggal</label>
							<input
								type="date"
								id="sheet-filter-end"
								name="endDate"
								value={data.filters.endDate}
								class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
					</div>
				{/if}

				<div class="flex items-center justify-between gap-2 pt-3 border-t-2 border-border/10">
					<a
						href={buildPeriodUrl(data.filters.period)}
						class="min-h-[44px] px-4 py-2 text-xs font-bold rounded-md border-2 border-border bg-surface text-content hover:bg-surface-subtle flex items-center justify-center"
					>
						Reset Filter
					</a>
					<Button type="submit" variant="primary" class="min-h-[44px]">
						Terapkan Filter
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Modal Tambah Transaksi -->
	<Dialog.Root open={showCreateModal} onOpenChange={handleCreateOpenChange}>
		<Dialog.Content class="space-y-4 max-h-[90vh] overflow-y-auto sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title class="text-lg font-black text-content">Catat Transaksi Baru</Dialog.Title>
			</Dialog.Header>

			<!-- Jenis Transaksi Tabs -->
			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					onclick={() => (transactionKind = 'expense')}
					class="py-2 px-3 text-xs font-bold rounded-md border-2 min-h-[44px] transition-all {transactionKind ===
					'expense'
						? 'bg-expense text-white border-border shadow-hard-xs'
						: 'border-border/30 hover:border-border text-content'}"
				>
					Pengeluaran
				</button>
				<button
					type="button"
					onclick={() => (transactionKind = 'income')}
					class="py-2 px-3 text-xs font-bold rounded-md border-2 min-h-[44px] transition-all {transactionKind ===
					'income'
						? 'bg-income text-white border-border shadow-hard-xs'
						: 'border-border/30 hover:border-border text-content'}"
				>
					Pemasukan
				</button>
				<button
					type="button"
					onclick={() => (transactionKind = 'transfer')}
					class="py-2 px-3 text-xs font-bold rounded-md border-2 min-h-[44px] transition-all {transactionKind ===
					'transfer'
						? 'bg-content text-canvas border-border shadow-hard-xs'
						: 'border-border/30 hover:border-border text-content'}"
				>
					Transfer
				</button>
			</div>

			<form method="POST" action="?/create" class="space-y-4">
				<input type="hidden" name="formKind" value={transactionKind === 'transfer' ? 'transfer' : 'transaction'} />
				<input type="hidden" name="type" value={transactionKind} />

				<!-- Nominal dengan live format Rupiah -->
				<NumericInput
					name="amount"
					label="Nominal Transaksi"
					placeholder="0"
					required
				/>

				{#if transactionKind === 'transfer'}
					<div class="space-y-1.5">
						<label for="from-wallet" class="block text-sm font-bold text-content">Dari Dompet Asal</label>
						<select
							id="from-wallet"
							name="fromWalletId"
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							<option value="" disabled selected>Pilih dompet asal...</option>
							{#each data.wallets || [] as w}
								<option value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="to-wallet" class="block text-sm font-bold text-content">Ke Dompet Tujuan</label>
						<select
							id="to-wallet"
							name="toWalletId"
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							<option value="" disabled selected>Pilih dompet tujuan...</option>
							{#each data.wallets || [] as w}
								<option value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
							{/each}
						</select>
					</div>
				{:else}
					<div class="space-y-1.5">
						<label for="select-wallet" class="block text-sm font-bold text-content">Pilih Dompet</label>
						<select
							id="select-wallet"
							name="walletId"
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							<option value="" disabled selected>Pilih dompet...</option>
							{#each data.wallets || [] as w}
								<option value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="select-category" class="block text-sm font-bold text-content">Kategori</label>
						<select
							id="select-category"
							name="categoryId"
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							<option value="" disabled selected>Pilih kategori...</option>
							{#each availableCategories as c}
								<option value={c.id}>{c.name}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="space-y-1.5">
					<label for="tx-date" class="block text-sm font-bold text-content">Tanggal</label>
					<input
						type="date"
						id="tx-date"
						name="date"
						value={new Date().toISOString().slice(0, 10)}
						required
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
					/>
				</div>

				<Input
					name="note"
					label="Catatan (Opsional)"
					placeholder="Contoh: Makan siang nasi padang"
				/>

				<div class="flex items-center justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						onclick={() => (showCreateModal = false)}
					>
						Batal
					</Button>
					<Button type="submit" variant="primary">
						Simpan Transaksi
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Modal Edit Transaksi -->
	<Dialog.Root open={editingTransaction !== null} onOpenChange={(open) => { if (!open) editingTransaction = null; }}>
		<Dialog.Content class="space-y-4 max-h-[90vh] overflow-y-auto sm:max-w-md">
			{#if editingTransaction}
				<Dialog.Header>
					<Dialog.Title class="text-lg font-black text-content">Edit Transaksi</Dialog.Title>
				</Dialog.Header>

				<form method="POST" action="?/update" class="space-y-4">
					<input type="hidden" name="id" value={editingTransaction.id} />
					<input type="hidden" name="type" value={editingTransaction.type} />

					<NumericInput
						name="amount"
						label="Nominal Transaksi"
						value={editingTransaction.amount}
						required
					/>

					<div class="space-y-1.5">
						<label for="edit-tx-wallet" class="block text-sm font-bold text-content">Pilih Dompet</label>
						<select
							id="edit-tx-wallet"
							name="walletId"
							value={editingTransaction.walletId}
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							{#each data.wallets || [] as w}
								<option value={w.id}>{w.name} ({formatRupiah(w.balance)})</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="edit-tx-category" class="block text-sm font-bold text-content">Kategori</label>
						<select
							id="edit-tx-category"
							name="categoryId"
							value={editingTransaction.categoryId}
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							{#each data.categories || [] as c}
								<option value={c.id}>{c.name}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="edit-tx-date" class="block text-sm font-bold text-content">Tanggal</label>
						<input
							type="date"
							id="edit-tx-date"
							name="date"
							value={editingTransaction.occurredAt ? editingTransaction.occurredAt.slice(0, 10) : ''}
							required
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						/>
					</div>

					<Input
						name="note"
						label="Catatan (Opsional)"
						value={editingTransaction.note || ''}
					/>

					<div class="flex items-center justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onclick={() => (editingTransaction = null)}
						>
							Batal
						</Button>
						<Button type="submit" variant="primary">
							Simpan Perubahan
						</Button>
					</div>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</div>
