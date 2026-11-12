<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '../utils';

	interface Props extends HTMLInputAttributes {
		label?: string;
		error?: string;
		helper?: string;
		value?: string | number;
	}

	let {
		label,
		error,
		helper,
		id,
		value = $bindable(''),
		class: className = '',
		required = false,
		disabled = false,
		...rest
	}: Props = $props();

	// Generate stable ID fallback if not provided
	const inputId = $derived(id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined));
	const errorId = $derived(inputId ? `${inputId}-error` : undefined);
	const helperId = $derived(inputId ? `${inputId}-helper` : undefined);
</script>

<div class="flex flex-col gap-1.5 w-full font-sans">
	{#if label}
		<label for={inputId} class="text-xs font-bold uppercase tracking-wider text-content flex items-center justify-between">
			<span>
				{label}
				{#if required}
					<span class="text-expense ml-0.5" aria-hidden="true">*</span>
				{/if}
			</span>
		</label>
	{/if}

	<input
		id={inputId}
		bind:value
		{required}
		{disabled}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? errorId : helper ? helperId : undefined}
		class={cn(
			'min-h-[44px] w-full px-3.5 py-2.5 rounded-md border-2 bg-surface text-content text-sm font-medium transition-all duration-150',
			'placeholder:text-content-muted placeholder:opacity-70',
			'focus-visible:outline-none focus:border-border focus:shadow-hard-sm',
			'disabled:opacity-60 disabled:bg-surface-muted disabled:cursor-not-allowed',
			error ? 'border-expense focus:border-expense' : 'border-border',
			className
		)}
		{...rest}
	/>

	{#if error}
		<p id={errorId} class="text-xs font-semibold text-expense flex items-center gap-1 mt-0.5" role="alert">
			<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm.75-3.5a.75.75 0 0 1-1.5 0v-4a.75.75 0 0 1 1.5 0v4z"/>
			</svg>
			<span>{error}</span>
		</p>
	{:else if helper}
		<p id={helperId} class="text-xs text-content-muted mt-0.5">
			{helper}
		</p>
	{/if}
</div>
