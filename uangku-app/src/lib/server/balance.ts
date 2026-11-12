export interface BalanceMutation {
	type: 'expense' | 'income' | 'transfer';
	amount: number;
	walletId: string;
	transferWalletId?: string | null;
}

/**
 * Pure calculation of single wallet balance.
 * Formula: initial + income - expense - transfer_out + transfer_in
 *
 * All amounts are integer rupiah.
 */
export function calculateWalletBalance(
	initialBalance: number,
	walletId: string,
	mutations: Iterable<BalanceMutation>
): number {
	let balance = Math.trunc(initialBalance) || 0;

	for (const m of mutations) {
		const amount = Math.trunc(m.amount) || 0;
		if (amount <= 0) continue;

		if (m.type === 'income' && m.walletId === walletId) {
			balance += amount;
		} else if (m.type === 'expense' && m.walletId === walletId) {
			balance -= amount;
		} else if (m.type === 'transfer') {
			if (m.walletId === walletId) {
				balance -= amount;
			}
			if (m.transferWalletId === walletId) {
				balance += amount;
			}
		}
	}

	return balance;
}

export interface WalletWithBalanceInput {
	id: string;
	initialBalance: number;
	archived?: boolean;
}

/**
 * Calculates current balances for a list of wallets from a single mutation list.
 * Pure function, avoids O(W * N) passes by scanning mutations once.
 */
export function calculateMultipleWalletBalances<T extends WalletWithBalanceInput>(
	wallets: readonly T[],
	mutations: readonly BalanceMutation[]
): Map<string, number> {
	const balances = new Map<string, number>();
	for (const w of wallets) {
		balances.set(w.id, Math.trunc(w.initialBalance) || 0);
	}

	for (const m of mutations) {
		const amount = Math.trunc(m.amount) || 0;
		if (amount <= 0) continue;

		if (m.type === 'income') {
			const current = balances.get(m.walletId);
			if (current !== undefined) {
				balances.set(m.walletId, current + amount);
			}
		} else if (m.type === 'expense') {
			const current = balances.get(m.walletId);
			if (current !== undefined) {
				balances.set(m.walletId, current - amount);
			}
		} else if (m.type === 'transfer') {
			const source = balances.get(m.walletId);
			if (source !== undefined) {
				balances.set(m.walletId, source - amount);
			}
			if (m.transferWalletId) {
				const dest = balances.get(m.transferWalletId);
				if (dest !== undefined) {
					balances.set(m.transferWalletId, dest + amount);
				}
			}
		}
	}

	return balances;
}

/**
 * Computes net cashflow for a period (income - expense).
 * Transfers between user's wallets are excluded from net cashflow.
 */
export function calculateCashflow(mutations: Iterable<BalanceMutation>): {
	income: number;
	expense: number;
	net: number;
} {
	let income = 0;
	let expense = 0;

	for (const m of mutations) {
		const amount = Math.trunc(m.amount) || 0;
		if (amount <= 0) continue;

		if (m.type === 'income') {
			income += amount;
		} else if (m.type === 'expense') {
			expense += amount;
		}
	}

	return {
		income,
		expense,
		net: income - expense
	};
}
