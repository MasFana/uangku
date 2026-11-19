<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import NumericInput from '$lib/components/NumericInput.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatRupiah } from '$lib/utils';
	import { page } from '$app/state';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { deriveWalletBalances, sumBalances } from '$lib/client/derive';

	// All state is local (IndexedDB via syncEngine); no server load, works offline.
	const ready = $derived(syncEngine.ready);
	const canWrite = $derived(syncEngine.ready && syncEngine.getLocalLedger() !== null);
	// Archived wallets drop out of the list, matching the old `includeArchived: false` load.
	const wallets = $derived(syncEngine.wallets.filter((w) => !w.archived));
	const balances = $derived(deriveWalletBalances(wallets, syncEngine.transactions));
	const totalBalance = $derived(sumBalances(balances));

	// Modal / form toggles
	let showCreateModal = $state(false);
	let editingWallet = $state<{ id: string; name: string; type: string } | null>(null);
	let submitError = $state<string | null>(null);

	// Create form fields
	let newName = $state('');
	let newType = $state('cash');
	let newBalance = $state(0);

	const walletTypeLabels: Record<string, string> = {
		cash: 'Tunai',
		bank: 'Bank Transfer',
		ewallet: 'E-Wallet',
		other: 'Lainnya'
	};

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger) return;

		const name = newName.trim();
		if (!name) {
			submitError = 'Nama dompet wajib diisi';
			return;
		}
		submitError = null;
		try {
			await ledger.createWallet(userId, {
				name,
				type: newType as 'cash' | 'bank' | 'ewallet' | 'other',
				initialBalance: Math.max(0, Math.trunc(newBalance) || 0)
			});
			showCreateModal = false;
			newName = '';
			newType = 'cash';
			newBalance = 0;
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal membuat dompet';
		}
	}

	async function handleUpdate(e: SubmitEvent) {
		e.preventDefault();
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger || !editingWallet) return;

		const name = editingWallet.name.trim();
		if (!name) {
			submitError = 'Nama dompet wajib diisi';
			return;
		}
		submitError = null;
		try {
			await ledger.updateWallet(userId, editingWallet.id, {
				name,
				type: editingWallet.type as 'cash' | 'bank' | 'ewallet' | 'other'
			});
			editingWallet = null;
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal memperbarui dompet';
		}
	}

	async function handleArchive(wallet: { id: string; name: string }) {
		const userId = page.data.user?.id;
		const ledger = syncEngine.getLocalLedger();
		if (!userId || !ledger) return;
		if (!confirm(`Arsipkan dompet ${wallet.name}?`)) return;
		submitError = null;
		try {
			await ledger.setWalletArchived(userId, wallet.id, true);
			await syncEngine.reloadLocalData();
			void syncEngine.triggerSync();
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Gagal mengarsipkan dompet';
		}
	}

	function openCreate() {
		submitError = null;
		showCreateModal = true;
		editingWallet = null;
	}
</script>

