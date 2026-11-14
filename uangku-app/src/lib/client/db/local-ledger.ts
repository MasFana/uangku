import type { WalletDTO, CategoryDTO, TransactionDTO, TransactionType } from '$lib/shared/sync-contract';
import { generateULID } from '$lib/shared/ulid';
import { nowHLC, type HLCState } from '$lib/shared/hlc';
import { enqueueMutationWithSquashing } from './outbox-squasher';

/**
 * Optimistic local writes executing inside an IndexedDB transaction.
 * Mirrors SQLite trigger balance math locally so UI updates instantaneously offline.
 */
export class LocalLedger {
	constructor(
		private db: IDBDatabase,
		private hlcState: HLCState
	) {}

	async createTransaction(
		userId: string,
		input: {
			walletId: string;
			categoryId?: string | null;
			type: TransactionType;
			amount: number;
			transferWalletId?: string | null;
			note?: string | null;
			occurredAt?: string;
			receiptKey?: string | null;
		}
	): Promise<TransactionDTO> {
		const id = generateULID();
		const now = new Date().toISOString();
		const occurredAt = input.occurredAt ?? now;
		const hlc = nowHLC(this.hlcState);

		const txDTO: TransactionDTO = {
			id,
			userId,
			walletId: input.walletId,
			categoryId: input.categoryId ?? null,
			type: input.type,
			amount: Math.trunc(input.amount),
			transferWalletId: input.transferWalletId ?? null,
			note: input.note ?? null,
			occurredAt,
			receiptKey: input.receiptKey ?? null,
			hlc,
			serverUpdatedAt: 0,
			deletedAt: null,
			createdAt: now,
			updatedAt: now
		};

		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(['transactions', 'wallets', 'outbox'], 'readwrite');
			const txStore = tx.objectStore('transactions');
			const walletStore = tx.objectStore('wallets');

			txStore.put(txDTO);

			// Update primary wallet balance
			const walletReq = walletStore.get(input.walletId);
			walletReq.onsuccess = () => {
				const wallet: WalletDTO | undefined = walletReq.result;
				if (wallet) {
					const delta =
						input.type === 'income'
							? input.amount
							: input.type === 'expense'
								? -input.amount
								: -input.amount; // transfer out
					wallet.currentBalance += delta;
					walletStore.put(wallet);
				}
			};

			// Update transfer destination wallet balance if applicable
			if (input.type === 'transfer' && input.transferWalletId) {
				const destReq = walletStore.get(input.transferWalletId);
				destReq.onsuccess = () => {
					const destWallet: WalletDTO | undefined = destReq.result;
					if (destWallet) {
						destWallet.currentBalance += input.amount;
						walletStore.put(destWallet);
					}
				};
			}

			tx.oncomplete = async () => {
				try {
					await enqueueMutationWithSquashing(
						this.db,
						{
							entityId: id,
							table: 'transactions',
							op: 'UPSERT',
							hlc,
							payload: txDTO as unknown as Record<string, unknown>
						},
						true
					);
					resolve(txDTO);
				} catch (err) {
					reject(err);
				}
			};
			tx.onerror = () => reject(tx.error);
		});
	}

	async deleteTransaction(id: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const tx = this.db.transaction(['transactions', 'wallets'], 'readwrite');
			const txStore = tx.objectStore('transactions');
			const walletStore = tx.objectStore('wallets');

			const txReq = txStore.get(id);
			txReq.onsuccess = () => {
				const txItem: TransactionDTO | undefined = txReq.result;
				if (!txItem || txItem.deletedAt) {
					return;
				}

				const hlc = nowHLC(this.hlcState);
				txItem.deletedAt = new Date().toISOString();
				txItem.hlc = hlc;
				txStore.put(txItem);

				// Reverse effect on primary wallet
				const walletReq = walletStore.get(txItem.walletId);
				walletReq.onsuccess = () => {
					const wallet: WalletDTO | undefined = walletReq.result;
					if (wallet) {
						const reverseDelta =
							txItem.type === 'income'
								? -txItem.amount
								: txItem.type === 'expense'
									? txItem.amount
									: txItem.amount;
						wallet.currentBalance += reverseDelta;
						walletStore.put(wallet);
					}
				};

				// Reverse effect on transfer target wallet
				if (txItem.type === 'transfer' && txItem.transferWalletId) {
					const destReq = walletStore.get(txItem.transferWalletId);
					destReq.onsuccess = () => {
						const destWallet: WalletDTO | undefined = destReq.result;
						if (destWallet) {
							destWallet.currentBalance -= txItem.amount;
							walletStore.put(destWallet);
						}
					};
				}
			};

			tx.oncomplete = async () => {
				try {
					const hlc = nowHLC(this.hlcState);
					await enqueueMutationWithSquashing(
						this.db,
						{
							entityId: id,
							table: 'transactions',
							op: 'DELETE',
							hlc,
							payload: { id, deletedAt: new Date().toISOString() }
						},
						false
					);
					resolve();
				} catch (err) {
					reject(err);
				}
			};
			tx.onerror = () => reject(tx.error);
		});
	}
}
