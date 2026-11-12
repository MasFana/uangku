import adapter from '@sveltejs/adapter-cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	// SvelteKit 3 mencabut `$lib` bawaan. Pakai alias Vite (bukan opsi `alias`
	// milik SvelteKit yang sudah deprecated) agar keluaran `shadcn-svelte add`
	// yang memakai `$lib/...` tetap resolve.
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				config: './wrangler.jsonc',
				platformProxy: {
					persist: true
				}
			})
		})
	]
});
