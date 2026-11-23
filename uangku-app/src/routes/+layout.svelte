<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Logo from '../lib/components/Logo.svelte';
	import ThemeToggle from '../lib/components/ThemeToggle.svelte';
	import { syncEngine } from '$lib/client/sync/engine.svelte';
	import {
		SITE_NAME,
		SITE_TITLE,
		SITE_DESCRIPTION,
		OG_IMAGE_PATH,
		OG_IMAGE_WIDTH,
		OG_IMAGE_HEIGHT,
		OG_IMAGE_ALT,
		absoluteUrl,
		webApplicationJsonLd
	} from '$lib/shared/seo';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	// Keyed on the session user: first load inits, an account switch in-place
	// re-inits (the engine disposes the previous user's DB + outbox), logout empties the store.
	$effect(() => {
		const userId = page.data.user?.id ?? null;
		if (userId) void syncEngine.init(userId);
		else syncEngine.dispose();
	});

	// Check if current route is an auth page (login/register) to simplify shell
	const isAuthPage = $derived(
		page.url.pathname.startsWith('/login') || page.url.pathname.startsWith('/register')
	);

	// Peta rute tunggal untuk header, nav desktop, dan nav bawah
	const routeMap: Record<string, string> = {
		'/': 'Uangku',
		'/transactions': 'Transaksi',
		'/analytics': 'Analisis',
		'/wallets': 'Dompet',
		'/categories': 'Kategori',
		'/settings': 'Setelan'
	};

	const currentTitle = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/') return 'Uangku';
		for (const [route, label] of Object.entries(routeMap)) {
			if (route !== '/' && path.startsWith(route)) {
				return label;
			}
		}
		return 'Uangku';
	});
	// Kartu bagikan butuh URL absolut, jadi origin diambil dari permintaan yang sedang dilayani.
	// canonical selalu menunjuk dirinya sendiri: kedua host (workers.dev dan domain sendiri)
	// menyajikan halaman yang sama, dan tidak ada yang diklaim sebagai duplikat host lain.
	const origin = $derived(page.url.origin);
	const canonical = $derived(absoluteUrl(origin, page.url.pathname));
	const ogImage = $derived(absoluteUrl(origin, OG_IMAGE_PATH));
	const jsonLd = $derived(JSON.stringify(webApplicationJsonLd(origin)).replace(/</g, '\\u003c'));

	const desktopNavItems = [
		{ label: 'Beranda', href: '/' },
		{ label: routeMap['/transactions'], href: '/transactions' },
		{ label: routeMap['/analytics'], href: '/analytics' },
		{ label: routeMap['/wallets'], href: '/wallets' },
		{ label: routeMap['/categories'], href: '/categories' },
		{ label: routeMap['/settings'], href: '/settings' }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<!-- Ikon, manifest, dan theme-color ada di src/app.html supaya tidak ada dua nilai
	     yang berbeda untuk satu meta. Di sini hanya tag bagikan yang butuh origin permintaan. -->
	<link rel="canonical" href={canonical} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="id_ID" />
	<meta property="og:title" content={SITE_TITLE} />
	<meta property="og:description" content={SITE_DESCRIPTION} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={OG_IMAGE_ALT} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SITE_TITLE} />
	<meta name="twitter:description" content={SITE_DESCRIPTION} />
	<meta name="twitter:image" content={ogImage} />
	<!-- Svelte tidak menerjemahkan ekspresi di dalam tag <script>, jadi blok ini disisipkan
	     sebagai HTML mentah. Isinya konstanta, bukan masukan pengguna. -->
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<!-- Skip to content for keyboard accessibility (WCAG AA) -->
<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand focus:text-brand-foreground focus:border-2 focus:border-border focus:shadow-hard font-bold text-sm rounded"
>
	Lewati ke konten utama
</a>

