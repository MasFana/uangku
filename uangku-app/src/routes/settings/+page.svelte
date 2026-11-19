<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import { openLedgerDB, idbGet, idbGetAll, type OutboxRecord } from '$lib/client/db/idb';
	import {
		buildOutboxRows,
		describeCursor,
		syncStatusLabel,
		type CursorInfo,
		type OutboxRow
	} from '$lib/client/db/sync-diagnostics';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface LocalSnapshot {
		rows: OutboxRow[];
		total: number;
		cursor: CursorInfo;
	}

	const userId = $derived(data.user?.id ?? null);
	const placeholderText = $derived(
		userId ? 'memuat data lokal…' : 'diagnostik tidak tersedia tanpa sesi pengguna'
	);

	/** null = belum dibaca: panel menampilkan placeholder netral sampai snapshot ada. */
	let snapshot = $state<LocalSnapshot | null>(null);
	let readError = $state<string | null>(null);
	let reloading = $state(false);

	/**
	 * Koneksi singkat milik panel: mesin tidak mengekspos baris outbox, sedangkan
	 * koneksi kedua (DB per pengguna, baca saja) lebih murah daripada menambah API mesin.
	 */
	async function refreshLocalSnapshot() {
		const uid = userId;
		if (!uid) return;
		try {
			const db = await openLedgerDB(uid);
			try {
				const [records, cursorMeta] = await Promise.all([
					idbGetAll<OutboxRecord>(db, 'outbox'),
					idbGet<{ key: string; value: number }>(db, 'sync_meta', 'cursor')
				]);
				const { rows, total } = buildOutboxRows(records);
				snapshot = {
					rows,
					total,
					cursor: describeCursor(typeof cursorMeta?.value === 'number' ? cursorMeta.value : null)
				};
				readError = null;
			} finally {
				db.close();
			}
		} catch (err) {
			readError = err instanceof Error ? err.message : String(err);
		}
	}

	async function handleSyncNow() {
		await syncEngine.triggerSync();
		await refreshLocalSnapshot();
	}

	async function handleReload() {
		reloading = true;
		try {
			await syncEngine.reloadLocalData();
			await refreshLocalSnapshot();
		} finally {
			reloading = false;
		}
	}

	// Dependensi: ganti pengguna, status mesin yang sudah tenang, dan kedalaman outbox
	// (tulisan lokal saat luring tidak mengubah status).
	const engineSignature = $derived(`${syncEngine.status}:${syncEngine.pendingCount}`);

	$effect(() => {
		if (!userId) return;
		// Saat siklus berjalan, outbox masih setengah dikomit; baca tenangnya menyusul.
		if (engineSignature.startsWith('syncing')) return;
		void refreshLocalSnapshot();
	});
</script>

<svelte:head>
	<title>Pengaturan — Uangku</title>
</svelte:head>

