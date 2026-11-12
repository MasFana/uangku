<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';

	interface Props {
		title: string;
		description: string;
		actionLabel?: string;
		actionHref?: string;
		onAction?: () => void;
		onclick?: () => void;
		icon?: Snippet;
	}

	let {
		title,
		description,
		actionLabel,
		actionHref,
		onAction,
		onclick: onClickProp,
		icon
	}: Props = $props();

	const handleAction = () => {
		if (onAction) onAction();
		if (onClickProp) onClickProp();
	};
</script>

<div class="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-border/60 rounded-lg bg-surface/50">
	<div class="w-14 h-14 rounded-full border-2 border-border bg-accent/40 flex items-center justify-center mb-3 shadow-hard-sm" aria-hidden="true">
		{#if icon}
			{@render icon()}
		{:else}
			<svg class="w-7 h-7 text-content" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
				<path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
				<path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
			</svg>
		{/if}
	</div>

	<h3 class="text-base font-bold text-content mb-1">
		{title}
	</h3>
	<p class="text-xs text-content-muted max-w-xs mb-4 leading-relaxed">
		{description}
	</p>

	{#if actionLabel}
		{#if actionHref}
			<a
				href={actionHref}
				class="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md border-2 border-border bg-brand text-brand-foreground font-bold text-sm shadow-hard-sm hover:bg-brand-hover active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
			>
				{actionLabel}
			</a>
		{:else if onAction || onClickProp}
			<Button variant="primary" size="md" onclick={handleAction}>
				{actionLabel}
			</Button>
		{/if}
	{/if}
</div>
