import * as v from 'valibot';
import { walletTypes, categoryKinds, transactionTypes } from './db/schema';
import type { SyncEntityTable, SyncOperation } from '$lib/shared/sync-contract';

// --- Sync push mutations ---
// Validated before any D1 write so a malformed mutation is reported as
// `invalid` instead of throwing a constraint error or persisting junk.

const syncIdSchema = v.pipe(v.string(), v.minLength(1, 'ID wajib diisi'));
const syncIdOrNull = v.optional(v.nullable(syncIdSchema));
// IDR adalah integer: tolak non-integer (termasuk NaN/Infinity) dan negatif.
const syncAmountSchema = v.pipe(
	v.number(),
	v.integer('Jumlah harus bilangan bulat'),
	v.minValue(0, 'Jumlah tidak boleh negatif')
);
const syncTimestamp = v.optional(v.nullable(v.pipe(v.string(), v.minLength(1))));

export const SyncWalletUpsertSchema = v.object({
	id: syncIdSchema,
	name: v.pipe(v.string(), v.minLength(1, 'Nama dompet wajib diisi'), v.maxLength(50)),
	type: v.picklist(walletTypes, 'Tipe dompet tidak valid'),
	initialBalance: syncAmountSchema,
	icon: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30)))),
	archived: v.optional(v.boolean()),
	deletedAt: syncTimestamp,
	createdAt: v.optional(v.string())
});

export const SyncCategoryUpsertSchema = v.object({
	id: syncIdSchema,
	name: v.pipe(v.string(), v.minLength(1, 'Nama kategori wajib diisi'), v.maxLength(50)),
	kind: v.picklist(categoryKinds, 'Jenis kategori tidak valid'),
	icon: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(30)))),
	color: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(20)))),
	archived: v.optional(v.boolean()),
	deletedAt: syncTimestamp,
	createdAt: v.optional(v.string())
});

export const SyncTransactionUpsertSchema = v.object({
	id: syncIdSchema,
	walletId: syncIdSchema,
	categoryId: syncIdOrNull,
	type: v.picklist(transactionTypes, 'Tipe transaksi tidak valid'),
	amount: syncAmountSchema,
	transferWalletId: syncIdOrNull,
	note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	occurredAt: v.pipe(v.string(), v.minLength(1, 'Tanggal wajib diisi')),
	receiptKey: v.optional(v.nullable(v.string())),
	deletedAt: syncTimestamp,
	createdAt: v.optional(v.string()),
	updatedAt: v.optional(v.string())
});

export const SyncDeletePayloadSchema = v.object({
	id: v.optional(v.string()),
	deletedAt: syncTimestamp
});

export const SyncMutationEnvelopeSchema = v.object({
	entityId: syncIdSchema,
	table: v.picklist(['wallets', 'categories', 'transactions'] as const),
	op: v.picklist(['UPSERT', 'DELETE'] as const),
	hlc: v.pipe(v.string(), v.minLength(1, 'HLC wajib diisi')),
	payload: v.unknown()
});

export interface ParsedSyncMutation {
	entityId: string;
	table: SyncEntityTable;
	op: SyncOperation;
	hlc: string;
	payload: Record<string, unknown>;
}

/**
 * Validates the mutation envelope plus its op-specific payload.
 * Returns `null` when anything is malformed (caller reports `invalid`).
 * `payload.id`, when present, must equal `entityId` so a mutation can never
 * address a different row than the one its ownership was checked against.
 */
export function parseSyncMutation(input: unknown): ParsedSyncMutation | null {
	const envelope = v.safeParse(SyncMutationEnvelopeSchema, input);
	if (!envelope.success) return null;

	const { entityId, table, op, hlc } = envelope.output;
	const rawPayload = envelope.output.payload ?? {};

	let payload: Record<string, unknown>;
	if (op === 'DELETE') {
		const result = v.safeParse(SyncDeletePayloadSchema, rawPayload);
		if (!result.success) return null;
		payload = result.output as Record<string, unknown>;
	} else if (table === 'wallets') {
		const result = v.safeParse(SyncWalletUpsertSchema, rawPayload);
		if (!result.success) return null;
		payload = result.output as Record<string, unknown>;
	} else if (table === 'categories') {
		const result = v.safeParse(SyncCategoryUpsertSchema, rawPayload);
		if (!result.success) return null;
		payload = result.output as Record<string, unknown>;
	} else {
		const result = v.safeParse(SyncTransactionUpsertSchema, rawPayload);
		if (!result.success) return null;
		payload = result.output as Record<string, unknown>;
	}

	if (typeof payload.id === 'string' && payload.id !== entityId) return null;

	return { entityId, table, op, hlc, payload };
}
