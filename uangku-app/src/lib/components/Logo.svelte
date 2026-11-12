<script lang="ts">
	interface Props {
		size?: 'sm' | 'md' | 'lg';
		showText?: boolean;
		class?: string;
	}

	let { size = 'md', showText = true, class: className = '' }: Props = $props();

	const boxSize = $derived(
		size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
	);
	const textSize = $derived(
		size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl'
	);
</script>

<div class="inline-flex items-center gap-2.5 font-bold tracking-tight select-none {className}">
	<!-- Brutalist Monogram "U" -->
	<div
		class="relative inline-flex items-center justify-center shrink-0 {boxSize} rounded-md bg-brand border-2 border-border shadow-hard-sm transition-transform"
		aria-hidden="true"
	>
		<svg
			viewBox="0 0 32 32"
			class="w-3/5 h-3/5"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M8 8V18C8 22.4183 11.5817 26 16 26C20.4183 26 24 22.4183 24 18V8H19.5V17.5C19.5 19.433 17.933 21 16 21C14.067 21 12.5 19.433 12.5 17.5V8H8Z"
				fill="#FFFFFF"
				stroke="var(--color-border)"
				stroke-width="1.75"
				stroke-linejoin="round"
			/>
		</svg>
	</div>

	{#if showText}
		<span class="font-extrabold text-content {textSize} tracking-tight">
			Uangku
		</span>
	{/if}
</div>
