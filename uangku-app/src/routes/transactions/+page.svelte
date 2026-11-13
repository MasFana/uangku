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
</script>

<svelte:head>
	<title>Daftar Transaksi — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="sr-only">Riwayat Transaksi</h1>

	<!-- Page Header -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<p class="text-sm font-semibold text-content-muted">
				Pantau seluruh alur kas masuk, keluar, dan transfer antar dompet Anda.
			</p>
		</div>
	</div>

	<!-- Filter Bar -->
	<Card class="p-4">
		<form method="GET" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
			<div>
				<label for="filter-type" class="block text-xs font-bold text-content-muted mb-1">Tipe</label>
				<select
					id="filter-type"
					name="type"
					value={data.filters.type}
					class="w-full min-h-[44px] px-2.5 py-1.5 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
				>
					<option value="">Semua Tipe</option>
					<option value="expense">Pengeluaran</option>
					<option value="income">Pemasukan</option>
					<option value="transfer">Transfer</option>
				</select>
			</div>

			<div>
				<label for="filter-wallet" class="block text-xs font-bold text-content-muted mb-1">Dompet</label>
				<select
					id="filter-wallet"
					name="walletId"
					value={data.filters.walletId}
					class="w-full min-h-[44px] px-2.5 py-1.5 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
				>
					<option value="">Semua Dompet</option>
					{#each data.wallets || [] as w}
						<option value={w.id}>{w.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="filter-category" class="block text-xs font-bold text-content-muted mb-1">Kategori</label>
				<select
					id="filter-category"
					name="categoryId"
					value={data.filters.categoryId}
					class="w-full min-h-[44px] px-2.5 py-1.5 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
				>
					<option value="">Semua Kategori</option>
					{#each data.categories || [] as c}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="filter-start-date" class="block text-xs font-bold text-content-muted mb-1">Dari Tanggal</label>
				<input
					type="date"
					id="filter-start-date"
					name="startDate"
					value={data.filters.startDate}
					class="w-full min-h-[44px] px-2.5 py-1.5 text-xs font-bold rounded-md border-2 border-border bg-surface text-content shadow-hard-xs"
				/>
			</div>

			<div class="flex items-end gap-2">
				<Button type="submit" variant="primary" class="w-full min-h-[44px] text-xs">
					Filter
				</Button>
				{#if data.filters.type || data.filters.walletId || data.filters.categoryId || data.filters.startDate}
					<a
						href="/transactions"
						class="min-h-[44px] px-3 py-2 flex items-center justify-center rounded-md border-2 border-border bg-surface text-xs font-bold text-content hover:bg-surface-subtle"
					>
						Reset
					</a>
				{/if}
			</div>
		</form>
	</Card>

	{#if form?.error}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs">
			{form.error}
		</div>
	{/if}

	<!-- Transactions List -->
	{#if !data.transactions || data.transactions.length === 0}
		<EmptyState
			title="Tidak Ada Transaksi"
			description="Belum ada transaksi yang sesuai dengan filter ini. Mulai dengan mencatat pemasukan atau pengeluaran."
			actionLabel="+ Tambah Transaksi"
			onclick={() => {
				transactionKind = 'expense';
				showCreateModal = true;
			}}
		/>
	{:else}
		<div class="space-y-3">
			{#each data.transactions as tx}
				<Card class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div class="flex items-start gap-3 min-w-0">
						<div class="mt-0.5">
							<Badge variant={tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'neutral'}>
								{tx.type === 'income' ? 'Pemasukan' : tx.type === 'expense' ? 'Pengeluaran' : 'Transfer'}
							</Badge>
						</div>

						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<p class="text-sm font-bold text-content truncate">
									{tx.note || (tx.categoryId ? categoryMap.get(tx.categoryId) : 'Transaksi')}
								</p>
								{#if tx.categoryId && categoryMap.has(tx.categoryId)}
									<span class="text-xs font-semibold text-content-muted">
										• {categoryMap.get(tx.categoryId)}
									</span>
								{/if}
							</div>

							<p class="text-xs text-content-muted mt-0.5">
								{formatDateIndo(tx.occurredAt)} • Dompet: {walletMap.get(tx.walletId) || 'Tidak diketahui'}
							</p>
						</div>
					</div>

					<div class="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/10">
						<p class="text-base font-black font-mono tabular-nums {tx.type === 'income' ? 'text-income' : tx.type === 'expense' ? 'text-expense' : 'text-content'}">
							{tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatRupiah(tx.amount)}
						</p>

						<div class="flex items-center gap-1.5">
							<button
								type="button"
								onclick={() => {
									editingTransaction = tx;
									showCreateModal = false;
								}}
								class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface hover:bg-surface-subtle transition-all min-h-[44px]"
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
									class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface text-danger hover:bg-danger/10 transition-all min-h-[44px]"
								>
									Hapus
								</button>
							</form>
						</div>
					</div>
				</Card>
			{/each}
		</div>

		<!-- Pagination / Load More cursor -->
		{#if data.hasMore && data.nextCursor}
			<div class="flex justify-center pt-4">
				<a
					href="?cursor={data.nextCursor}&walletId={data.filters.walletId}&categoryId={data.filters.categoryId}&type={data.filters.type}&startDate={data.filters.startDate}&endDate={data.filters.endDate}"
					class="min-h-[44px] px-6 py-2.5 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-center transition-all"
				>
					Muat Lebih Banyak
				</a>
			</div>
		{/if}
	{/if}

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
