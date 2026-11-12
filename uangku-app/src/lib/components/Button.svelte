<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '../utils';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'outline' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		loading?: boolean;
		children?: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		class: className = '',
		children,
		type = 'button',
		...rest
	}: Props = $props();

	const variantClasses = {
		primary: 'bg-brand text-brand-foreground border-border hover:bg-brand-hover shadow-hard-sm',
		secondary: 'bg-surface text-content border-border hover:bg-surface-subtle shadow-hard-sm',
		accent: 'bg-accent text-neutral-900 border-border hover:brightness-95 shadow-hard-sm',
		danger: 'bg-expense text-expense-foreground border-border hover:brightness-90 shadow-hard-sm',
		outline: 'bg-transparent text-content border-border hover:bg-surface shadow-hard-sm',
		ghost: 'bg-transparent text-content border-transparent hover:bg-surface-subtle hover:border-border'
	};

	const sizeClasses = {
		sm: 'min-h-[36px] px-3 py-1.5 text-xs font-semibold gap-1.5',
		md: 'min-h-[44px] px-4 py-2.5 text-sm font-bold gap-2',
		lg: 'min-h-[48px] px-6 py-3 text-base font-bold gap-2.5'
	};
</script>

<button
	{type}
	disabled={disabled || loading}
	aria-busy={loading ? 'true' : undefined}
	class={cn(
		'inline-flex items-center justify-center rounded-md border-2 font-sans select-none transition-all duration-150',
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content',
		'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
		'disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none disabled:transform-none disabled:shadow-none',
		variantClasses[variant],
		sizeClasses[size],
		className
	)}
	{...rest}
>
	{#if loading}
		<svg
			class="animate-spin -ml-0.5 h-4 w-4 text-current"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			></path>
		</svg>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>
