<script lang="ts">
	import { formatRupiah } from '$lib/utils';

	interface MonthData {
		month: string; // e.g. "Jun", "Jul", "2026-06"
		income: number;
		expense: number;
	}

	interface Props {
		data: MonthData[];
		height?: number;
	}

	let { data = [], height = 180 }: Props = $props();

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

	/** Lebar minimum satu slot supaya dua batang + jarak tetap terbaca (>= 9px per batang). */
	const MIN_SLOT = 30;
	/** Lebar viewBox saat titik sedikit; di atas ini grafik digeser mendatar. */
	const BASE_WIDTH = 460;

	const slotWidth = $derived(Math.max(MIN_SLOT, (BASE_WIDTH - LEFT_GUTTER - RIGHT_GUTTER) / Math.max(1, data.length)));
	const svgWidth = $derived(LEFT_GUTTER + RIGHT_GUTTER + slotWidth * Math.max(1, data.length));
	// Selalu dibatasi 2px: lebar negatif membuat batang tidak dirender sama sekali.
	const barWidth = $derived(Math.max(2, Math.min(18, (slotWidth - 12) / 2)));

	const barsVisible = $derived(data.length > 0);
	/** Di atas lebar ini grafik digeser mendatar supaya batang tidak mengecil. */
	const MIN_VISIBLE_WIDTH = 340;
	const wrapperMinWidth = $derived(svgWidth > MIN_VISIBLE_WIDTH ? `${svgWidth}px` : 'auto');
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

<div class="w-full overflow-x-auto">
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
					{#each data as item}
						<tr>
							<td>{item.month}</td>
							<td>{formatRupiah(item.income)}</td>
							<td>{formatRupiah(item.expense)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<svg
			viewBox="0 0 {svgWidth} {svgHeight}"
			class="w-full block font-sans"
			role="img"
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
					{@const incomeHeight = item.income > 0 ? Math.max(2, (item.income / maxValue) * chartAreaHeight) : 0}
					{@const expenseHeight = item.expense > 0 ? Math.max(2, (item.expense / maxValue) * chartAreaHeight) : 0}
					{@const incomeY = svgHeight - bottomPadding - incomeHeight}
					{@const expenseY = svgHeight - bottomPadding - expenseHeight}
					{@const showLabel = i % labelStep === 0 || i === data.length - 1}

					<!-- Group for each period -->
					<g class="transition-opacity hover:opacity-90">
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
					</g>
				{/each}
			{/if}
		</svg>

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
		{#if data.length > labelCapacity}
			<p class="text-[11px] text-content-muted text-center mt-1">
				{data.length} titik. Geser grafik ke samping untuk melihat semuanya.
			</p>
		{/if}
	</div>
</div>
