import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.{test,spec}.ts'],
		testTimeout: 90000,
		hookTimeout: 90000,
		fileParallelism: false,
		pool: 'forks'
	}
});