<div class="space-y-6 max-w-xl mx-auto">
	<h1 class="sr-only">Pengaturan Akun</h1>

	<!-- Info Akun -->
	<Card class="p-6 space-y-4">
		<h2 class="text-base font-black text-content border-b-2 border-border/10 pb-2">
			Informasi Pengguna
		</h2>

		<div class="space-y-3">
			<div>
				<span class="text-xs font-bold text-content-muted block">Nama Pengguna</span>
				<p class="text-sm font-bold text-content mt-0.5">
					{data.user?.name || 'Pengguna Uangku'}
				</p>
			</div>

			<div>
				<span class="text-xs font-bold text-content-muted block">Alamat Email</span>
				<p class="text-sm font-bold font-mono text-content mt-0.5">
					{data.user?.email || 'email@domain.com'}
				</p>
			</div>

			<div>
				<span class="text-xs font-bold text-content-muted block">ID Pengguna</span>
				<p class="text-xs font-mono text-content-muted mt-0.5 break-all">
					{data.user?.id || '-'}
				</p>
			</div>
		</div>
	</Card>

	<!-- Navigasi Cepat Pengaturan -->
	<Card class="p-6 space-y-4">
		<h2 class="text-base font-black text-content border-b-2 border-border/10 pb-2">
			Data & Entitas
		</h2>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
			<a
				href="/wallets"
				class="p-4 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-between"
			>
				<span>Kelola Dompet</span>
				<span class="text-content-muted">→</span>
			</a>

			<a
				href="/categories"
				class="p-4 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle font-bold text-sm shadow-hard-xs flex items-center justify-between"
			>
				<span>Kelola Kategori</span>
				<span class="text-content-muted">→</span>
			</a>
		</div>
	</Card>

	<!-- Ekspor Data -->
	<Card class="p-6 space-y-3">
		<h2 class="text-base font-black text-content">
			Ekspor Data
		</h2>
		<div class="pt-1">
			<a
				href="/api/export"
				download
				class="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md border-2 border-border bg-surface hover:bg-surface-subtle text-content font-bold text-sm shadow-hard-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content transition-all"
			>
				<span>Unduh Transaksi (CSV)</span>
				<span class="ml-2 text-content-muted" aria-hidden="true">↓</span>
			</a>
		</div>
	</Card>

	<!-- Diagnostik Sinkronisasi (client-only) -->
	<Card class="p-6 space-y-4">
		<h2 class="text-base font-black text-content border-b-2 border-border/10 pb-2">
			Diagnostik Sinkronisasi
		</h2>

		<p class="text-xs font-bold text-content" role="status" aria-live="polite">
			status: {syncStatusLabel(syncEngine.status)} • perubahan tertunda: {syncEngine.pendingCount} •
			data lokal siap: {syncEngine.ready ? 'ya' : 'belum'}
		</p>

		{#if syncEngine.lastError}
			<p
				class="text-xs font-mono font-bold text-danger border-2 border-danger/40 bg-danger/5 rounded-md p-3 break-words"
			>
				galat terakhir: {syncEngine.lastError}
			</p>
		{/if}

		<div class="space-y-1">
			<h3 class="text-xs font-black text-content">Penyimpanan Lokal</h3>
			{#if snapshot === null}
				<p class="text-xs text-content-muted">{placeholderText}</p>
			{:else}
				<p class="text-xs text-content-muted">
					watermark server (posisi cursor):
					<span class="font-mono font-bold text-content">{snapshot.cursor.value}</span>
					{#if snapshot.cursor.ageLabel}
						• diperbarui <span class="font-bold text-content">{snapshot.cursor.ageLabel}</span>
					{:else}
						• waktu maju terakhir tidak dicatat mesin
					{/if}
				</p>
			{/if}
			{#if readError}
				<p class="text-xs font-mono font-bold text-danger break-words" aria-live="polite">
					gagal membaca penyimpanan lokal: {readError}
				</p>
			{/if}
		</div>

		<div class="space-y-2">
			<h3 class="text-xs font-black text-content">Antrean Sinkronisasi (Outbox)</h3>
			{#if snapshot === null}
				<p class="text-xs text-content-muted">{placeholderText}</p>
			{:else if snapshot.rows.length === 0}
				<p
					class="text-xs font-bold text-content-muted text-center border-2 border-dashed border-border/60 rounded-md p-4"
				>
					Tidak ada perubahan tertunda
				</p>
			{:else}
				<p class="text-xs text-content-muted">
					menampilkan {snapshot.rows.length} dari {snapshot.total} perubahan tertunda
				</p>
				<div class="overflow-x-auto">
					<table class="w-full min-w-[26rem] border-collapse text-left text-xs">
						<thead>
							<tr class="border-b-2 border-border/20 text-content-muted">
								<th scope="col" class="py-2 pr-3 font-black">tabel</th>
								<th scope="col" class="py-2 pr-3 font-black">operasi</th>
								<th scope="col" class="py-2 pr-3 font-black">entitas</th>
								<th scope="col" class="py-2 pr-3 font-black">usia</th>
								<th scope="col" class="py-2 font-black">percobaan</th>
							</tr>
						</thead>
						<tbody>
							{#each snapshot.rows as row (row.id)}
								<tr class="border-b border-border/10 align-top">
									<td class="py-2 pr-3 font-bold text-content whitespace-nowrap">{row.table}</td>
									<td class="py-2 pr-3 text-content-muted whitespace-nowrap">{row.op}</td>
									<td class="py-2 pr-3 font-mono text-content-muted max-w-[10rem] truncate" title={row.entityId}>
										{row.entityId}
									</td>
									<td class="py-2 pr-3 text-content-muted whitespace-nowrap">{row.ageLabel}</td>
									<td class="py-2 tabular-nums text-content-muted">{row.retryCount}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="flex flex-col sm:flex-row gap-3 pt-1">
			<Button
				variant="secondary"
				loading={syncEngine.status === 'syncing'}
				onclick={handleSyncNow}
			>
				{syncEngine.status === 'syncing' ? 'Menyinkronkan…' : 'Sinkronkan sekarang'}
			</Button>
			<Button variant="outline" loading={reloading} onclick={handleReload}>
				{reloading ? 'Memuat ulang…' : 'Muat ulang data lokal'}
			</Button>
		</div>
	</Card>

	<!-- Keluar Akun -->
	<Card class="p-6 border-danger/40 bg-danger/5 space-y-3">
		<h2 class="text-base font-black text-danger">
			Keluar dari Sesi
		</h2>

		<form method="POST" action="?/logout" class="pt-2">
			<Button
				type="submit"
				variant="outline"
				class="border-danger text-danger hover:bg-danger hover:text-danger-foreground"
			>
				Keluar dari Akun
			</Button>
		</form>
	</Card>

	<div class="text-center pt-4">
		<p class="text-xs text-content-muted font-mono">
			Uangku v0.1.0 • Cloudflare Edge Architecture
		</p>
	</div>
</div>
