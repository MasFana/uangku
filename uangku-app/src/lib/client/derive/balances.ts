import type { TransactionDTO, WalletDTO } from '$lib/shared/sync-contract';

/**
 * Recomputes wallet balances from local DTOs with the exact math of the D1 triggers
 * (drizzle/0002_hlc_sync_rollups_triggers.sql):
 *   balance = initial_balance + Σ(income +amount, expense -amount,
 *             transfer -amount on wallet_id, transfer +amount on transfer_wallet_id)
 * over rows with deleted_at IS NULL. Ids absent from `wallets` are ignored, exactly as
 * the trigger's `WHERE id = NEW.wallet_id` updates hit no row.
 *
 * ponytail: full scan per call; keeps correctness regardless of mutation order. Swap for
 * an incremental delta feed if a single user ever holds >10k local transactions.
 */
export function deriveWalletBalances(
	wallets: readonly WalletDTO[],
	transactions: readonly TransactionDTO[]
): Map<string, number> {
	const balances = new Map<string, number>();
	for (const wallet of wallets) {
		balances.set(wallet.id, Math.trunc(wallet.initialBalance) || 0);
	}

	for (const tx of transactions) {
		if (tx.deletedAt != null) continue;
		const amount = Math.trunc(tx.amount) || 0;

		const primary = balances.get(tx.walletId);
		if (primary !== undefined) {
			balances.set(tx.walletId, primary + (tx.type === 'income' ? amount : -amount));
		}

		if (tx.type === 'transfer' && tx.transferWalletId) {
			const target = balances.get(tx.transferWalletId);
			if (target !== undefined) {
				balances.set(tx.transferWalletId, target + amount);
			}
		}
	}

	return balances;
}

/** Sum of every derived balance — same value as the server's `totalBalance`. */
export function sumBalances(balances: ReadonlyMap<string, number>): number {
	let total = 0;
	for (const value of balances.values()) total += value;
	return total;
}
