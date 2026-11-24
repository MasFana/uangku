<script lang="ts">
	import { formatRupiah } from '$lib/utils';
	import {
		bucketLabel,
		bucketRange,
		jakartaMonthKey,
		todayInJakarta,
		toUtcDateString,
		type BucketGranularity
	} from '$lib/shared/dates';

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
	/** Titik yang dipilih user. `null` = belum ada pilihan, nilai tidak ditampilkan. */
	let pickedIndex = $state<number | null>(null);
	/** Pilihan dari klik/Enter bertahan sampai ditutup; pilihan dari hover saja tidak. */
	let pinned = $state(false);
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
		const net = item.income - item.expense;
		return {
			label: bucket ? bucketLabel(bucket, granularity) : item.month,
			income: item.income,
			expense: item.expense,
			net,
			href: bucket && hrefForBucket && bucketRange(bucket, granularity) ? hrefForBucket(bucket) : null
		};
	});

	/** Teks untuk pembaca layar: nilai titik terpilih, diumumkan tanpa memindahkan fokus. */
	const announcement = $derived(
		detail
			? `${detail.label}. Pemasukan ${formatRupiah(detail.income)}, pengeluaran ${formatRupiah(detail.expense)}, selisih ${detail.net >= 0 ? 'plus' : 'minus'} ${formatRupiah(Math.abs(detail.net))}.`
			: ''
	);

	/** Label periode panjang untuk pembaca layar dan kolom tabel ringkasan. */
	const periodLabels = $derived(
		data.map((item) => (item.bucket ? bucketLabel(item.bucket, granularity) : item.month))
	);

	function pick(i: number, fromPointer = false) {
		pickedIndex = i;
		tabSlot = i;
		pinned = !fromPointer;
	}

	function clearPick() {
		pickedIndex = null;
		pinned = false;
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
		} else if (event.key === 'Escape') {
			clearPick();
		}
	}

	// Calculate peak value to scale bars accurately
	const maxValue = $derived.by(() => {
		if (data.length === 0) return 1000000;
		return Math.max(...data.map((d) => Math.max(d.income, d.expense)), 100000);
	});

	// SVG viewport setup
	const svgHeight = $derived(height);
	const bottomPadding = 32;
	const topPadding = 10;
	const LEFT_GUTTER = 8;
	const RIGHT_GUTTER = 8;
	const chartAreaHeight = $derived(svgHeight - bottomPadding - topPadding);
	const plotBottom = $derived(svgHeight - bottomPadding);

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
		// Penjaga SSR: halaman grafik memang `ssr = false`, tetapi derivasi ini tidak
		// boleh melempar kalau komponennya dipakai di halaman yang dirender di server.
		const coarse =
			typeof navigator !== 'undefined' &&
			(navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches);
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
	let scrollLeft = $state(0);
	let atStart = $state(true);
	let atEnd = $state(true);

	$effect(() => {
		if (!hostEl) return;
		const observer = new ResizeObserver((entries) => {
			hostWidth = entries[0]?.contentRect.width ?? 0;
			readScroll();
		});
		observer.observe(hostEl);
		readScroll();
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
	/** Grafik tidak muat: wadahnya bisa digeser, bukan dipadatkan. */
	const scrolls = $derived(svgWidth - hostWidth > 0.5);
	/** Grafik yang muat dipusatkan; saat digeser, SVG menempel di kiri wadah. */
	const svgLeft = $derived(scrolls ? 0 : Math.max(0, (hostWidth - svgWidth) / 2));
	const labelCapacity = $derived(Math.max(1, Math.floor(svgWidth / 38)));
	/** Jangan menggambar label lebih rapat dari ini supaya tidak bertumpuk. */
	const labelStep = $derived(Math.max(1, Math.ceil(data.length / labelCapacity)));

	/** Titik yang berisi hari ini (waktu Jakarta): acuan posisi geser awal. */
	const todayIndex = $derived.by(() => {
		if (data.length === 0) return null;
		const today = toUtcDateString(todayInJakarta());
		if (granularity === 'month') {
			const key = jakartaMonthKey();
			return data.findIndex((d) => d.bucket === key);
		}
		if (granularity === 'day') return data.findIndex((d) => d.bucket === today);
		return data.findIndex((d) => {
			const range = d.bucket ? bucketRange(d.bucket, 'week') : null;
			return range ? range.startDate <= today && today <= range.endDate : false;
		});
	});

	/**
	 * Geser awal: titik terdekat dengan hari ini diletakkan di tengah wadah.
	 *
	 * Sekali per kombinasi data + lebar wadah, supaya geseran manual user tidak ditarik balik.
	 */
	let centeredKey = $state('');
	$effect(() => {
		const key = `${data.length}|${granularity}|${slotWidth}|${Math.round(hostWidth)}`;
		if (!hostEl || !scrolls || hostWidth === 0 || key === centeredKey) return;
		centeredKey = key;
		if (todayIndex === null || todayIndex < 0) return;
		const center = svgLeft + LEFT_GUTTER + todayIndex * slotWidth + slotWidth / 2;
		hostEl.scrollLeft = Math.max(0, center - hostWidth / 2);
		readScroll();
	});

	function readScroll() {
		if (!hostEl) return;
		scrollLeft = hostEl.scrollLeft;
		atStart = scrollLeft <= 1;
		atEnd = scrollLeft + hostEl.clientWidth >= hostEl.scrollWidth - 1;
	}

	/** Klik di luar grafik menutup nilai; Escape juga menutupnya. */
	let plotEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		const onDown = (event: PointerEvent) => {
			if (plotEl?.contains(event.target as Node)) return;
			clearPick();
		};
		document.addEventListener('pointerdown', onDown);
		return () => document.removeEventListener('pointerdown', onDown);
	});

	/** Ukuran tooltip diukur, bukan ditebak: dipakai untuk menjepit posisinya di dalam kartu. */
	let tooltipEl: HTMLDivElement | undefined = $state();
	let tooltipH = $state(0);
	let tooltipW = $state(196);
	$effect(() => {
		if (!tooltipEl) {
			tooltipH = 0;
			return;
		}
		const rect = tooltipEl.getBoundingClientRect();
		if (Math.abs(rect.height - tooltipH) > 0.5) tooltipH = rect.height;
		if (Math.abs(rect.width - tooltipW) > 0.5) tooltipW = rect.width;
	});

	/**
	 * Posisi tooltip.
	 *
	 * Menempel di ujung batang terpilih: di atas kalau masih ada ruang, kalau tidak di bawah
	 * ujung batang. Sumbu X dijepit di dalam kartu, jadi tooltip tidak pernah terpotong.
	 */
	const tooltipPos = $derived.by(() => {
		if (activeIndex === null || !detail) return null;
		const item = data[activeIndex];
		const incomeHeight =
			item.income > 0 ? Math.max(2, (item.income / maxValue) * chartAreaHeight) : 0;
		const expenseHeight =
			item.expense > 0 ? Math.max(2, (item.expense / maxValue) * chartAreaHeight) : 0;
		const barTopY = plotBottom - Math.max(incomeHeight, expenseHeight);
		const centerX = svgLeft + LEFT_GUTTER + activeIndex * slotWidth + slotWidth / 2;
		const visibleCenter = centerX - scrollLeft;
		// Titik yang sudah tergeser keluar layar tidak perlu tooltip.
		if (visibleCenter < -slotWidth / 2 || visibleCenter > hostWidth + slotWidth / 2) return null;
		if (tooltipH === 0) return { left: 0, top: 0, tailLeft: 0, below: false, hidden: true };
		const left = Math.max(
			2,
			Math.min(hostWidth - tooltipW - 2, visibleCenter - tooltipW / 2)
		);
		const above = barTopY - tooltipH - 10;
		const below = above < 2;
		const top = below
			? Math.min(barTopY + 10, Math.max(2, plotBottom - tooltipH))
			: above;
		const tailLeft = Math.max(8, Math.min(tooltipW - 16, visibleCenter - left - 5));
		return { left, top, tailLeft, below, hidden: false };
	});

	// Screen reader summary description
	const chartDescription = $derived.by(() => {
		if (data.length === 0) return 'Grafik arus kas kosong, belum ada data transaksi.';
		const firstPeriod = periodLabels[0] ?? data[0].month;
		const lastPeriod = periodLabels[data.length - 1] ?? data[data.length - 1].month;
		const totalInc = data.reduce((sum, d) => sum + d.income, 0);
		const totalExp = data.reduce((sum, d) => sum + d.expense, 0);
		return `Grafik arus kas dari periode ${firstPeriod} hingga ${lastPeriod}. Total pemasukan ${formatRupiah(totalInc)}, total pengeluaran ${formatRupiah(totalExp)}.`;
	});
