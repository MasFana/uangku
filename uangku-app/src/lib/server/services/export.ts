import { TransactionsRepo } from '../repos/transactions';
import { WalletsRepo } from '../repos/wallets';
import { CategoriesRepo } from '../repos/categories';
import { CSV_HEADER, formatTransactionRow } from '../csv';
import type { AppEvent } from '../types';
import { assertUser } from '../types';

/**
 * Creates a streaming ReadableStream<Uint8Array> of all user transactions in CSV format.
 * Includes UTF-8 BOM (\uFEFF) at the start for Microsoft Excel compatibility.
 */
export function streamTransactionsCsv(event: AppEvent): ReadableStream<Uint8Array> {
	const { userId, db } = assertUser(event);

	const encoder = new TextEncoder();
	const txRepo = new TransactionsRepo(db);
	const walletsRepo = new WalletsRepo(db);
	const categoriesRepo = new CategoriesRepo(db);

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				// Preload wallets and categories into memory maps for fast lookups
				const [userWallets, userCategories] = await Promise.all([
					walletsRepo.list(userId, true),
					categoriesRepo.list(userId, { includeArchived: true })
				]);

				const walletMap = new Map<string, string>(userWallets.map((w) => [w.id, w.name]));
				const categoryMap = new Map<string, string>(userCategories.map((c) => [c.id, c.name]));

				// Send UTF-8 BOM followed by CSV header and newline
				controller.enqueue(encoder.encode('\uFEFF' + CSV_HEADER + '\r\n'));

				// Stream rows batch by batch (200 records per query)
				for await (const batch of txRepo.iterateAll(userId, 200)) {
					let chunk = '';
					for (const tx of batch) {
						const walletName = walletMap.get(tx.walletId) ?? 'Dompet Tidak Dikenal';
						const targetWalletName = tx.transferWalletId
							? (walletMap.get(tx.transferWalletId) ?? 'Dompet Tujuan')
							: null;
						const categoryName = tx.categoryId ? (categoryMap.get(tx.categoryId) ?? null) : null;

						const line = formatTransactionRow({
							occurredAt: tx.occurredAt,
							type: tx.type,
							walletName,
							categoryName,
							targetWalletName,
							amount: tx.amount,
							note: tx.note
						});

						chunk += line + '\r\n';
					}

					if (chunk.length > 0) {
						controller.enqueue(encoder.encode(chunk));
					}
				}

				controller.close();
			} catch (err) {
				console.log(
					JSON.stringify({
						level: 'error',
						module: 'export.csv',
						userId,
						message: err instanceof Error ? err.message : String(err)
					})
				);
				controller.error(err);
			}
		}
	});
}
