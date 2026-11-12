<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import NumericInput from '$lib/components/NumericInput.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Badge from '$lib/components/Badge.svelte';
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			showCreateModal = false;
			editingWallet = null;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Kelola Dompet — Uangku</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="text-2xl sm:text-3xl font-black tracking-tight text-content">
				Dompet & Rekening
			</h1>
			<p class="text-sm font-semibold text-content-muted mt-0.5">
				Kelola rekening bank, uang tunai, dan dompet digital tempat Anda menyimpan uang.
			</p>
		</div>

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
						<span class="text-xs font-bold text-content-muted">Saldo Saat Ini</span>
						<p class="text-xl font-black font-mono tabular-nums text-content">
							{formatRupiah(wallet.balance ?? 0)}
						</p>
					</div>
				</Card>
			{/each}
		</div>
	{/if}

	<!-- Modal Tambah Dompet -->
	{#if showCreateModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
			<div class="w-full max-w-md p-6 rounded-xl border-2 border-border bg-surface shadow-hard-lg space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-black text-content">Tambah Dompet Baru</h3>
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
			</div>
		</div>
	{/if}

	<!-- Modal Edit Dompet -->
	{#if editingWallet}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
			<div class="w-full max-w-md p-6 rounded-xl border-2 border-border bg-surface shadow-hard-lg space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-black text-content">Edit Dompet</h3>
					<button
						type="button"
						onclick={() => (editingWallet = null)}
						class="text-content-muted hover:text-content font-bold text-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
					>
						✕
					</button>
				</div>

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
			</div>
		</div>
	{/if}
</div>
