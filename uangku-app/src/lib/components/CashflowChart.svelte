<script lang="ts">
	import { formatRupiah } from '$lib/utils';
	import { bucketLabel, bucketRange, type BucketGranularity } from '$lib/shared/dates';

	interface MonthData {
		month: string; // label sumbu, mis. "Jun" atau "3/11"
		income: number;
		expense: number;
		/** Kunci titik dari derivasi (`YYYY-MM-DD` harian/mingguan, `YYYY-MM` bulanan). */
		bucket?: string;
	}

	interface Props {
		data?: MonthData[];
		height?: number;
		granularity?: BucketGranularity;
		/** Membuat tautan daftar transaksi untuk satu titik. Tanpa ini tautan tidak dirender. */
		hrefForBucket?: (bucket: string) => string;
	}

	let { data = [], height = 180, granularity = 'month', hrefForBucket }: Props = $props();
	/** Titik yang dipilih user lewat tekan/Enter. `null` = belum ada pilihan. */
	let pickedIndex = $state<number | null>(null);
	/** Satu titik saja yang bisa di-Tab; panah kiri/kanan memindahkan fokus. */
	let tabSlot = $state(0);
	let slotEls: Array<SVGGElement | undefined> = [];

	const activeIndex = $derived(
		pickedIndex !== null && pickedIndex >= 0 && pickedIndex < data.length ? pickedIndex : null
	);

	const detail = $derived.by(() => {
		if (activeIndex === null) return null;
		const item = data[activeIndex];
		const bucket = item.bucket;
		const range = bucket ? bucketRange(bucket, granularity) : null;
		const net = item.income - item.expense;
		return {
			label: bucket ? bucketLabel(bucket, granularity) : item.month,
			income: item.income,
			expense: item.expense,
			net,
			href: range && bucket && hrefForBucket ? hrefForBucket(bucket) : null
		};
	});

	/** Label periode panjang untuk pembaca layar dan kolom tabel ringkasan. */
	const periodLabels = $derived(
		data.map((item) => (item.bucket ? bucketLabel(item.bucket, granularity) : item.month))
	);

	function pick(i: number) {
		pickedIndex = i;
		tabSlot = i;
	}

	function onSlotKeydown(event: KeyboardEvent, i: number) {
		const move = (target: number) => {
			if (target < 0 || target >= data.length) return;
			tabSlot = target;
			slotEls[target]?.focus();
		};
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			event.preventDefault();
			move(i + 1);
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			event.preventDefault();
			move(i - 1);
		} else if (event.key === 'Home') {
			event.preventDefault();
			move(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			move(data.length - 1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			pick(i);
		}
	}

	// Calculate peak value to scale bars accurately
	const maxValue = $derived.by(() => {
		if (data.length === 0) return 1000000;
		const maxVal = Math.max(
			...data.map((d) => Math.max(d.income, d.expense)),
			100000 // avoid div by zero
		);
		return maxVal;
	});

	// SVG viewport setup
	const svgHeight = $derived(height);
	const bottomPadding = 32;
	const topPadding = 20;
	const LEFT_GUTTER = 8;
	const RIGHT_GUTTER = 8;
	const chartAreaHeight = $derived(svgHeight - bottomPadding - topPadding);

	/**
	 * Lebar minimum satu slot.
	 *
	 * 44px saat perangkat punya layar sentuh (aturan target sentuh), 20px saat tetikus saja,
	 * supaya 30 titik harian masih muat di kartu desktop tanpa digeser.
	 */
	const MIN_SLOT_TOUCH = 44;
	const MIN_SLOT_POINTER = 20;
	/** Lebar maksimum satu slot: titik yang sedikit tidak direntangkan selebar seluruh kartu. */
	const MAX_SLOT = 96;
	/** Naik setiap kemampuan penunjuk bisa berubah; memaksa lebar slot dihitung ulang. */
	let pointerTick = $state(0);
	const minSlot = $derived.by(() => {
		pointerTick;
		const coarse =
			navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches;
		return coarse ? MIN_SLOT_TOUCH : MIN_SLOT_POINTER;
	});

	$effect(() => {
		const bump = () => (pointerTick += 1);
		const query = window.matchMedia('(any-pointer: coarse)');
		query.addEventListener('change', bump);
		window.addEventListener('resize', bump);
		window.addEventListener('pointerdown', bump, { passive: true });
		// Kemampuan sentuh kadang baru terbaca setelah paint pertama (webview/emulator),
		// jadi diukur ulang sekali di frame berikutnya.
		const raf = requestAnimationFrame(() => requestAnimationFrame(bump));
		return () => {
			cancelAnimationFrame(raf);
			query.removeEventListener('change', bump);
			window.removeEventListener('resize', bump);
			window.removeEventListener('pointerdown', bump);
		};
	});

	/**
	 * Lebar induk diukur, bukan ditebak dari `viewBox`.
	 *
	 * SVG digambar 1:1 dengan lebar viewBox-nya. Kalau `viewBox` lebih kecil dari elemennya,
	 * peramban mengecilkan seluruh grafik dan target sentuh 44px menyusut di bawah 44px.
	 */
	let hostEl: HTMLDivElement | undefined = $state();
	let hostWidth = $state(0);

	$effect(() => {
		if (!hostEl) return;
		const observer = new ResizeObserver((entries) => {
			hostWidth = entries[0]?.contentRect.width ?? 0;
		});
		observer.observe(hostEl);
		return () => observer.disconnect();
	});

	const slotWidth = $derived(
		Math.min(
			MAX_SLOT,
			Math.max(minSlot, (hostWidth - LEFT_GUTTER - RIGHT_GUTTER) / Math.max(1, data.length))
		)
	);
	const svgWidth = $derived(LEFT_GUTTER + RIGHT_GUTTER + slotWidth * Math.max(1, data.length));
	// Selalu dibatasi 4px: lebar negatif membuat batang tidak dirender sama sekali.
	const barWidth = $derived(Math.max(4, Math.min(24, (slotWidth - 6) / 2)));

	const barsVisible = $derived(data.length > 0);
	/** Grafik tidak muat: wadahnya diberi lebar minimum supaya bisa digeser, bukan dipadatkan. */
	const scrolls = $derived(svgWidth - hostWidth > 0.5);
	const wrapperMinWidth = $derived(scrolls ? `${svgWidth}px` : 'auto');
	const labelCapacity = $derived(Math.max(1, Math.floor(svgWidth / 38)));
	/** Jangan menggambar label lebih rapat dari ini supaya tidak bertumpuk. */
	const labelStep = $derived(Math.max(1, Math.ceil(data.length / labelCapacity)));

	// Screen reader summary description
	const chartDescription = $derived.by(() => {
		if (data.length === 0) return 'Grafik arus kas kosong, belum ada data transaksi.';
		const firstPeriod = data[0].month;
		const lastPeriod = data[data.length - 1].month;
		const totalInc = data.reduce((sum, d) => sum + d.income, 0);
		const totalExp = data.reduce((sum, d) => sum + d.expense, 0);
		return `Grafik arus kas dari periode ${firstPeriod} hingga ${lastPeriod}. Total pemasukan ${formatRupiah(totalInc)}, total pengeluaran ${formatRupiah(totalExp)}.`;
	});
</script>

<div class="w-full overflow-x-auto" bind:this={hostEl}>
	<div style="min-width: {wrapperMinWidth}">
		<!-- Accessible summary table for screen readers.
		     Pembungkus <div> wajib: `sr-only` pada <table> tidak memotong lebar
		     (overflow tidak berlaku untuk display:table) sehingga halaman bisa
		     digeser horizontal ±350px di ponsel. -->
		<div class="sr-only">
			<table>
				<caption>{chartDescription}</caption>
				<thead>
					<tr>
						<th scope="col">Periode</th>
						<th scope="col">Pemasukan</th>
						<th scope="col">Pengeluaran</th>
					</tr>
				</thead>
				<tbody>
					{#each data as item, i}
						<tr>
							<td>{periodLabels[i] ?? item.month}</td>
							<td>{formatRupiah(item.income)}</td>
							<td>{formatRupiah(item.expense)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- role="group", bukan "img": batangnya bisa difokuskan, dan role="img" akan
		     menyembunyikan anak-anaknya dari pembaca layar. -->
		<svg
			viewBox="0 0 {svgWidth} {svgHeight}"
			width={svgWidth}
			height={svgHeight}
		class="block font-sans mx-auto"
			role="group"
			aria-label="Grafik arus kas: batang pemasukan dan pengeluaran per periode"
		>
			<!-- Gridline nilai maksimum, sebagai acuan tinggi batang -->
			<line
				x1={LEFT_GUTTER}
				y1={topPadding}
				x2={svgWidth - RIGHT_GUTTER}
				y2={topPadding}
				stroke="var(--color-border)"
				stroke-width="1"
				stroke-dasharray="3 3"
				opacity="0.4"
			/>
			<text
				x={LEFT_GUTTER}
				y={topPadding - 6}
				class="fill-content-muted text-[10px] font-bold"
			>
				maks {formatRupiah(maxValue)}
			</text>

			<!-- Baseline zero line -->
			<line
				x1={LEFT_GUTTER}
				y1={svgHeight - bottomPadding}
				x2={svgWidth - RIGHT_GUTTER}
				y2={svgHeight - bottomPadding}
				stroke="var(--color-border)"
				stroke-width="2"
				stroke-dasharray="4 4"
			/>

			{#if !barsVisible}
				<text
					x={svgWidth / 2}
					y={svgHeight / 2}
					text-anchor="middle"
					class="fill-content-muted text-xs font-bold"
				>
					Belum ada data transaksi untuk ditampilkan
				</text>
			{:else}
				{#each data as item, i}
					{@const xCenter = LEFT_GUTTER + i * slotWidth + slotWidth / 2}
					{@const isActive = activeIndex === i}
					{@const incomeHeight = item.income > 0 ? Math.max(2, (item.income / maxValue) * chartAreaHeight) : 0}
					{@const expenseHeight = item.expense > 0 ? Math.max(2, (item.expense / maxValue) * chartAreaHeight) : 0}
					{@const incomeY = svgHeight - bottomPadding - incomeHeight}
					{@const expenseY = svgHeight - bottomPadding - expenseHeight}
					{@const showLabel = i % labelStep === 0 || i === data.length - 1}

					<!-- Satu titik: area tekan selebar slot, batang, label, dan fokus keyboard. -->
					<g
						class="slot cursor-pointer transition-opacity"
						class:opacity-60={activeIndex !== null && !isActive}
						role="button"
						tabindex={i === tabSlot ? 0 : -1}
						aria-label="{periodLabels[i] ?? item.month}: pemasukan {formatRupiah(item.income)}, pengeluaran {formatRupiah(item.expense)}"
						bind:this={slotEls[i]}
						onfocus={() => (tabSlot = i)}
						onclick={() => pick(i)}
						onkeydown={(event) => onSlotKeydown(event, i)}
					>
						{#if isActive}
							<!-- Penanda titik terpilih, di belakang batang. -->
							<rect
								x={LEFT_GUTTER + i * slotWidth + 1}
								y={topPadding - 12}
								width={slotWidth - 2}
								height={svgHeight - bottomPadding - topPadding + 12}
								rx="4"
								class="fill-surface-subtle"
							/>
						{/if}

						<!-- Income Bar (Green) -->
						{#if incomeHeight > 0}
							<rect
								x={xCenter - barWidth - 1}
								y={incomeY}
								width={barWidth}
								height={incomeHeight}
								class="fill-income stroke-border"
								stroke-width="2"
								rx="2"
							>
								<title>Pemasukan {item.month}: {formatRupiah(item.income)}</title>
							</rect>
						{/if}

						<!-- Expense Bar (Red) -->
						{#if expenseHeight > 0}
							<rect
								x={xCenter + 1}
								y={expenseY}
								width={barWidth}
								height={expenseHeight}
								class="fill-expense stroke-border"
								stroke-width="2"
								rx="2"
							>
								<title>Pengeluaran {item.month}: {formatRupiah(item.expense)}</title>
							</rect>
						{/if}

						<!-- Period Label: hanya sebagian, supaya tidak bertumpuk -->
						{#if showLabel}
							<text
								x={xCenter}
								y={svgHeight - 10}
								text-anchor="middle"
								class="fill-content text-[11px] font-bold"
							>
								{item.month}
							</text>
						{/if}

						<!-- Area tekan di atas segalanya, supaya tap di ruang kosong slot tetap kena. -->
						<rect
							class="hit"
							x={LEFT_GUTTER + i * slotWidth}
							y={topPadding}
							width={slotWidth}
							height={svgHeight - bottomPadding - topPadding}
							fill="transparent"
							stroke="transparent"
						/>
					</g>
				{/each}
			{/if}
		</svg>

		<!-- Nilai titik terpilih. aria-live: perubahan diumumkan tanpa memindahkan fokus. -->
		<div class="mt-2 pt-2 border-t-2 border-border/10" aria-live="polite">
			{#if detail}
				<div class="flex items-baseline justify-between gap-2">
					<p class="text-xs font-black text-content">{detail.label}</p>
					<p class="text-[11px] font-bold text-content-muted shrink-0">
						titik {(activeIndex ?? 0) + 1} dari {data.length}
					</p>
				</div>
				<dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 mt-1 text-[11px]">
					<div>
						<dt class="font-bold text-content-muted">Pemasukan</dt>
						<dd class="font-mono font-bold tabular-nums text-income">
							+{formatRupiah(detail.income)}
						</dd>
					</div>
					<div>
						<dt class="font-bold text-content-muted">Pengeluaran</dt>
						<dd class="font-mono font-bold tabular-nums text-expense">
							-{formatRupiah(detail.expense)}
						</dd>
					</div>
					<div>
						<dt class="font-bold text-content-muted">Selisih</dt>
						<dd
							class="font-mono font-bold tabular-nums {detail.net >= 0 ? 'text-income' : 'text-expense'}"
						>
							{detail.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(detail.net))}
						</dd>
					</div>
				</dl>
				{#if detail.href}
					<a
						href={detail.href}
						class="mt-1 inline-flex items-center min-h-[44px] text-[11px] font-bold text-brand underline"
					>
						Lihat transaksi periode ini
					</a>
				{/if}
			{:else}
				<p class="text-[11px] text-content-muted">
					Tekan batang untuk melihat nilainya.
				</p>
			{/if}
		</div>

		<!-- Legend -->
		<div class="flex items-center justify-center gap-6 mt-2 pt-2 border-t-2 border-border/10 text-xs font-bold">
			<div class="flex items-center gap-2">
				<span class="w-3.5 h-3.5 rounded-xs bg-income border-2 border-border"></span>
				<span class="text-content">Pemasukan</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="w-3.5 h-3.5 rounded-xs bg-expense border-2 border-border"></span>
				<span class="text-content">Pengeluaran</span>
			</div>
		</div>
		{#if scrolls}
			<p class="text-[11px] text-content-muted text-center mt-1">
				{data.length} titik. Geser grafik ke samping untuk melihat semuanya.
			</p>
		{/if}
	</div>
</div>

<style>
	/* Fokus keyboard digambar sendiri: cincin bawaan tidak selalu terlihat di elemen SVG. */
	.slot:focus-visible {
		outline: none;
	}
	.slot:focus-visible .hit {
		stroke: var(--color-brand);
		stroke-width: 3;
		stroke-dasharray: 5 3;
	}
</style>
