import { WalletsRepo } from '../repos/wallets';
import { CreateWalletSchema, UpdateWalletSchema, parseInput } from '../validation';
import type { AppEvent } from '../types';
import { assertUser } from '../types';

export async function listWallets(event: AppEvent, includeArchived = false) {
	const { userId, db } = assertUser(event);
	const repo = new WalletsRepo(db);
	return repo.list(userId, includeArchived);
}

export async function getWallet(event: AppEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new WalletsRepo(db);
	const wallet = await repo.getById(userId, id);
	if (!wallet) throw new Error('NOT_FOUND');
	return wallet;
}

export async function createWallet(event: AppEvent, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(CreateWalletSchema, input);
	const repo = new WalletsRepo(db);
	return repo.create(userId, validated);
}

export async function updateWallet(event: AppEvent, id: string, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(UpdateWalletSchema, input);
	const repo = new WalletsRepo(db);
	const updated = await repo.update(userId, id, validated);
	if (!updated) throw new Error('NOT_FOUND');
	return updated;
}

export async function archiveWallet(event: AppEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new WalletsRepo(db);
	const ok = await repo.archive(userId, id);
	if (!ok) throw new Error('NOT_FOUND');
	return { success: true };
}
