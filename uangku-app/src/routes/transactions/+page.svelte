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
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { currentUrl } from '$lib/client/url-state';
	import { deriveWalletBalances } from '$lib/client/derive/balances';
	import { filterTransactions, resolvePeriodBounds } from '$lib/client/derive/filters';
	import type { TransactionDTO } from '$lib/shared/sync-contract';

	// Rendered entirely from IndexedDB via the frozen sync engine — no server load.

	// Modal / form states
	let showCreateModal = $state(currentUrl().searchParams.get('new') === '1');
	let showFilterSheet = $state(false);
	// Sheet-only state: the sheet is a draft until "Terapkan Filter" writes the URL.
	let sheetPeriod = $state('');
	let sheetType = $state('');
	let sheetWalletId = $state('');
	let sheetCategoryId = $state('');
	let sheetStartDate = $state('');
	let sheetEndDate = $state('');
	let transactionKind = $state<'expense' | 'income' | 'transfer'>('expense');
	let editingTransaction = $state<any | null>(null);

	// ---- URL-backed filter state (deep-linkable, no server load) ----
	// `currentUrl()` also sees shallow navigations; `page.url` does not.
	const urlParams = $derived(currentUrl().searchParams);
	const filter = $derived({
		period: urlParams.get('period'),
		startDate: urlParams.get('startDate'),
		endDate: urlParams.get('endDate'),
		type: sanitizeType(urlParams.get('type')),
		walletId: urlParams.get('walletId'),
		categoryId: urlParams.get('categoryId'),
		search: urlParams.get('search')
	});
	const pageNum = $derived(Math.max(parseInt(urlParams.get('page') || '1', 10) || 1, 1));
	const pageSize = $derived(
		Math.min(Math.max(parseInt(urlParams.get('pageSize') || '20', 10) || 20, 1), 100)
	);

	function sanitizeType(value: string | null): 'income' | 'expense' | 'transfer' | null {
		return value === 'income' || value === 'expense' || value === 'transfer' ? value : null;
	}

	const userId = $derived(page.data.user?.id ?? null);
	const canWrite = $derived(syncEngine.ready && syncEngine.getLocalLedger() !== null);

	let errorMessage = $state<string | null>(null);

	// <input type="date"> yields YYYY-MM-DD; the ledger stores ISO UTC midnight.
	const occurredAtFrom = (date: string): string =>
		/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : date;

	async function refresh() {
		await syncEngine.reloadLocalData();
		void syncEngine.triggerSync();
	}

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		const ledger = syncEngine.getLocalLedger();
		const uid = userId;
		if (!ledger || !uid) return;
		const formEl = e.currentTarget as HTMLFormElement;
		const fd = new FormData(formEl);
		const amount = Math.trunc(Math.abs(parseInt(String(fd.get('amount') ?? '0'), 10) || 0));
		const date = String(fd.get('date') ?? '') || new Date().toISOString().slice(0, 10);
		const note = String(fd.get('note') ?? '').trim() || null;
		const occurredAt = occurredAtFrom(date);
		try {
			if (transactionKind === 'transfer') {
				const walletId = String(fd.get('fromWalletId') ?? '');
				const transferWalletId = String(fd.get('toWalletId') ?? '');
				if (!walletId || !transferWalletId || !amount) return;
				await ledger.createTransaction(uid, {
					walletId,
					transferWalletId,
					type: 'transfer',
					amount,
					note,
					occurredAt
				});
			} else {
				const walletId = String(fd.get('walletId') ?? '');
				const categoryId = String(fd.get('categoryId') ?? '') || null;
				if (!walletId || !amount) return;
				await ledger.createTransaction(uid, {
					walletId,
					categoryId,
					type: transactionKind,
					amount,
					note,
					occurredAt
				});
			}
			errorMessage = null;
			showCreateModal = false;
			formEl.reset();
			await refresh();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal mencatat transaksi';
		}
	}

	async function handleUpdate(e: SubmitEvent) {
		e.preventDefault();
		const ledger = syncEngine.getLocalLedger();
		const uid = userId;
		const tx = editingTransaction as TransactionDTO | null;
		if (!ledger || !uid || !tx) return;
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		const amount = Math.trunc(Math.abs(parseInt(String(fd.get('amount') ?? '0'), 10) || 0));
		const date = String(fd.get('date') ?? '') || tx.occurredAt.slice(0, 10);
		const note = String(fd.get('note') ?? '').trim() || null;
		try {
			await ledger.updateTransaction(uid, tx.id, {
				walletId: String(fd.get('walletId') ?? '') || tx.walletId,
				categoryId: String(fd.get('categoryId') ?? '') || null,
				amount,
				note,
				occurredAt: occurredAtFrom(date)
			});
			errorMessage = null;
			editingTransaction = null;
			await refresh();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal memperbarui transaksi';
		}
	}

	async function handleDelete(tx: TransactionDTO) {
		if (!confirm('Hapus transaksi ini? Saldo dompet akan disesuaikan kembali.')) return;
		const ledger = syncEngine.getLocalLedger();
		const uid = userId;
		if (!ledger || !uid) return;
		try {
			await ledger.deleteTransaction(uid, tx.id);
			errorMessage = null;
			await refresh();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Gagal menghapus transaksi';
		}
	}

	const isMonthPeriod = (p: string | null) => p !== null && /^\d{4}-\d{2}$/.test(p);
	function openFilterSheet() {
		sheetPeriod = filter.period ?? '';
		sheetType = filter.type ?? '';
		sheetWalletId = filter.walletId ?? '';
		sheetCategoryId = filter.categoryId ?? '';
		sheetStartDate = filter.startDate ?? '';
		sheetEndDate = filter.endDate ?? '';
		showFilterSheet = true;
	}

	function applyFilters(e: SubmitEvent) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		const params = new URLSearchParams();
		for (const key of ['period', 'type', 'walletId', 'categoryId', 'startDate', 'endDate']) {
			const value = String(fd.get(key) ?? '').trim();
			if (value) params.set(key, value);
		}
		showFilterSheet = false;
		goto(params.toString() ? `/transactions?${params}` : '/transactions', {
			shallow: true,
			reset: false
		});
	}

	function handleCreateOpenChange(open: boolean) {
		showCreateModal = open;
		if (!open && currentUrl().searchParams.get('new') === '1') {
			const params = new URLSearchParams(currentUrl().searchParams.toString());
			params.delete('new');
			const q = params.toString();
			goto(q ? `/transactions?${q}` : '/transactions', {
				shallow: true,
				reset: false,
				replace: true
			});
		}
	}

	$effect(() => {
		if (currentUrl().searchParams.get('new') === '1') {
			showCreateModal = true;
		}
	});

	// Client-side maps and lists come from the frozen sync store, never the server.
	const walletMap = $derived(new Map(syncEngine.wallets.map((w) => [w.id, w.name])));
	const categoryMap = $derived(new Map(syncEngine.categories.map((c) => [c.id, c.name])));
	const activeWallets = $derived(
		syncEngine.wallets.filter((w) => !w.archived && w.deletedAt == null)
	);
	const activeCategories = $derived(
		syncEngine.categories.filter((c) => !c.archived && c.deletedAt == null)
	);
	const walletBalances = $derived(deriveWalletBalances(activeWallets, syncEngine.transactions));
	const availableCategories = $derived(
		activeCategories.filter((c) => c.kind === transactionKind)
	);

	const periodView = $derived(resolvePeriodView(filter.period, filter.startDate, filter.endDate));

	// Count active secondary filters (exclude default period)
	const activeFilterCount = $derived.by(() => {
		let count = 0;
		if (filter.type) count++;
		if (filter.walletId) count++;
		if (filter.categoryId) count++;
		if (filter.period === 'custom' && (filter.startDate || filter.endDate)) count++;
		return count;
	});

	// Helper to build a /transactions URL keeping the current filters, minus one param.
	function buildUrlWithout(key: 'type' | 'walletId' | 'categoryId' | 'customDates'): string {
		const params = new URLSearchParams();
		if (filter.period) params.set('period', filter.period);
		if (key !== 'type' && filter.type) params.set('type', filter.type);
		if (key !== 'walletId' && filter.walletId) params.set('walletId', filter.walletId);
		if (key !== 'categoryId' && filter.categoryId) params.set('categoryId', filter.categoryId);
		if (key !== 'customDates' && filter.period === 'custom') {
			if (filter.startDate) params.set('startDate', filter.startDate);
			if (filter.endDate) params.set('endDate', filter.endDate);
		}
		const q = params.toString();
		return q ? `/transactions?${q}` : '/transactions';
	}

	function buildPeriodUrl(period: string): string {
		const params = new URLSearchParams();
		params.set('period', period);
		if (filter.type) params.set('type', filter.type);
		if (filter.walletId) params.set('walletId', filter.walletId);
		if (filter.categoryId) params.set('categoryId', filter.categoryId);
		return `/transactions?${params.toString()}`;
	}

	// "Load more" is pure client pagination: bump the URL's page, no fetch.
	function loadMoreUrl(): string {
		const params = new URLSearchParams();
		if (filter.period) params.set('period', filter.period);
		if (filter.type) params.set('type', filter.type);
		if (filter.walletId) params.set('walletId', filter.walletId);
		if (filter.categoryId) params.set('categoryId', filter.categoryId);
		if (filter.period === 'custom') {
			if (filter.startDate) params.set('startDate', filter.startDate);
			if (filter.endDate) params.set('endDate', filter.endDate);
		}
		params.set('page', String(pageNum + 1));
		if (pageSize !== 20) params.set('pageSize', String(pageSize));
		return `/transactions?${params.toString()}`;
	}

	// ponytail: label/nav twin of `$lib/server/period.ts`; SvelteKit blocks
	// `$lib/server/*` on the client. Bounds come from derive's `resolvePeriodBounds`.
	const INDO_MONTH_FULL = [
		'Januari',
		'Februari',
		'Maret',
		'April',
		'Mei',
		'Juni',
		'Juli',
		'Agustus',
		'September',
		'Oktober',
		'November',
		'Desember'
	];
	const INDO_MONTH_SHORT = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'Mei',
		'Jun',
		'Jul',
		'Agu',
		'Sep',
		'Okt',
		'Nov',
		'Des'
	];

	const pad2 = (n: number) => String(n).padStart(2, '0');

	function formatCustomRangeLabel(startIso: string, endIso: string): string {
		const [sy, sm, sd] = startIso.split('-').map(Number);
		const [ey, em, ed] = endIso.split('-').map(Number);
		const start = `${sd} ${INDO_MONTH_SHORT[sm - 1] ?? ''}`;
		const end = `${ed} ${INDO_MONTH_SHORT[em - 1] ?? ''}`;
		return sy === ey ? `${start} – ${end} ${ey}` : `${start} ${sy} – ${end} ${ey}`;
	}

	function resolvePeriodView(
		periodParam: string | null,
		startDate: string | null,
		endDate: string | null
	): {
		period: string;
		startDate: string;
		endDate: string;
		label: string;
		prev: string | null;
		next: string | null;
	} {
		const bounds = resolvePeriodBounds(periodParam, startDate, endDate);
		if (bounds.period === 'all') {
			return { ...bounds, label: 'Semua', prev: null, next: null };
		}
		if (bounds.period === 'custom') {
			return {
				...bounds,
				label: formatCustomRangeLabel(bounds.startDate, bounds.endDate),
				prev: null,
				next: null
			};
		}
		const [year, month] = bounds.period.split('-').map(Number);
		const now = new Date();
		const nowYm = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
		const label = `${INDO_MONTH_FULL[month - 1] ?? ''} ${year}`;
		const prev = month === 1 ? `${year - 1}-12` : `${year}-${pad2(month - 1)}`;
		const next = month === 12 ? `${year + 1}-01` : `${year}-${pad2(month + 1)}`;
		const isCurrent = bounds.period === nowYm;
		const isFuture = bounds.period > nowYm;
		return { ...bounds, label, prev, next: isCurrent || isFuture ? null : next };
	}

	// Filtered + paged list straight from the frozen derive module.
	const firstPage = $derived(
		filterTransactions(syncEngine.transactions, { ...filter, page: 1, pageSize })
	);
	const loadedItems = $derived.by(() => {
		const out: TransactionDTO[] = [...firstPage.items];
		for (let p = 2; p <= pageNum; p++) {
			out.push(
				...filterTransactions(syncEngine.transactions, { ...filter, page: p, pageSize }).items
			);
		}
		return out;
	});
	const hasMore = $derived(loadedItems.length < firstPage.total);

	// Group loaded transactions by date string (YYYY-MM-DD)
	interface GroupedDay {
		date: string;
		items: TransactionDTO[];
		totalNet: number;
		totalCount: number;
	}

	const groupedDays = $derived.by<GroupedDay[]>(() => {
		const groupMap = new Map<string, TransactionDTO[]>();

		for (const tx of loadedItems) {
			const dateKey = tx.occurredAt.slice(0, 10);
			let list = groupMap.get(dateKey);
			if (!list) {
				list = [];
				groupMap.set(dateKey, list);
			}
			list.push(tx);
		}

		const groups: GroupedDay[] = [];
		for (const [dateKey, items] of groupMap.entries()) {
			const totalNet = items.reduce((sum, item) => {
				if (item.type === 'income') return sum + item.amount;
				if (item.type === 'expense') return sum - item.amount;
				return sum;
			}, 0);

			groups.push({ date: dateKey, items, totalNet, totalCount: items.length });
		}

		return groups;
	});
