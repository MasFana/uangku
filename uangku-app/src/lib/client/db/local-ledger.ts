import type {
	BaseEntityDTO,
	CategoryDTO,
	CategoryKind,
	SyncPushMutation,
	TransactionDTO,
	TransactionType,
	WalletDTO,
	WalletType
} from '$lib/shared/sync-contract';
import { generateULID } from '$lib/shared/ulid';
import { nowHLC, type HLCState } from '$lib/shared/hlc';
import { idbDelete, idbGet, idbGetAll, idbPut, type OutboxRecord } from './idb';
import { enqueueMutationWithSquashing } from './outbox-squasher';

export type SyncTable = 'transactions' | 'wallets' | 'categories';

export interface TransactionInput {
	walletId: string;
	categoryId?: string | null;
	type: TransactionType;
	amount: number;
	transferWalletId?: string | null;
	note?: string | null;
	occurredAt?: string;
	receiptKey?: string | null;
}

export interface TransactionPatch {
	walletId?: string;
	categoryId?: string | null;
	amount?: number;
	note?: string | null;
	occurredAt?: string;
	receiptKey?: string | null;
}

export interface WalletInput {
	name: string;
	type: WalletType;
	initialBalance?: number;
	icon?: string | null;
}

export interface WalletPatch {
	name?: string;
	type?: WalletType;
	icon?: string | null;
}

export interface CategoryInput {
	name: string;
	kind: CategoryKind;
	icon?: string | null;
	color?: string | null;
}

export interface CategoryPatch {
	name?: string;
	kind?: CategoryKind;
	icon?: string | null;
	color?: string | null;
}

/** Injected per-write values keeping the row builders pure. */
export interface RowCtx {
	id: string;
	hlc: string;
	now: string;
}

/** Payload keys below mirror `src/routes/api/sync/+server.ts` exactly — the server reads `payload.<camelCase>`. */
export function toSyncPayload(row: BaseEntityDTO): Record<string, unknown> {
	return { ...row };
}

export function makeTransactionRow(userId: string, input: TransactionInput, ctx: RowCtx): TransactionDTO {
	return {
		id: ctx.id,
		userId,
		walletId: input.walletId,
		categoryId: input.categoryId ?? null,
		type: input.type,
		amount: Math.trunc(input.amount),
		transferWalletId: input.transferWalletId ?? null,
		note: input.note ? input.note.trim() : null,
		occurredAt: input.occurredAt ?? ctx.now,
		receiptKey: input.receiptKey ?? null,
		hlc: ctx.hlc,
		serverUpdatedAt: 0,
		deletedAt: null,
		createdAt: ctx.now,
		updatedAt: ctx.now
	};
}

/** Mirrors `TransactionsRepo.update`: type/transfer are immutable, amount truncates, note trims. */
export function patchTransactionRow(
	row: TransactionDTO,
	patch: TransactionPatch,
	ctx: Pick<RowCtx, 'hlc' | 'now'>
): TransactionDTO {
	return {
		...row,
		...(patch.walletId !== undefined ? { walletId: patch.walletId } : {}),
		...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
		...(patch.amount !== undefined ? { amount: Math.trunc(patch.amount) } : {}),
		...(patch.note !== undefined ? { note: patch.note ? patch.note.trim() : null } : {}),
		...(patch.occurredAt !== undefined ? { occurredAt: patch.occurredAt } : {}),
		...(patch.receiptKey !== undefined ? { receiptKey: patch.receiptKey } : {}),
		hlc: ctx.hlc,
		updatedAt: ctx.now
	};
}

export function makeWalletRow(userId: string, input: WalletInput, ctx: RowCtx): WalletDTO {
	const initialBalance = Math.trunc(input.initialBalance ?? 0);
	return {
		id: ctx.id,
		userId,
		name: input.name.trim(),
		type: input.type,
		initialBalance,
		// ponytail: seed only. Balances are derived from the transaction log by the rollup slice, never synced.
		currentBalance: initialBalance,
		icon: input.icon ?? null,
		archived: false,
		hlc: ctx.hlc,
		serverUpdatedAt: 0,
		deletedAt: null,
		createdAt: ctx.now
	};
}

/** Mirrors `WalletsRepo.update`: `initialBalance`/`currentBalance` are not editable here. */
export function patchWalletRow(row: WalletDTO, patch: WalletPatch, ctx: Pick<RowCtx, 'hlc'>): WalletDTO {
	return {
		...row,
		...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
		...(patch.type !== undefined ? { type: patch.type } : {}),
		...(patch.icon !== undefined ? { icon: patch.icon } : {}),
		hlc: ctx.hlc
	};
}

export function makeCategoryRow(userId: string, input: CategoryInput, ctx: RowCtx): CategoryDTO {
	return {
		id: ctx.id,
		userId,
		name: input.name.trim(),
		kind: input.kind,
		icon: input.icon ?? null,
		color: input.color ?? null,
		archived: false,
		hlc: ctx.hlc,
		serverUpdatedAt: 0,
		deletedAt: null,
		createdAt: ctx.now
	};
}

export function patchCategoryRow(
	row: CategoryDTO,
	patch: CategoryPatch,
	ctx: Pick<RowCtx, 'hlc'>
): CategoryDTO {
	return {
		...row,
		...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
		...(patch.kind !== undefined ? { kind: patch.kind } : {}),
		...(patch.icon !== undefined ? { icon: patch.icon } : {}),
		...(patch.color !== undefined ? { color: patch.color } : {}),
		hlc: ctx.hlc
	};
}

