<script lang="ts">
	import { formatRupiah } from '$lib/utils';
	import Input from './Input.svelte';

	interface Props {
		name?: string;
		id?: string;
		value?: number;
		label?: string;
		error?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		class?: string;
	}

	let {
		name = 'amount',
		id = 'amount-input',
		value = $bindable(0),
		label = 'Nominal (Rp)',
		error,
		placeholder = '0',
		required = false,
		disabled = false,
		class: className
	}: Props = $props();

	// Raw string displayed in input field with live dot formatting
	let displayValue = $state(value ? Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		// Keep only numeric characters
		const rawDigits = target.value.replace(/\D/g, '');
		const num = rawDigits ? parseInt(rawDigits, 10) : 0;
		value = num;
		displayValue = rawDigits ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
	}
</script>

<div class="w-full space-y-1.5">
	{#if label}
		<label for={id} class="block text-sm font-bold text-content">
			{label}
			{#if required}
				<span class="text-danger" aria-hidden="true">*</span>
			{/if}
		</label>
	{/if}

	<div class="relative">
		<span
			class="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-base text-content-muted pointer-events-none select-none"
		>
			Rp
		</span>
		<input
			type="text"
			inputmode="numeric"
			{id}
			value={displayValue}
			oninput={handleInput}
			{placeholder}
			{disabled}
			{required}
			class="w-full min-h-[44px] pl-10 pr-3 py-2 text-base font-bold font-mono tabular-nums rounded-md border-2 border-border bg-surface text-content transition-all duration-150 placeholder:text-content-subtle placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-content focus:border-border disabled:opacity-50 disabled:cursor-not-allowed shadow-hard-xs {error ? 'border-danger focus:ring-danger' : ''} {className || ''}"
		/>
	</div>

	<!-- Hidden input transmitting exact integer rupiah value for form submissions -->
	<input type="hidden" {name} value={value} />

	{#if error}
		<p class="text-xs font-bold text-danger">{error}</p>
	{/if}
</div>
