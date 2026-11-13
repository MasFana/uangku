import {
	TransactionsRepo,
	type ListTransactionsResult,
	type DayTotalResult
} from '../repos/transactions';
import {
	CreateTransactionSchema,
	UpdateTransactionSchema,
	TransferSchema,
	ListTransactionsQuerySchema,
	parseInput
} from '../validation';
import type { AppEvent } from '../types';
import { assertUser } from '../types';
import { invalidateDashboard } from '../cache';
import type { TransactionType } from '../db/schema';

export async function listTransactions(
	event: AppEvent,
	query: unknown = {}
): Promise<ListTransactionsResult> {
	const { userId, db } = assertUser(event);
	const filter = parseInput(ListTransactionsQuerySchema, query);
	const repo = new TransactionsRepo(db);
	return repo.list(userId, filter);
}

export async function getTransaction(event: AppEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new TransactionsRepo(db);
	const tx = await repo.getById(userId, id);
	if (!tx) throw new Error('NOT_FOUND');
	return tx;
}

export async function createTransaction(event: AppEvent, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(CreateTransactionSchema, input);
	const repo = new TransactionsRepo(db);
	const created = await repo.create(userId, validated);
	await invalidateDashboard(event, userId);
	return created;
}

export async function updateTransaction(event: AppEvent, id: string, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(UpdateTransactionSchema, input);
	const repo = new TransactionsRepo(db);
	const updated = await repo.update(userId, id, validated);
	if (!updated) throw new Error('NOT_FOUND');
	await invalidateDashboard(event, userId);
	return updated;
}

export async function deleteTransaction(event: AppEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new TransactionsRepo(db);
	const ok = await repo.delete(userId, id);
	if (!ok) throw new Error('NOT_FOUND');
	await invalidateDashboard(event, userId);
	return { success: true };
}

export async function createTransfer(event: AppEvent, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(TransferSchema, input);
	const repo = new TransactionsRepo(db);
	const transfer = await repo.transfer(userId, validated);
	await invalidateDashboard(event, userId);
	return transfer;
}

export async function getTransactionDayTotals(
	event: AppEvent,
	dates: string[],
	filter: { walletId?: string; categoryId?: string; type?: TransactionType } = {}
): Promise<DayTotalResult[]> {
	const { userId, db } = assertUser(event);
	const repo = new TransactionsRepo(db);
	return repo.getDayTotals(userId, dates, filter);
}

export async function checkHasAnyTransaction(event: AppEvent): Promise<boolean> {
	const { userId, db } = assertUser(event);
	const repo = new TransactionsRepo(db);
	return repo.hasAnyTransaction(userId);
}
