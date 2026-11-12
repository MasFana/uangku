<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateModal = $state(false);
	let editingCategory = $state<{
		id: string;
		name: string;
		kind: 'income' | 'expense';
		icon: string;
		color: string;
	} | null>(null);

	// Filter tab: all, expense, income
	let activeTab = $state<'all' | 'expense' | 'income'>('all');

	const filteredCategories = $derived.by(() => {
		if (!data.categories) return [];
		if (activeTab === 'all') return data.categories;
		return data.categories.filter((c) => c.kind === activeTab);
	});
</script>

<svelte:head>
	<title>Kelola Kategori — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="text-2xl sm:text-3xl font-black tracking-tight text-content">
				Kategori Transaksi
			</h1>
			<p class="text-sm font-semibold text-content-muted mt-0.5">
				Kelompokkan pengeluaran dan pemasukan Anda untuk analisa arus kas yang akurat.
			</p>
		</div>

		<Button
			variant="primary"
			size="md"
			onclick={() => {
				showCreateModal = true;
				editingCategory = null;
			}}
		>
			+ Tambah Kategori
		</Button>
	</div>

	<!-- Filter Tabs -->
	<div class="flex items-center gap-2 border-b-2 border-border pb-3">
		<button
			type="button"
			onclick={() => (activeTab = 'all')}
			class="px-3.5 py-1.5 rounded-md font-bold text-xs border-2 min-h-[38px] transition-all {activeTab ===
			'all'
				? 'bg-content text-canvas border-border shadow-hard-xs'
				: 'border-border/30 hover:border-border text-content'}"
		>
			Semua ({data.categories?.length ?? 0})
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'expense')}
			class="px-3.5 py-1.5 rounded-md font-bold text-xs border-2 min-h-[38px] transition-all {activeTab ===
			'expense'
				? 'bg-expense text-white border-border shadow-hard-xs'
				: 'border-border/30 hover:border-border text-content'}"
		>
			Pengeluaran
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'income')}
			class="px-3.5 py-1.5 rounded-md font-bold text-xs border-2 min-h-[38px] transition-all {activeTab ===
			'income'
				? 'bg-income text-neutral-900 border-border shadow-hard-xs'
				: 'border-border/30 hover:border-border text-content'}"
		>
			Pemasukan
		</button>
	</div>

	{#if form?.error}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs">
			{form.error}
		</div>
	{/if}

	<!-- Categories Grid -->
	{#if !filteredCategories || filteredCategories.length === 0}
		<EmptyState
			title="Belum Ada Kategori"
			description="Tambahkan kategori baru seperti Makanan, Transportasi, atau Gaji."
			actionLabel="+ Buat Kategori"
			onclick={() => {
				showCreateModal = true;
			}}
		/>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
			{#each filteredCategories as category}
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
							}}
							class="px-2 py-1 text-xs font-bold rounded border-2 border-border bg-surface hover:bg-surface-subtle transition-all min-h-[32px]"
						>
							Edit
						</button>
						<form method="POST" action="?/archive" class="inline">
							<input type="hidden" name="id" value={category.id} />
							<button
								type="submit"
								onclick={(e) => {
									if (!confirm(`Arsipkan kategori ${category.name}?`)) e.preventDefault();
								}}
								class="px-2 py-1 text-xs font-bold rounded border-2 border-border bg-surface text-danger hover:bg-danger/10 transition-all min-h-[32px]"
							>
								Arsip
							</button>
						</form>
					</div>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Modal Tambah Kategori -->
	{#if showCreateModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
			<div class="w-full max-w-md p-6 rounded-xl border-2 border-border bg-surface shadow-hard-lg space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-black text-content">Tambah Kategori Baru</h3>
					<button
						type="button"
						onclick={() => (showCreateModal = false)}
						class="text-content-muted hover:text-content font-bold text-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
					>
						✕
					</button>
				</div>

				<form method="POST" action="?/create" class="space-y-4">
					<Input
						name="name"
						label="Nama Kategori"
						placeholder="Contoh: Makanan & Minuman, Gaji Bulanan"
						required
					/>

					<div class="space-y-1.5">
						<label for="create-cat-kind" class="block text-sm font-bold text-content">Jenis Kategori</label>
						<select
							id="create-cat-kind"
							name="kind"
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
							name="color"
							value="#22c55e"
							class="w-full h-10 rounded border-2 border-border cursor-pointer bg-surface p-1"
						/>
					</div>

					<input type="hidden" name="icon" value="tag" />

					<div class="flex items-center justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onclick={() => (showCreateModal = false)}
						>
							Batal
						</Button>
						<Button type="submit" variant="primary">
							Simpan Kategori
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Modal Edit Kategori -->
	{#if editingCategory}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
			<div class="w-full max-w-md p-6 rounded-xl border-2 border-border bg-surface shadow-hard-lg space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-black text-content">Edit Kategori</h3>
					<button
						type="button"
						onclick={() => (editingCategory = null)}
						class="text-content-muted hover:text-content font-bold text-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
					>
						✕
					</button>
				</div>

				<form method="POST" action="?/update" class="space-y-4">
					<input type="hidden" name="id" value={editingCategory.id} />

					<Input
						name="name"
						label="Nama Kategori"
						value={editingCategory.name}
						required
					/>

					<div class="space-y-1.5">
						<label for="edit-cat-kind" class="block text-sm font-bold text-content">Jenis Kategori</label>
						<select
							id="edit-cat-kind"
							name="kind"
							value={editingCategory.kind}
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
							name="color"
							value={editingCategory.color}
							class="w-full h-10 rounded border-2 border-border cursor-pointer bg-surface p-1"
						/>
					</div>

					<input type="hidden" name="icon" value={editingCategory.icon || 'tag'} />

					<div class="flex items-center justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onclick={() => (editingCategory = null)}
						>
							Batal
						</Button>
						<Button type="submit" variant="primary">
							Simpan Perubahan
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>