<svelte:head>
	<title>Kelola Dompet — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="sr-only">Dompet & Rekening</h1>

	<!-- Page Header: Desktop only button -->
	<div class="hidden md:flex items-center justify-end">
		<Button variant="primary" size="md" disabled={!canWrite} onclick={openCreate}>
			+ Tambah Dompet
		</Button>
	</div>

	{#if submitError}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs" role="alert">
			{submitError}
		</div>
	{/if}

	{#if !ready}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
			{#each [1, 2] as _}
				<Card class="p-5 space-y-3">
					<div class="h-5 w-20 rounded bg-surface-muted animate-pulse"></div>
					<div class="h-6 w-40 rounded bg-surface-muted animate-pulse"></div>
					<div class="h-7 w-28 rounded bg-surface-muted animate-pulse"></div>
				</Card>
			{/each}
		</div>
	{:else if wallets.length === 0}
		<EmptyState
			title="Belum Ada Dompet"
			description="Tambahkan dompet pertama seperti Kas Tunai, BCA, atau GoPay untuk mulai melacak saldo."
			actionLabel="+ Tambah Dompet Baru"
			onclick={openCreate}
		/>
	{:else}
		<Card variant="subtle" class="p-4 flex items-baseline justify-between">
			<span class="text-xs font-bold text-content-muted">Total Saldo Dompet</span>
			<p class="text-lg font-black font-mono tabular-nums text-content">
				{formatRupiah(totalBalance)}
			</p>
		</Card>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each wallets as wallet}
				<Card class="p-5 flex flex-col justify-between">
					<div>
						<div class="flex items-start justify-between gap-2 mb-2">
							<Badge variant="neutral">
								{walletTypeLabels[wallet.type] || wallet.type}
							</Badge>

							<div class="flex items-center gap-1.5">
								<button
									type="button"
									onclick={() => {
										editingWallet = { id: wallet.id, name: wallet.name, type: wallet.type };
										showCreateModal = false;
										submitError = null;
									}}
									class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface hover:bg-surface-subtle active:translate-x-[1px] active:translate-y-[1px] transition-all min-h-[44px]"
								>
									Edit
								</button>
								<button
									type="button"
									onclick={() => handleArchive(wallet)}
									class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface text-danger hover:bg-danger/10 active:translate-x-[1px] active:translate-y-[1px] transition-all min-h-[44px]"
								>
									Arsipkan
								</button>
							</div>
						</div>

						<h2 class="text-lg font-black text-content tracking-tight mt-1">{wallet.name}</h2>
					</div>

					<div class="mt-4 pt-3 border-t-2 border-border/10 flex items-baseline justify-between">
						<span class="text-xs font-bold text-content-muted">Saldo</span>
						<p class="text-xl font-black font-mono tabular-nums text-content">
							{formatRupiah(balances.get(wallet.id) ?? 0)}
						</p>
					</div>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Modal Tambah Dompet -->
	<Dialog.Root bind:open={showCreateModal}>
		<Dialog.Content class="space-y-4">
			<Dialog.Header>
				<Dialog.Title class="text-lg font-black text-content">Tambah Dompet Baru</Dialog.Title>
			</Dialog.Header>

			<form onsubmit={handleCreate} class="space-y-4">
				<Input
					bind:value={newName}
					id="create-wallet-name"
					label="Nama Dompet"
					placeholder="Contoh: Rekening BCA, Dompet Tunai"
					required
				/>

				<div class="space-y-1.5">
					<label for="create-wallet-type" class="block text-sm font-bold text-content">Tipe Dompet</label>
					<select
						id="create-wallet-type"
						bind:value={newType}
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
					>
						<option value="cash">Tunai (Cash)</option>
						<option value="bank">Rekening Bank</option>
						<option value="ewallet">E-Wallet (GoPay, OVO, dll)</option>
						<option value="other">Lainnya</option>
					</select>
				</div>

				<NumericInput
					bind:value={newBalance}
					id="create-wallet-balance"
					label="Saldo Awal"
					placeholder="0"
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
						Simpan Dompet
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Modal Edit Dompet -->
	<Dialog.Root open={editingWallet !== null} onOpenChange={(open) => { if (!open) editingWallet = null; }}>
		<Dialog.Content class="space-y-4">
			{#if editingWallet}
				<Dialog.Header>
					<Dialog.Title class="text-lg font-black text-content">Edit Dompet</Dialog.Title>
				</Dialog.Header>

				<form onsubmit={handleUpdate} class="space-y-4">
					<Input
						bind:value={editingWallet.name}
						id="edit-wallet-name"
						label="Nama Dompet"
						required
					/>

					<div class="space-y-1.5">
						<label for="edit-wallet-type" class="block text-sm font-bold text-content">Tipe Dompet</label>
						<select
							id="edit-wallet-type"
							bind:value={editingWallet.type}
							class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
						>
							<option value="cash">Tunai (Cash)</option>
							<option value="bank">Rekening Bank</option>
							<option value="ewallet">E-Wallet (GoPay, OVO, dll)</option>
							<option value="other">Lainnya</option>
						</select>
					</div>

					<div class="flex items-center justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onclick={() => (editingWallet = null)}
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
		aria-label="Tambah dompet baru"
		title="Tambah dompet baru"
	>
		<svg class="w-6 h-6 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
	</button>
</div>
