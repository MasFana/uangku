import { describe, it, expect } from 'vitest';
import {
	calculateWalletBalance,
	calculateMultipleWalletBalances,
	calculateCashflow,
	type BalanceMutation
} from '../src/lib/server/balance';

describe('calculateWalletBalance', () => {
	it('calculates initial balance with no mutations', () => {
		const balance = calculateWalletBalance(100_000, 'w1', []);
		expect(balance).toBe(100_000);
	});

	it('adds income and subtracts expense for target wallet', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'income', amount: 50_000, walletId: 'w1' },
			{ type: 'expense', amount: 20_000, walletId: 'w1' }
		];
		const balance = calculateWalletBalance(100_000, 'w1', mutations);
		expect(balance).toBe(130_000);
	});

	it('handles transfers out and transfers in', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'transfer', amount: 30_000, walletId: 'w1', transferWalletId: 'w2' },
			{ type: 'transfer', amount: 15_000, walletId: 'w3', transferWalletId: 'w1' }
		];
		const balance = calculateWalletBalance(100_000, 'w1', mutations);
		expect(balance).toBe(85_000); // 100k - 30k + 15k
	});

	it('ignores mutations for other wallets', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'income', amount: 50_000, walletId: 'w2' },
			{ type: 'expense', amount: 20_000, walletId: 'w3' },
			{ type: 'transfer', amount: 10_000, walletId: 'w2', transferWalletId: 'w3' }
		];
		const balance = calculateWalletBalance(50_000, 'w1', mutations);
		expect(balance).toBe(50_000);
	});

	it('ignores zero or negative amounts', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'income', amount: 0, walletId: 'w1' },
			{ type: 'expense', amount: -5000, walletId: 'w1' },
			{ type: 'income', amount: 25_000, walletId: 'w1' }
		];
		const balance = calculateWalletBalance(10_000, 'w1', mutations);
		expect(balance).toBe(35_000);
	});

	it('truncates floating point values to integer rupiah', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'income', amount: 10_000.75, walletId: 'w1' },
			{ type: 'expense', amount: 4_000.25, walletId: 'w1' }
		];
		const balance = calculateWalletBalance(1000.9, 'w1', mutations);
		// initial: 1000, income: 10000, expense: 4000 -> 7000
		expect(balance).toBe(7_000);
	});

	it('allows negative balances when expenses exceed balance', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'expense', amount: 150_000, walletId: 'w1' }
		];
		const balance = calculateWalletBalance(50_000, 'w1', mutations);
		expect(balance).toBe(-100_000);
	});
});

describe('calculateMultipleWalletBalances', () => {
	it('calculates current balances for multiple wallets in a single scan', () => {
		const wallets = [
			{ id: 'w1', initialBalance: 100_000 },
			{ id: 'w2', initialBalance: 50_000 },
			{ id: 'w3', initialBalance: 0 }
		];

		const mutations: BalanceMutation[] = [
			{ type: 'income', amount: 20_000, walletId: 'w1' },
			{ type: 'expense', amount: 10_000, walletId: 'w2' },
			{ type: 'transfer', amount: 30_000, walletId: 'w1', transferWalletId: 'w3' }
		];

		const balances = calculateMultipleWalletBalances(wallets, mutations);

		expect(balances.get('w1')).toBe(90_000); // 100k + 20k - 30k
		expect(balances.get('w2')).toBe(40_000); // 50k - 10k
		expect(balances.get('w3')).toBe(30_000); // 0 + 30k
	});

	it('ignores transfers with unknown destination wallet', () => {
		const wallets = [{ id: 'w1', initialBalance: 50_000 }];
		const mutations: BalanceMutation[] = [
			{ type: 'transfer', amount: 10_000, walletId: 'w1', transferWalletId: 'unknown' }
		];

		const balances = calculateMultipleWalletBalances(wallets, mutations);
		expect(balances.get('w1')).toBe(40_000);
		expect(balances.has('unknown')).toBe(false);
	});
});

describe('calculateCashflow', () => {
	it('sums income and expense correctly and computes net', () => {
		const mutations: BalanceMutation[] = [
			{ type: 'income', amount: 1_000_000, walletId: 'w1' },
			{ type: 'expense', amount: 250_000, walletId: 'w1' },
			{ type: 'expense', amount: 150_000, walletId: 'w2' },
			{ type: 'transfer', amount: 500_000, walletId: 'w1', transferWalletId: 'w2' } // excluded from cashflow
		];

		const flow = calculateCashflow(mutations);
		expect(flow.income).toBe(1_000_000);
		expect(flow.expense).toBe(400_000);
		expect(flow.net).toBe(600_000);
	});

	it('returns zeros for empty mutations', () => {
		const flow = calculateCashflow([]);
		expect(flow).toEqual({ income: 0, expense: 0, net: 0 });
	});
});