</script>

<svelte:head>
	<title>Daftar Transaksi — Uangku</title>
</svelte:head>

<div class="space-y-4">
	<h1 class="sr-only">Riwayat Transaksi</h1>

	<!-- Baris Periode Ringkas & Kontrol Filter -->
	<Card class="p-2 sm:p-2.5">
		<div class="flex items-center justify-between gap-2">
			<!-- Navigasi Periode Bulan (‹ Bulan Tahun ›) -->
			<div class="flex items-center gap-1 sm:gap-1.5 min-w-0">
				{#if periodView.prev}
					<a
						href={buildPeriodUrl(periodView.prev)}
						class="w-11 h-11 shrink-0 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle flex items-center justify-center font-black text-base shadow-hard-xs transition-all focus-visible:outline-2"
						aria-label="Periode sebelumnya"
						title="Periode sebelumnya"
					>
						‹
					</a>
				{:else}
					<span
						class="w-11 h-11 shrink-0 rounded-md border-2 border-border/30 text-content-muted flex items-center justify-center font-black text-base opacity-40 cursor-not-allowed"
						aria-hidden="true"
					>
						‹
					</span>
				{/if}

				<span class="px-1.5 sm:px-2 font-black text-xs sm:text-sm text-content truncate select-none">
					{periodView.label}
				</span>

				{#if periodView.next}
					<a
						href={buildPeriodUrl(periodView.next)}
						class="w-11 h-11 shrink-0 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle flex items-center justify-center font-black text-base shadow-hard-xs transition-all focus-visible:outline-2"
						aria-label="Periode berikutnya"
						title="Periode berikutnya"
					>
						›
					</a>
				{:else}
					<span
						class="w-11 h-11 shrink-0 rounded-md border-2 border-border/30 text-content-muted flex items-center justify-center font-black text-base opacity-40 cursor-not-allowed"
						aria-hidden="true"
					>
						›
					</span>
				{/if}
			</div>

			<!-- Tombol Buka Sheet Filter -->
			<div class="flex items-center gap-1.5 shrink-0">
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="min-h-[44px] px-2.5 sm:px-3 relative font-bold text-xs"
					onclick={openFilterSheet}
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

		<!-- Chip Filter Aktif (Removable) -->
		{#if activeFilterCount > 0}
			<div class="flex flex-wrap items-center gap-1.5 pt-2 mt-2 border-t border-border/10">
				{#if filter.type}
					<a
						href={buildUrlWithout('type')}
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter {filter.type === 'income' ? 'Pemasukan' : filter.type === 'expense' ? 'Pengeluaran' : 'Transfer'}"
					>
						<span>{filter.type === 'income' ? 'Pemasukan' : filter.type === 'expense' ? 'Pengeluaran' : 'Transfer'}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				{#if filter.walletId && walletMap.has(filter.walletId)}
					<a
						href={buildUrlWithout('walletId')}
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter {walletMap.get(filter.walletId)}"
					>
						<span>{walletMap.get(filter.walletId)}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				{#if filter.categoryId && categoryMap.has(filter.categoryId)}
					<a
						href={buildUrlWithout('categoryId')}
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus filter {categoryMap.get(filter.categoryId)}"
					>
						<span>{categoryMap.get(filter.categoryId)}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				{#if filter.period === 'custom' && (filter.startDate || filter.endDate)}
					<a
						href={buildUrlWithout('customDates')}
						class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface text-xs font-bold text-content hover:bg-danger/10 hover:border-danger hover:text-danger transition-colors min-h-[32px]"
						aria-label="Hapus rentang kustom"
					>
						<span>{filter.startDate || '...'} – {filter.endDate || '...'}</span>
						<span aria-hidden="true" class="font-black text-sm">×</span>
					</a>
				{/if}

				<a
					href={buildPeriodUrl(periodView.period)}
					class="text-xs font-bold text-content-muted hover:text-danger underline ml-1 px-1 py-1"
				>
					Hapus Semua
				</a>
			</div>
		{/if}
	</Card>

	{#if errorMessage}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs" role="alert">
			{errorMessage}
		</div>
	{/if}

	<!-- Transactions List (Grouped by Day) -->
	{#if !syncEngine.ready}
		<div class="space-y-2" aria-busy="true" aria-live="polite">
			{#each { length: 4 }, i (i)}
				<div class="h-16 rounded-md border-2 border-border/30 bg-surface-subtle/60 animate-pulse"></div>
			{/each}
		</div>
	{:else if loadedItems.length === 0}
		{#if syncEngine.transactions.length > 0}
			<EmptyState
				title="Tidak Ada Transaksi di Periode Ini"
				description="Tidak ditemukan riwayat kas untuk filter atau periode {periodView.label}."
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
							<div class="px-2.5 sm:px-3 py-1 sm:py-1.5 min-h-[48px] flex items-center justify-between gap-2 hover:bg-surface-subtle/50 transition-colors">
								<!-- Kiri: Badge + Catatan/Kategori + Dompet -->
								<div class="flex items-center gap-2 min-w-0">
									<Badge
										variant={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'neutral'}
										class="shrink-0 text-[10px] sm:text-xs"
									>
										{tx.type === 'income' ? 'Masuk' : tx.type === 'expense' ? 'Keluar' : 'Transfer'}
									</Badge>

									{#if tx.serverUpdatedAt === 0}
										<span
											class="shrink-0 text-[10px] font-bold text-content-muted uppercase tracking-wide"
											title="Menunggu sinkronisasi"
										>
											• Menunggu
										</span>
									{/if}

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
								<div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
											class="min-h-[44px] min-w-[44px] px-2 py-1 text-xs font-bold rounded border border-border bg-surface hover:bg-surface-subtle transition-all flex items-center justify-center"
											aria-label="Edit transaksi"
										>
											Edit
										</button>
										<button
											type="button"
											onclick={() => handleDelete(tx)}
											disabled={!canWrite}
											class="min-h-[44px] min-w-[44px] px-2 py-1 text-xs font-bold rounded border border-border bg-surface text-danger hover:bg-danger/10 transition-all flex items-center justify-center disabled:opacity-50"
											aria-label="Hapus transaksi"
										>
											Hapus
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Client-side pagination: grows the render window, no fetch -->
		{#if hasMore}
			<div class="flex justify-center pt-4">
				<a
					href={loadMoreUrl()}
					onclick={(e) => {
						// Pure client pagination: `shallow` keeps the scroll position and issues no request.
						e.preventDefault();
						void goto(loadMoreUrl(), { shallow: true, reset: false });
					}}
					class="min-h-[44px] px-6 py-2.5 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-center transition-all"
				>
					Muat Lebih Banyak
				</a>
			</div>
		{/if}
	{/if}

	<!-- Sheet Filter Modal -->
	<Dialog.Root bind:open={showFilterSheet}>
		<Dialog.Content class="space-y-4 max-h-[90vh] overflow-y-auto sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title class="text-lg font-black text-content">Filter Transaksi</Dialog.Title>
			</Dialog.Header>

			<form onsubmit={applyFilters} class="space-y-4">
				<div class="space-y-1.5">
					<label for="sheet-filter-period" class="block text-sm font-bold text-content">Rentang Waktu</label>
					<select
						id="sheet-filter-period"
						name="period"
						bind:value={sheetPeriod}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						{#if isMonthPeriod(filter.period)}
							<option value={filter.period}>Bulan Terpilih ({periodView.label})</option>
						{:else}
							<option value="">Bulan Terpilih ({periodView.label})</option>
						{/if}
						<option value="custom">Rentang Kustom</option>
						<option value="all">Semua Periode</option>
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="sheet-filter-type" class="block text-sm font-bold text-content">Tipe Transaksi</label>
					<select
						id="sheet-filter-type"
						name="type"
						bind:value={sheetType}
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
						bind:value={sheetWalletId}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Dompet</option>
						{#each activeWallets as w}
							<option value={w.id}>{w.name}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="sheet-filter-category" class="block text-sm font-bold text-content">Kategori</label>
					<select
						id="sheet-filter-category"
						name="categoryId"
						bind:value={sheetCategoryId}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
					>
						<option value="">Semua Kategori</option>
						{#each activeCategories as c}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</div>

				{#if sheetPeriod === 'custom'}
					<div class="space-y-3 pt-2 border-t border-border/20">
						<p class="text-xs font-bold text-content-muted uppercase tracking-wider">Rentang Kustom</p>
						<div class="space-y-1.5">
							<label for="sheet-filter-start" class="block text-xs font-bold text-content">Dari Tanggal</label>
							<input
								type="date"
								id="sheet-filter-start"
								name="startDate"
								bind:value={sheetStartDate}
								class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
						<div class="space-y-1.5">
							<label for="sheet-filter-end" class="block text-xs font-bold text-content">Sampai Tanggal</label>
							<input
								type="date"
								id="sheet-filter-end"
								name="endDate"
								bind:value={sheetEndDate}
								class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
							/>
						</div>
					</div>
				{/if}

				<div class="flex items-center justify-between gap-2 pt-3 border-t-2 border-border/10">
					<a
						href={buildPeriodUrl(periodView.period)}
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
						? 'bg-expense text-expense-foreground border-border shadow-hard-xs'
						: 'border-border/30 hover:border-border text-content'}"
				>
					Pengeluaran
				</button>
				<button
					type="button"
					onclick={() => (transactionKind = 'income')}
					class="py-2 px-3 text-xs font-bold rounded-md border-2 min-h-[44px] transition-all {transactionKind ===
					'income'
						? 'bg-income text-income-foreground border-border shadow-hard-xs'
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

			<form onsubmit={handleCreate} class="space-y-4">
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
							{#each activeWallets as w}
								<option value={w.id}>{w.name} ({formatRupiah(walletBalances.get(w.id) ?? 0)})</option>
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
							{#each activeWallets as w}
								<option value={w.id}>{w.name} ({formatRupiah(walletBalances.get(w.id) ?? 0)})</option>
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
							{#each activeWallets as w}
								<option value={w.id}>{w.name} ({formatRupiah(walletBalances.get(w.id) ?? 0)})</option>
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
					<Button type="submit" variant="primary" disabled={!canWrite}>
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

				<form onsubmit={handleUpdate} class="space-y-4">
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
							{#each activeWallets as w}
								<option value={w.id}>{w.name} ({formatRupiah(walletBalances.get(w.id) ?? 0)})</option>
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
							{#each activeCategories as c}
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
						<Button type="submit" variant="primary" disabled={!canWrite}>
							Simpan Perubahan
						</Button>
					</div>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</div>
