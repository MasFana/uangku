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
	const topPadding = 16;
	const chartAreaHeight = $derived(svgHeight - bottomPadding - topPadding);
</script>

<div class="w-full overflow-x-auto">
	<div class="min-w-[320px] w-full">
		<svg
			viewBox="0 0 480 {svgHeight}"
			class="w-full overflow-visible font-sans"
			role="img"
			aria-label="Grafik arus kas 6 bulan terakhir"
		>
			<!-- Baseline zero line -->
			<line
				x1="10"
				y1={svgHeight - bottomPadding}
				x2="470"
				y2={svgHeight - bottomPadding}
				stroke="var(--color-border)"
				stroke-width="2"
				stroke-dasharray="4 4"
			/>

			{#if data.length === 0}
				<text
					x="240"
					y={svgHeight / 2}
					text-anchor="middle"
					class="fill-content-muted text-xs font-bold"
				>
					Belum ada data transaksi untuk ditampilkan
				</text>
			{:else}
				{#each data as item, i}
					{@const slotWidth = 460 / data.length}
					{@const xCenter = 10 + i * slotWidth + slotWidth / 2}
					{@const barWidth = Math.min(18, (slotWidth - 12) / 2)}
					
					{@const incomeHeight = Math.max(3, (item.income / maxValue) * chartAreaHeight)}
					{@const expenseHeight = Math.max(3, (item.expense / maxValue) * chartAreaHeight)}
					
					{@const incomeY = svgHeight - bottomPadding - incomeHeight}
					{@const expenseY = svgHeight - bottomPadding - expenseHeight}

					<!-- Group for each month -->
					<g class="transition-opacity hover:opacity-90">
						<!-- Income Bar (Green) -->
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

						<!-- Expense Bar (Red) -->
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

						<!-- Month Label -->
						<text
							x={xCenter}
							y={svgHeight - 10}
							text-anchor="middle"
							class="fill-content text-[11px] font-bold"
						>
							{item.month}
						</text>
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
	</div>
</div>
