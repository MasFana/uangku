<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../utils';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: 'default' | 'subtle' | 'accent' | 'brand';
		shadow?: 'none' | 'sm' | 'base' | 'lg';
		children?: Snippet;
	}

	let {
		variant = 'default',
		shadow = 'base',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const variantStyles = {
		default: 'bg-surface text-content border-border',
		subtle: 'bg-surface-subtle text-content border-border',
		accent: 'bg-accent text-neutral-900 border-border',
		brand: 'bg-brand text-brand-foreground border-border'
	};

	const shadowStyles = {
		none: '',
		sm: 'shadow-hard-sm',
		base: 'shadow-hard',
		lg: 'shadow-hard-lg'
	};
</script>

<div
	class={cn(
		'rounded-lg border-2 p-4 md:p-6 transition-all duration-150',
		variantStyles[variant],
		shadowStyles[shadow],
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</div>