<div class="min-h-screen flex flex-col bg-canvas text-content font-sans antialiased">
	<!-- Top App Header -->
	<header class="sticky top-0 z-30 w-full border-b-2 border-border bg-surface/95 backdrop-blur-xs">
		<div class="max-w-4xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between gap-3">
			<div class="flex items-center gap-3 min-w-0">
				<a
					href="/"
					class="min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-content rounded-md shrink-0"
					aria-label="Uangku, beranda"
				>
					<Logo size="md" showText={false} />
				</a>
				<span class="text-base sm:text-lg font-black tracking-tight text-content truncate">
					{currentTitle}
				</span>
			</div>

			{#if !isAuthPage}
				<!-- Desktop Navigation Links -->
				<nav class="hidden md:flex items-center gap-1" aria-label="Navigasi Desktop">
					{#each desktopNavItems as item}
						<a
							href={item.href}
							class="min-h-[44px] px-3.5 py-2 rounded-md font-bold text-sm transition-all duration-150 flex items-center border-2 {isActive(item.href)
								? 'bg-brand text-brand-foreground border-border shadow-hard-sm'
								: 'border-transparent text-content hover:border-border hover:bg-surface-subtle'}"
						>
							{item.label}
						</a>
					{/each}
				</nav>

				<div class="flex items-center gap-2 shrink-0">
					<!-- Sync state: offline / pending outbox / last error (text + aria-live, not color-only) -->
					<div class="flex items-center gap-1" aria-live="polite">
						{#if syncEngine.status === 'offline'}
							<span
								class="inline-flex items-center gap-1 min-h-[44px] px-2 rounded text-xs font-bold bg-amber-500/20 text-amber-600 border border-amber-500/30"
								title="Bekerja offline — perubahan tersimpan di perangkat"
							>
								<span aria-hidden="true" class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
								Offline
							</span>
						{/if}
						{#if syncEngine.pendingCount > 0}
							<span
								class="inline-flex items-center gap-1 min-h-[44px] px-2 rounded text-xs font-bold bg-brand/20 text-brand border border-brand/30"
								title="{syncEngine.pendingCount} perubahan menunggu sinkronisasi"
							>
								<span aria-hidden="true" class="w-1.5 h-1.5 rounded-full bg-brand animate-pulse"></span>
								tertunda ({syncEngine.pendingCount})
							</span>
						{/if}
						{#if syncEngine.lastError}
							<button
								type="button"
								onclick={() => syncEngine.triggerSync()}
								class="inline-flex items-center gap-1 min-h-[44px] min-w-[44px] px-2 rounded text-xs font-bold bg-red-500/15 text-red-600 border border-red-500/40 hover:bg-red-500/25"
								title={syncEngine.lastError}
								aria-label="Sinkronisasi gagal: {syncEngine.lastError}. Ketuk untuk coba lagi."
							>
								<span aria-hidden="true">⚠</span>
								Gagal — coba lagi
							</button>
						{/if}
					</div>
					<ThemeToggle />
				</div>
			{/if}
		</div>
	</header>

	<!-- A rejected write is a data decision, not a transient failure: state it in text, not only in a tooltip. -->
	{#if !isAuthPage && syncEngine.conflictNotice}
		<div class="w-full border-b-2 border-amber-500/40 bg-amber-500/10" role="status" aria-live="polite">
			<div class="max-w-4xl mx-auto px-4 py-2 flex items-start gap-2">
				<span aria-hidden="true" class="text-amber-600 leading-5">⚠</span>
				<p class="flex-1 text-xs sm:text-sm font-bold text-content leading-5">{syncEngine.conflictNotice}</p>
			</div>
		</div>
	{/if}

	<!-- Main Content Area (padding-bottom diatur md:pb-28 agar FAB desktop tidak menutupi baris/tombol bawah) -->
	<main id="main-content" class="flex-1 w-full max-w-4xl mx-auto px-4 py-4 md:py-6 {isAuthPage ? '' : 'pb-24 md:pb-28'}">
		{@render children()}
	</main>

	{#if !isAuthPage}
		<!-- Desktop Floating Action Button (FAB) -->
		<a
			href="/transactions?new=1"
			class="hidden md:flex fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full border-2 border-border bg-accent text-neutral-950 items-center justify-center shadow-hard hover:brightness-95 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
			aria-label="Catat transaksi"
			title="Catat transaksi"
		>
			<svg class="w-6 h-6 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<line x1="12" y1="5" x2="12" y2="19"></line>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
		</a>

		<!-- Mobile Bottom Navigation Bar (fixed) with minimum 44px tap targets -->
		<nav
			class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t-2 border-border pb-[env(safe-area-inset-bottom)]"
			aria-label="Navigasi Bawah Ponsel"
		>
			<div class="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1">
				<!-- Item 1: Beranda -->
				<a
					href="/"
					class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors active:bg-surface-subtle {isActive('/')
						? 'text-brand font-extrabold'
						: 'text-content-muted font-semibold hover:text-content'}"
					aria-label={routeMap['/']}
					aria-current={isActive('/') ? 'page' : undefined}
				>
					<svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
						<polyline points="9 22 9 12 15 12 15 22" />
					</svg>
					<span class="text-xs leading-tight">{routeMap['/']}</span>
				</a>

				<!-- Item 2: Transaksi -->
				<a
					href="/transactions"
					class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors active:bg-surface-subtle {isActive('/transactions')
						? 'text-brand font-extrabold'
						: 'text-content-muted font-semibold hover:text-content'}"
					aria-label={routeMap['/transactions']}
					aria-current={isActive('/transactions') ? 'page' : undefined}
				>
					<svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M8 3v3a2 2 0 0 1-2 2H3" />
						<path d="M21 8v13H3V8" />
						<path d="M3 3h18v5H3z" />
						<path d="M12 12v5" />
						<path d="m9 15 3-3 3 3" />
					</svg>
					<span class="text-xs leading-tight">{routeMap['/transactions']}</span>
				</a>

				<!-- Item 3: Center FAB (+) Button -->
				<div class="flex items-center justify-center">
					<a
						href="/transactions?new=1"
						class="w-12 h-12 rounded-full border-2 border-border bg-accent text-neutral-950 flex items-center justify-center shadow-hard-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
						aria-label="Catat transaksi"
					>
						<svg class="w-6 h-6 stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<line x1="12" y1="5" x2="12" y2="19"></line>
							<line x1="5" y1="12" x2="19" y2="12"></line>
						</svg>
					</a>
				</div>

				<!-- Item 4: Dompet -->
				<a
					href="/wallets"
					class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors active:bg-surface-subtle {isActive('/wallets')
						? 'text-brand font-extrabold'
						: 'text-content-muted font-semibold hover:text-content'}"
					aria-label={routeMap['/wallets']}
					aria-current={isActive('/wallets') ? 'page' : undefined}
				>
					<svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
						<path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
						<path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
					</svg>
					<span class="text-xs leading-tight">{routeMap['/wallets']}</span>
				</a>

				<!-- Item 5: Setelan -->
				<a
					href="/settings"
					class="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-center transition-colors active:bg-surface-subtle {isActive('/settings')
						? 'text-brand font-extrabold'
						: 'text-content-muted font-semibold hover:text-content'}"
					aria-label={routeMap['/settings']}
					aria-current={isActive('/settings') ? 'page' : undefined}
				>
					<svg class="w-5 h-5 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
					<span class="text-xs leading-tight">{routeMap['/settings']}</span>
				</a>
			</div>
		</nav>
	{/if}
</div>