</script>

<div class="space-y-1.5">
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

	<!-- Baris skala: tetap, tidak ikut tergeser bersama batang -->
	<div class="flex items-baseline justify-between gap-2 text-[10px] font-bold text-content-muted">
		<span class="truncate">maks {formatRupiah(maxValue)}</span>
		{#if scrolls}
			<span class="shrink-0 whitespace-nowrap">{data.length} titik · geser →</span>
		{/if}
	</div>

	<!-- Kotak plot: hanya SVG di dalamnya yang digeser. -->
	<div class="relative" bind:this={plotEl}>
		<div class="overflow-x-auto" bind:this={hostEl} onscroll={readScroll}>
			<!-- role="group", bukan "img": batangnya bisa difokuskan, dan role="img" akan
			     menyembunyikan anak-anaknya dari pembaca layar. -->
			<svg
				width={svgWidth}
				height={svgHeight}
				viewBox="0 0 {svgWidth} {svgHeight}"
				class="block mx-auto"
				role="group"
				aria-label="Grafik arus kas: batang pemasukan dan pengeluaran per periode"
				onpointerout={(event) => {
					// Tetikus: nilai hilang saat kursor keluar grafik. Sentuh: pilihan tetap sampai ditutup.
					// `pointerout` menyala untuk tiap anak, jadi periksa elemen tujuan kursor.
					const next = event.relatedTarget as Node | null;
					if (event.pointerType === 'mouse' && !pinned && !(next && plotEl?.contains(next))) {
						clearPick();
					}
				}}
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

				<!-- Baseline zero line -->
				<line
					x1={LEFT_GUTTER}
					y1={plotBottom}
					x2={svgWidth - RIGHT_GUTTER}
					y2={plotBottom}
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
						{@const incomeY = plotBottom - incomeHeight}
						{@const expenseY = plotBottom - expenseHeight}
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
							onpointerover={(event) => {
								if (event.pointerType === 'mouse' && !pinned) pick(i, true);
							}}
							onkeydown={(event) => onSlotKeydown(event, i)}
						>
							{#if isActive}
								<!-- Penanda titik terpilih, di belakang batang. -->
								<rect
									x={LEFT_GUTTER + i * slotWidth + 1}
									y={topPadding - 8}
									width={slotWidth - 2}
									height={plotBottom - topPadding + 8}
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
								height={plotBottom - topPadding}
								fill="transparent"
								stroke="transparent"
							/>
						</g>
					{/each}
				{/if}
			</svg>
		</div>

		<!-- Tanda tepi: menandakan masih ada batang di luar layar. Menempel, tidak ikut geser. -->
		{#if scrolls && !atStart}
			<div
				class="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-surface to-transparent"
				aria-hidden="true"
			></div>
		{/if}
		{#if scrolls && !atEnd}
			<div
				class="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-surface to-transparent"
				aria-hidden="true"
			></div>
		{/if}

		<!-- Tooltip: menempel pada batang terpilih, mengapung di atas grafik (tanpa menggeser tata letak). -->
		{#if detail && tooltipPos}
			<div
				bind:this={tooltipEl}
				class="pointer-events-none absolute z-10 w-max max-w-[calc(100vw-2.5rem)] rounded-md border-2 border-border bg-surface px-2.5 py-1.5 shadow-hard-sm"
				class:invisible={tooltipPos.hidden}
				style="left: {tooltipPos.left}px; top: {tooltipPos.top}px;"
				role="tooltip"
				aria-hidden="true"
			>
				<p class="text-xs font-black text-content whitespace-nowrap">{detail.label}</p>
				<p class="mt-0.5 flex items-baseline gap-2 font-mono text-[11px] font-bold tabular-nums whitespace-nowrap">
					<span class="text-income">+{formatRupiah(detail.income)}</span>
					<span class="text-expense">-{formatRupiah(detail.expense)}</span>
				</p>
				<p
					class="font-mono text-[11px] font-bold tabular-nums whitespace-nowrap {detail.net >= 0
						? 'text-income'
						: 'text-expense'}"
				>
					Selisih {detail.net >= 0 ? '+' : '-'}{formatRupiah(Math.abs(detail.net))}
				</p>
				<span
					class="absolute h-2 w-2 rotate-45 border-border bg-surface"
					class:border-b-2={!tooltipPos.below}
					class:border-r-2={!tooltipPos.below}
					class:border-t-2={tooltipPos.below}
					class:border-l-2={tooltipPos.below}
					class:-bottom-1={!tooltipPos.below}
					class:-top-1={tooltipPos.below}
					style="left: {tooltipPos.tailLeft}px;"
					aria-hidden="true"
				></span>
			</div>
		{/if}
	</div>

	<!-- Baris tetap di bawah grafik: tautan 44px, tidak pernah mengubah tinggi kartu. -->
	<div class="flex min-h-[44px] items-center border-t-2 border-border/10 pt-1">
		{#if detail?.href}
			<a
				href={detail.href}
				class="inline-flex items-center min-h-[44px] text-[11px] font-bold text-brand underline whitespace-nowrap"
			>
				Lihat transaksi periode ini
			</a>
		{:else}
			<p class="text-[11px] text-content-muted">
				{detail ? 'Nilai titik ada di tooltip di atas batang.' : 'Tekan batang untuk melihat nilainya.'}
			</p>
		{/if}
	</div>

	<p class="sr-only" aria-live="polite">{announcement}</p>

	<!-- Legend -->
	<div
		class="flex items-center justify-center gap-6 border-t-2 border-border/10 pt-2 text-xs font-bold"
	>
		<div class="flex items-center gap-2 whitespace-nowrap">
			<span class="w-3.5 h-3.5 rounded-xs bg-income border-2 border-border"></span>
			<span class="text-content">Pemasukan</span>
		</div>
		<div class="flex items-center gap-2 whitespace-nowrap">
			<span class="w-3.5 h-3.5 rounded-xs bg-expense border-2 border-border"></span>
			<span class="text-content">Pengeluaran</span>
		</div>
	</div>
	{#if scrolls}
		<p class="sr-only">
			Grafik berisi {data.length} titik. Geser grafik ke samping untuk melihat semuanya.
		</p>
	{/if}
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