/** Shared by `setWalletArchived` / `setCategoryArchived`. */
export function setArchivedRow<T extends { archived: boolean; hlc: string }>(
	row: T,
	archived: boolean,
	ctx: Pick<RowCtx, 'hlc'>
): T {
	return { ...row, archived, hlc: ctx.hlc };
}

/**
 * Optimistic local writes against IndexedDB, mirrored by the server repos.
 * Every mutation writes the row immediately, then queues exactly one squashed outbox mutation.
 * `serverUpdatedAt` is left untouched on patches: it is the server watermark that tells a later
 * delete whether the row is already known to the server (rule 3) or was never acked (rule 2).
 */
export class LocalLedger {
	constructor(
		private db: IDBDatabase,
		private hlcState: HLCState
	) { }

	private ctx(): { hlc: string; now: string } {
		return { hlc: nowHLC(this.hlcState), now: new Date().toISOString() };
	}

	private async guard<T extends BaseEntityDTO>(
		store: SyncTable,
		userId: string,
		id: string
	): Promise<T | null> {
		const row = await idbGet<T>(this.db, store, id);
		if (!row || row.userId !== userId || row.deletedAt) return null;
		return row;
	}

	private async save(row: BaseEntityDTO, store: SyncTable, isNewLocalEntity: boolean): Promise<void> {
		await idbPut(this.db, store, row);
		await enqueueMutationWithSquashing(
			this.db,
			{ entityId: row.id, table: store, op: 'UPSERT', hlc: row.hlc, payload: toSyncPayload(row) },
			isNewLocalEntity
		);
	}

	async createTransaction(userId: string, input: TransactionInput): Promise<TransactionDTO> {
		const { hlc, now } = this.ctx();
		const row = makeTransactionRow(userId, input, { id: generateULID(), hlc, now });
		// ponytail: no balance math. Wallet balances/rollups are derived from this log by the rollup slice.
		await this.save(row, 'transactions', true);
		return row;
	}

	async updateTransaction(
		userId: string,
		id: string,
		patch: TransactionPatch
	): Promise<TransactionDTO | null> {
		const row = await this.guard<TransactionDTO>('transactions', userId, id);
		if (!row) return null;
		const { hlc, now } = this.ctx();
		const next = patchTransactionRow(row, patch, { hlc, now });
		await this.save(next, 'transactions', false);
		return next;
	}

	/** Soft delete: tombstone + new hlc; a row the server never acked is purged instead (outbox rule 2). */
	async deleteTransaction(userId: string, id: string): Promise<void> {
		const row = await this.guard<TransactionDTO>('transactions', userId, id);
		if (!row) return; // delete twice = no-op
		const { hlc, now } = this.ctx();
		const mutation: SyncPushMutation = {
			entityId: id,
			table: 'transactions',
			op: 'DELETE',
			hlc,
			payload: { id, deletedAt: now }
		};
		const queued: OutboxRecord[] = await idbGetAll(this.db, 'outbox');
		const neverAcked =
			row.serverUpdatedAt === 0 &&
			queued.some((m) => m.entityId === id && m.op === 'UPSERT');
		if (neverAcked) {
			await idbDelete(this.db, 'transactions', id);
			await enqueueMutationWithSquashing(this.db, mutation, true);
			return;
		}
		await idbPut(this.db, 'transactions', { ...row, deletedAt: now, hlc });
		await enqueueMutationWithSquashing(this.db, mutation, false);
	}

	async createWallet(userId: string, input: WalletInput): Promise<WalletDTO> {
		const { hlc, now } = this.ctx();
		const row = makeWalletRow(userId, input, { id: generateULID(), hlc, now });
		await this.save(row, 'wallets', true);
		return row;
	}

	async updateWallet(userId: string, id: string, patch: WalletPatch): Promise<WalletDTO | null> {
		const row = await this.guard<WalletDTO>('wallets', userId, id);
		if (!row) return null;
		const next = patchWalletRow(row, patch, { hlc: nowHLC(this.hlcState) });
		await this.save(next, 'wallets', false);
		return next;
	}

	async setWalletArchived(
		userId: string,
		id: string,
		archived: boolean
	): Promise<WalletDTO | null> {
		const row = await this.guard<WalletDTO>('wallets', userId, id);
		if (!row) return null;
		const next = setArchivedRow(row, archived, { hlc: nowHLC(this.hlcState) });
		await this.save(next, 'wallets', false);
		return next;
	}

	async createCategory(userId: string, input: CategoryInput): Promise<CategoryDTO> {
		const { hlc, now } = this.ctx();
		const row = makeCategoryRow(userId, input, { id: generateULID(), hlc, now });
		await this.save(row, 'categories', true);
		return row;
	}

	async updateCategory(
		userId: string,
		id: string,
		patch: CategoryPatch
	): Promise<CategoryDTO | null> {
		const row = await this.guard<CategoryDTO>('categories', userId, id);
		if (!row) return null;
		const next = patchCategoryRow(row, patch, { hlc: nowHLC(this.hlcState) });
		await this.save(next, 'categories', false);
		return next;
	}

	async setCategoryArchived(
		userId: string,
		id: string,
		archived: boolean
	): Promise<CategoryDTO | null> {
		const row = await this.guard<CategoryDTO>('categories', userId, id);
		if (!row) return null;
		const next = setArchivedRow(row, archived, { hlc: nowHLC(this.hlcState) });
		await this.save(next, 'categories', false);
		return next;
	}
}
