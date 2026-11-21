<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { currentUrl } from '$lib/client/url-state';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { DEFAULT_CATEGORIES } from '$lib/shared/default-categories';

	// All state is local (IndexedDB via syncEngine); no server load, works offline.
	const ready = $derived(syncEngine.ready);
	const canWrite = $derived(syncEngine.ready && syncEngine.getLocalLedger() !== null);
	// Archived categories drop out, matching the old `includeArchived: false` load.
	const categories = $derived(syncEngine.categories.filter((c) => !c.archived));

	// Filter tab lives in the URL (`?kind=`) so it deep-links like the other filters.
	const activeTab = $derived.by((): 'all' | 'expense' | 'income' => {
		const k = currentUrl().searchParams.get('kind');
		return k === 'income' || k === 'expense' ? k : 'all';
	});

	function setTab(tab: 'all' | 'expense' | 'income') {
		const url = new URL(currentUrl().href);
		if (tab === 'all') url.searchParams.delete('kind');
		else url.searchParams.set('kind', tab);
		// `shallow` keeps the filter URL-only: no navigation, no scroll/focus reset.
		void goto(url.pathname + url.search, { shallow: true, reset: false });
	}

	const filteredCategories = $derived(
		activeTab === 'all' ? categories : categories.filter((c) => c.kind === activeTab)
	);

	let showCreateModal = $state(false);
	let isSeeding = $state(false);
	let submitError = $state<string | null>(null);
	let editingCategory = $state<{
		id: string;
		name: string;
		kind: 'income' | 'expense';
		icon: string;
		color: string;
	} | null>(null);

	// Create form fields
	let newName = $state('');
	let newKind = $state<'income' | 'expense'>('expense');
	let newColor = $state('#22c55e');

	/*
	 * ponytail: minimal client-side validation (trimmed non-empty name) instead of a shared
	 * Valibot schema — validation now lives server-side in `$lib/server/validation.ts`, which
	 * the browser cannot import.
	 * Upgrade path: move the category rules into `$lib/shared` and reuse on both sides.
	 */
	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger) return;

		const name = newName.trim();
		if (!name) {
			submitError = 'Nama kategori wajib diisi';
			return;
		}
		submitError = null;
		try {
			await ledger.createCategory(userId, {
				name,
				kind: newKind,
				icon: 'tag',
				color: newColor
			});
			showCreateModal = false;
			newName = '';
			newKind = 'expense';
			newColor = '#22c55e';
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal membuat kategori';
		}
	}

	async function handleUpdate(e: SubmitEvent) {
		e.preventDefault();
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger || !editingCategory) return;

		const name = editingCategory.name.trim();
		if (!name) {
			submitError = 'Nama kategori wajib diisi';
			return;
		}
		submitError = null;
		try {
			await ledger.updateCategory(userId, editingCategory.id, {
				name,
				kind: editingCategory.kind,
				icon: editingCategory.icon || 'tag',
				color: editingCategory.color
			});
			editingCategory = null;
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal memperbarui kategori';
		}
	}

	async function handleArchive(category: { id: string; name: string }) {
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger) return;
		if (!confirm(`Arsipkan kategori ${category.name}?`)) return;
		submitError = null;
		try {
			await ledger.setCategoryArchived(userId, category.id, true);
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal mengarsipkan kategori';
		}
	}

	// Local twin of the server seeder: create the shared defaults we don't already have.
	async function handleSeedDefaults() {
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger) return;

		submitError = null;
		isSeeding = true;
		try {
			const existing = new Set(
				categories.map((c) => `${c.kind}:${c.name.trim().toLowerCase()}`)
			);
			for (const def of DEFAULT_CATEGORIES) {
				if (existing.has(`${def.kind}:${def.name.toLowerCase()}`)) continue;
				await ledger.createCategory(userId, {
					name: def.name,
					kind: def.kind,
					icon: 'tag',
					color: def.color
				});
			}
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal menyalin kategori bawaan';
		} finally {
			isSeeding = false;
		}
	}

	function openCreate() {
		submitError = null;
		showCreateModal = true;
		editingCategory = null;
	}
</script>

