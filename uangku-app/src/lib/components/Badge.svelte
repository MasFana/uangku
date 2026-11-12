<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../utils';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		variant?: 'income' | 'expense' | 'transfer' | 'neutral' | 'brand';
		children?: Snippet;
	}

	let {
		variant = 'neutral',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const variantStyles = {
		income: 'bg-income text-income-foreground border-border',
		expense: 'bg-expense text-expense-foreground border-border',
		transfer: 'bg-transfer text-transfer-foreground border-border',
		brand: 'bg-brand text-brand-foreground border-border',
		neutral: 'bg-surface-subtle text-content border-border'
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 px-2.5 py-0.5 rounded border-[1.5px] text-xs font-bold uppercase tracking-wider select-none',
		variantStyles[variant],
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</span>
