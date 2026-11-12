<script lang="ts">
	import { cn } from '$lib/utils';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		class?: string;
	}

	let { class: className, ...restProps }: Props = $props();
</script>

<div
	class={cn('animate-pulse rounded-md bg-surface-subtle border-2 border-border/20', className)}
	aria-hidden="true"
	{...restProps}
></div>