<svelte:head>
	<title>Kelola Kategori — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="sr-only">Kategori Transaksi</h1>

	<!-- Page Header: Desktop only button -->
	<div class="hidden md:flex items-center justify-end">
		<Button variant="primary" size="md" disabled={!canWrite} onclick={openCreate}>
			+ Tambah Kategori
		</Button>
	</div>

	<!-- Filter Tabs -->
	<div class="flex items-center gap-2 border-b-2 border-border pb-3">
		<button
			type="button"
			onclick={() => setTab('all')}
			class="px-3.5 py-2 rounded-md font-bold text-xs border-2 min-h-[44px] transition-all {activeTab ===
			'all'
				? 'bg-content text-canvas border-border shadow-hard-xs'
				: 'border-border/30 hover:border-border text-content'}"
		>
			Semua ({categories.length})
		</button>
		<button
			type="button"
			onclick={() => setTab('expense')}
			class="px-3.5 py-2 rounded-md font-bold text-xs border-2 min-h-[44px] transition-all {activeTab ===
			'expense'
				? 'bg-expense text-expense-foreground border-border shadow-hard-xs'
				: 'border-border/30 hover:border-border text-content'}"
		>
			Pengeluaran
		</button>
		<button
			type="button"
			onclick={() => setTab('income')}
			class="px-3.5 py-2 rounded-md font-bold text-xs border-2 min-h-[44px] transition-all {activeTab ===
			'income'
				? 'bg-income text-neutral-900 border-border shadow-hard-xs'
				: 'border-border/30 hover:border-border text-content'}"
		>
			Pemasukan
		</button>
	</div>

	{#if submitError}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs" role="alert">
			{submitError}
		</div>
	{/if}

	<!-- Categories Grid -->
	{#if !ready}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" aria-busy="true">
			{#each [1, 2, 3] as _}
				<Card class="p-4 flex items-center gap-3">
					<div class="w-4 h-4 rounded-full bg-surface-muted animate-pulse shrink-0"></div>
					<div class="h-4 w-28 rounded bg-surface-muted animate-pulse"></div>
				</Card>
			{/each}
		</div>
	{:else if filteredCategories.length === 0}
		<div class="space-y-4">
			<EmptyState
				title="Belum Ada Kategori"
				description="Tambahkan kategori baru seperti Makanan, Transportasi, atau Gaji."
				actionLabel="+ Buat Kategori"
				onclick={openCreate}
			/>
			{#if categories.length === 0}
				<div class="flex justify-center">
					<Button
						type="button"
						variant="outline"
						disabled={isSeeding || !canWrite}
						onclick={handleSeedDefaults}
						class="min-h-[44px]"
					>
						{isSeeding ? 'Menambahkan...' : 'Isi kategori bawaan'}
					</Button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
			{#each filteredCategories as category (category.id)}
				<Card class="p-4 flex items-center justify-between gap-3">
					<div class="flex items-center gap-3 min-w-0">
						<span
							class="w-4 h-4 rounded-full border-2 border-border shrink-0"
							style="background-color: {category.color};"
						></span>
						<div class="min-w-0">
							<p class="text-sm font-bold text-content truncate">{category.name}</p>
							<Badge variant={category.kind === 'income' ? 'income' : 'expense'}>
								{category.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}
							</Badge>
						</div>
					</div>

					<div class="flex items-center gap-1.5 shrink-0">
						<button
							type="button"
							onclick={() => {
								editingCategory = {
									id: category.id,
									name: category.name,
									kind: category.kind as 'income' | 'expense',
									icon: category.icon || '',
									color: category.color || ''
								};
								showCreateModal = false;
								submitError = null;
							}}
							class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface hover:bg-surface-subtle transition-all min-h-[44px]"
						>
							Edit
						</button>
						<button
							type="button"
							onclick={() => handleArchive(category)}
							class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface text-danger hover:bg-danger/10 transition-all min-h-[44px]"
						>
							Arsip
						</button>
					</div>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Modal Tambah Kategori -->
	<Dialog.Root bind:open={showCreateModal}>
		<Dialog.Content class="space-y-4">
			<Dialog.Header>
				<Dialog.Title class="text-lg font-black text-content">Tambah Kategori Baru</Dialog.Title>
			</Dialog.Header>

			<form onsubmit={handleCreate} class="space-y-4">
				<Input
					bind:value={newName}
					id="create-cat-name"
					label="Nama Kategori"
					placeholder="Contoh: Makanan & Minuman, Gaji Bulanan"
					required
				/>

				<div class="space-y-1.5">
					<label for="create-cat-kind" class="block text-sm font-bold text-content">Jenis Kategori</label>
					<select
						id="create-cat-kind"
						bind:value={newKind}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
					>
						<option value="expense">Pengeluaran</option>
						<option value="income">Pemasukan</option>
					</select>
				</div>

				<div class="space-y-1.5">
					<label for="create-cat-color" class="block text-sm font-bold text-content">Warna Penanda</label>
					<input
						type="color"
						id="create-cat-color"
						bind:value={newColor}
						class="w-full h-10 rounded border-2 border-border cursor-pointer bg-surface p-1"
					/>
				</div>

				<div class="flex items-center justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						onclick={() => (showCreateModal = false)}
					>
						Batal
					</Button>
					<Button type="submit" variant="primary" disabled={!canWrite}>
						Simpan Kategori
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Modal Edit Kategori -->
	<Dialog.Root open={editingCategory !== null} onOpenChange={(open) => { if (!open) editingCategory = null; }}>
		<Dialog.Content class="space-y-4">
			{#if editingCategory}
				<Dialog.Header>
					<Dialog.Title class="text-lg font-black text-content">Edit Kategori</Dialog.Title>
				</Dialog.Header>

				<form onsubmit={handleUpdate} class="space-y-4">
					<Input
						bind:value={editingCategory.name}
						id="edit-cat-name"
						label="Nama Kategori"
						required
					/>

					<div class="space-y-1.5">
						<label for="edit-cat-kind" class="block text-sm font-bold text-content">Jenis Kategori</label>
						<select
							id="edit-cat-kind"
							bind:value={editingCategory.kind}
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							<option value="expense">Pengeluaran</option>
							<option value="income">Pemasukan</option>
						</select>
					</div>

					<div class="space-y-1.5">
						<label for="edit-cat-color" class="block text-sm font-bold text-content">Warna Penanda</label>
						<input
							type="color"
							id="edit-cat-color"
							bind:value={editingCategory.color}
							class="w-full h-10 rounded border-2 border-border cursor-pointer bg-surface p-1"
						/>
					</div>

					<div class="flex items-center justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onclick={() => (editingCategory = null)}
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

	<!-- Mobile Floating Action Button (FAB) -->
	<button
		type="button"
		disabled={!canWrite}
		onclick={openCreate}
		class="md:hidden fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full border-2 border-border bg-accent text-neutral-950 flex items-center justify-center shadow-hard hover:brightness-95 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
		aria-label="Tambah kategori baru"
		title="Tambah kategori baru"
	>
		<svg class="w-6 h-6 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
	</button>
</div>
