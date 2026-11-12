import { TransactionsRepo } from './server/repos/transactions';
import {
	CreateTransactionSchema,
	UpdateTransactionSchema,
	TransferSchema,
	ListTransactionsQuerySchema,
	parseInput
} from './server/validation';
import type { RequestEvent } from '@sveltejs/kit';
import type { AppDatabase } from './server/db/client';

interface SimpleKV {
	delete(key: string): Promise<void>;
}

function assertUser(event: RequestEvent): { userId: string; db: AppDatabase; kv?: SimpleKV } {
	const locals = event.locals as unknown as {
		user?: { id: string };
		db?: AppDatabase;
		kv?: SimpleKV;
	};
	if (!locals.user?.id) {
		throw new Error('UNAUTHENTICATED');
	}
	if (!locals.db) {
		throw new Error('Database not initialized');
	}
	return { userId: locals.user.id, db: locals.db, kv: locals.kv };
}

async function invalidateDashboardCache(kv: SimpleKV | undefined, userId: string) {
	if (!kv) return;
	try {
		await kv.delete(`dashboard:${userId}`);
	} catch {
		// cache invalidation fail non-fatal
	}
}

export async function listTransactions(event: RequestEvent, query: unknown = {}) {
	const { userId, db } = assertUser(event);
	const filter = parseInput(ListTransactionsQuerySchema, query);
	const repo = new TransactionsRepo(db);
	return repo.list(userId, filter);
}

export async function getTransaction(event: RequestEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new TransactionsRepo(db);
	const tx = await repo.getById(userId, id);
	if (!tx) throw new Error('NOT_FOUND');
	return tx;
}

export async function createTransaction(event: RequestEvent, input: unknown) {
	const { userId, db, kv } = assertUser(event);
	const validated = parseInput(CreateTransactionSchema, input);
	const repo = new TransactionsRepo(db);
	const created = await repo.create(userId, validated);
	await invalidateDashboardCache(kv, userId);
	return created;
}

export async function updateTransaction(event: RequestEvent, id: string, input: unknown) {
	const { userId, db, kv } = assertUser(event);
	const validated = parseInput(UpdateTransactionSchema, input);
	const repo = new TransactionsRepo(db);
	const updated = await repo.update(userId, id, validated);
	if (!updated) throw new Error('NOT_FOUND');
	await invalidateDashboardCache(kv, userId);
	return updated;
}

export async function deleteTransaction(event: RequestEvent, id: string) {
	const { userId, db, kv } = assertUser(event);
	const repo = new TransactionsRepo(db);
	const ok = await repo.delete(userId, id);
	if (!ok) throw new Error('NOT_FOUND');
	await invalidateDashboardCache(kv, userId);
	return { success: true };
}

export async function createTransfer(event: RequestEvent, input: unknown) {
	const { userId, db, kv } = assertUser(event);
	const validated = parseInput(TransferSchema, input);
	const repo = new TransactionsRepo(db);
	const transfer = await repo.transfer(userId, validated);
	await invalidateDashboardCache(kv, userId);
	return transfer;
}
