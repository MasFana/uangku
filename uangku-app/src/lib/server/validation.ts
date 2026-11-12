import * as v from 'valibot';
import { walletTypes, categoryKinds, transactionTypes } from './db/schema';

// --- Wallets ---

export const CreateWalletSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Nama dompet wajib diisi'), v.maxLength(50)),
	type: v.picklist(walletTypes, 'Tipe dompet tidak valid'),
	initialBalance: v.optional(v.pipe(v.number(), v.integer('Saldo awal harus bilangan bulat')), 0),
	icon: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30))))
});

export const UpdateWalletSchema = v.object({
	name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50))),
	type: v.optional(v.picklist(walletTypes, 'Tipe dompet tidak valid')),
	icon: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30))))
});

// --- Categories ---

export const CreateCategorySchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1, 'Nama kategori wajib diisi'), v.maxLength(50)),
	kind: v.picklist(categoryKinds, 'Jenis kategori tidak valid'),
	icon: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30)))),
	color: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(20))))
});

export const UpdateCategorySchema = v.object({
	name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50))),
	kind: v.optional(v.picklist(categoryKinds, 'Jenis kategori tidak valid')),
	icon: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30)))),
	color: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(20))))
});

// --- Transactions ---

// Form HTML mengirim kolom opsional yang kosong sebagai '' — kolom FK harus NULL.
// Tanpa ini D1 menolak insert dengan FOREIGN KEY constraint failed.
const optionalId = v.optional(
	v.nullable(v.pipe(v.string(), v.transform((value) => (value === '' ? null : value))))
);

export const CreateTransactionSchema = v.object({
	walletId: v.pipe(v.string(), v.minLength(1, 'Dompet wajib dipilih')),
	categoryId: optionalId,
	type: v.picklist(transactionTypes, 'Tipe transaksi tidak valid'),
	amount: v.pipe(
		v.number(),
		v.integer('Jumlah harus bilangan bulat'),
		v.minValue(1, 'Jumlah harus lebih besar dari 0')
	),
	transferWalletId: optionalId,
	note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	occurredAt: v.optional(v.pipe(v.string(), v.isoTimestamp('Format tanggal tidak valid'))),
	receiptKey: optionalId
});

export const UpdateTransactionSchema = v.object({
	walletId: v.optional(v.pipe(v.string(), v.minLength(1))),
	categoryId: optionalId,
	amount: v.optional(
		v.pipe(
			v.number(),
			v.integer('Jumlah harus bilangan bulat'),
			v.minValue(1, 'Jumlah harus lebih besar dari 0')
		)
	),
	note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	occurredAt: v.optional(v.pipe(v.string(), v.isoTimestamp('Format tanggal tidak valid'))),
	receiptKey: optionalId
});

export const TransferSchema = v.object({
	sourceWalletId: v.pipe(v.string(), v.minLength(1, 'Dompet asal wajib dipilih')),
	targetWalletId: v.pipe(v.string(), v.minLength(1, 'Dompet tujuan wajib dipilih')),
	amount: v.pipe(
		v.number(),
		v.integer('Jumlah harus bilangan bulat'),
		v.minValue(1, 'Jumlah transfer harus lebih besar dari 0')
	),
	note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	occurredAt: v.optional(v.pipe(v.string(), v.isoTimestamp('Format tanggal tidak valid')))
});

export const ListTransactionsQuerySchema = v.object({
	walletId: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	type: v.optional(v.picklist(transactionTypes)),
	startDate: v.optional(v.string()),
	endDate: v.optional(v.string()),
	from: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal from harus YYYY-MM-DD'))),
	to: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal to harus YYYY-MM-DD'))),
	cursor: v.optional(v.string()),
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100)))
});

// Helper for pure Valibot parse
export function parseInput<T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
	schema: T,
	input: unknown
): v.InferOutput<T> {
	return v.parse(schema, input);
}
