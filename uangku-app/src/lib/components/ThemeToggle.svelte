<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'system' | 'light' | 'dark';

	let theme = $state<Theme>('system');

	function applyTheme(next: Theme) {
		theme = next;
		localStorage.setItem('uangku-theme', next);
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = next === 'dark' || (next === 'system' && prefersDark);
		if (isDark) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}

	function cycleTheme() {
		if (theme === 'system') applyTheme('light');
		else if (theme === 'light') applyTheme('dark');
		else applyTheme('system');
	}

	onMount(() => {
		const saved = (localStorage.getItem('uangku-theme') as Theme) || 'system';
		theme = saved;

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleChange = () => {
			if (theme === 'system') {
				applyTheme('system');
			}
		};
		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	const label = $derived(
		theme === 'system'
			? 'Tema: ikut sistem'
			: theme === 'light'
				? 'Tema: terang'
				: 'Tema: gelap'
	);
</script>

<button
	type="button"
	onclick={cycleTheme}
	aria-label={label}
	title={label}
	class="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md border-2 border-border bg-surface hover:bg-surface-subtle text-content shadow-hard-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content transition-all duration-150"
>
	{#if theme === 'system'}
		<!-- Monitor / Komputer Icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-5"
			aria-hidden="true"
		>
			<rect width="20" height="14" x="2" y="3" rx="2" />
			<line x1="8" x2="16" y1="21" y2="21" />
			<line x1="12" x2="12" y1="17" y2="21" />
		</svg>
	{:else if theme === 'light'}
		<!-- Sun / Matahari Icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-5"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="m4.93 4.93 1.41 1.41" />
			<path d="m17.66 17.66 1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="m6.34 17.66-1.41 1.41" />
			<path d="m19.07 4.93-1.41 1.41" />
		</svg>
	{:else}
		<!-- Moon / Bulan Icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-5"
			aria-hidden="true"
		>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</svg>
	{/if}
</button>
