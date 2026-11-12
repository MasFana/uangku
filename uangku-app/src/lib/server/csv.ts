/**
 * Pure RFC 4180 CSV builder helpers.
 * Header: tanggal,tipe,dompet,kategori,jumlah,catatan
 */

export const CSV_HEADER = 'tanggal,tipe,dompet,kategori,jumlah,catatan';

export interface CsvTransactionRow {
	occurredAt: string;
	type: 'income' | 'expense' | 'transfer';
	walletName: string;
	categoryName?: string | null;
	targetWalletName?: string | null;
	amount: number;
	note?: string | null;
}

/**
 * Escapes a cell value according to RFC 4180.
 * Double quotes are escaped as `""`.
 * Enclosed in quotes if contains comma, quote, or newline.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) {
		return '';
	}
	const str = typeof value === 'number' ? Math.trunc(value).toString() : String(value);

	if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}

	return str;
}

/**
 * Formats a transaction record into a CSV row.
 * For transfers, category is displayed as `-> [targetWalletName]` or target wallet name.
 */
export function formatTransactionRow(tx: CsvTransactionRow): string {
	const tanggal = escapeCsvCell(tx.occurredAt);
	const tipe = escapeCsvCell(tx.type);
	const dompet = escapeCsvCell(tx.walletName);

	let categoryText = tx.categoryName ?? '';
	if (tx.type === 'transfer') {
		categoryText = tx.targetWalletName ? `-> ${tx.targetWalletName}` : 'Transfer';
	}
	const kategori = escapeCsvCell(categoryText);
	const jumlah = escapeCsvCell(Math.trunc(tx.amount));
	const catatan = escapeCsvCell(tx.note ?? '');

	return `${tanggal},${tipe},${dompet},${kategori},${jumlah},${catatan}`;
}
