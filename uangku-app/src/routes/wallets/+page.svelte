<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import NumericInput from '$lib/components/NumericInput.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatRupiah } from '$lib/utils';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal / form toggles
	let showCreateModal = $state(false);
	let editingWallet = $state<{ id: string; name: string; type: string } | null>(null);

	const walletTypeLabels: Record<string, string> = {
		cash: 'Tunai',
		bank: 'Bank Transfer',
		ewallet: 'E-Wallet',
		other: 'Lainnya'
	};
</script>

<svelte:head>
	<title>Kelola Dompet — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="sr-only">Dompet & Rekening</h1>

	<!-- Page Header: Desktop only button -->
	<div class="hidden md:flex items-center justify-end">
		<Button
			variant="primary"
			size="md"
			onclick={() => {
				showCreateModal = true;
				editingWallet = null;
			}}
		>
			+ Tambah Dompet
		</Button>
	</div>

	{#if form?.error}
		<div class="p-4 rounded-md border-2 border-danger bg-danger/10 text-danger text-sm font-bold shadow-hard-xs">
			{form.error}
		</div>
	{/if}

	<!-- Wallets Grid -->
	{#if !data.wallets || data.wallets.length === 0}
		<EmptyState
			title="Belum Ada Dompet"
			description="Tambahkan dompet pertama seperti Kas Tunai, BCA, atau GoPay untuk mulai melacak saldo."
			actionLabel="+ Tambah Dompet Baru"
			onclick={() => {
				showCreateModal = true;
			}}
		/>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each data.wallets as wallet}
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
									}}
									class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface hover:bg-surface-subtle active:translate-x-[1px] active:translate-y-[1px] transition-all min-h-[44px]"
								>
									Edit
								</button>
								<form method="POST" action="?/archive" class="inline">
									<input type="hidden" name="id" value={wallet.id} />
									<button
										type="submit"
										onclick={(e) => {
											if (!confirm(`Arsipkan dompet ${wallet.name}?`)) e.preventDefault();
										}}
										class="px-3 py-2 text-xs font-bold rounded border-2 border-border bg-surface text-danger hover:bg-danger/10 active:translate-x-[1px] active:translate-y-[1px] transition-all min-h-[44px]"
									>
										Arsipkan
									</button>
								</form>
							</div>
						</div>

						<h2 class="text-lg font-black text-content tracking-tight mt-1">{wallet.name}</h2>
					</div>

					<div class="mt-4 pt-3 border-t-2 border-border/10 flex items-baseline justify-between">
						<span class="text-xs font-bold text-content-muted">Saldo</span>
						<p class="text-xl font-black font-mono tabular-nums text-content">
							{formatRupiah(wallet.balance ?? 0)}
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

			<form method="POST" action="?/create" class="space-y-4">
				<Input
					name="name"
					label="Nama Dompet"
					placeholder="Contoh: Rekening BCA, Dompet Tunai"
					required
				/>

				<div class="space-y-1.5">
					<label for="create-wallet-type" class="block text-sm font-bold text-content">Tipe Dompet</label>
					<select
						id="create-wallet-type"
						name="type"
						class="w-full min-h-[44px] px-3 py-2 text-sm font-bold rounded-md border-2 border-border bg-surface text-content focus:outline-none focus:ring-2 focus:ring-content shadow-hard-xs"
					>
						<option value="cash">Tunai (Cash)</option>
						<option value="bank">Rekening Bank</option>
						<option value="ewallet">E-Wallet (GoPay, OVO, dll)</option>
						<option value="other">Lainnya</option>
					</select>
				</div>

				<NumericInput
					name="initialBalance"
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
					<Button type="submit" variant="primary">
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

				<form method="POST" action="?/update" class="space-y-4">
					<input type="hidden" name="id" value={editingWallet.id} />

					<Input
						name="name"
						label="Nama Dompet"
						value={editingWallet.name}
						required
					/>

					<div class="space-y-1.5">
						<label for="edit-wallet-type" class="block text-sm font-bold text-content">Tipe Dompet</label>
						<select
							id="edit-wallet-type"
							name="type"
							value={editingWallet.type}
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
						<Button type="submit" variant="primary">
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
		onclick={() => {
			showCreateModal = true;
			editingWallet = null;
		}}
		class="md:hidden fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full border-2 border-border bg-accent text-neutral-950 flex items-center justify-center shadow-hard hover:brightness-95 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
		aria-label="Tambah dompet baru"
		title="Tambah dompet baru"
	>
		<svg class="w-6 h-6 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
	</button>
</div>
