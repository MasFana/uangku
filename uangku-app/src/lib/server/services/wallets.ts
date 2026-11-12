import { WalletsRepo } from './server/repos/wallets';
import { CreateWalletSchema, UpdateWalletSchema, parseInput } from './server/validation';
import type { RequestEvent } from '@sveltejs/kit';
import type { AppDatabase } from './server/db/client';

function assertUser(event: RequestEvent): { userId: string; db: AppDatabase } {
	const locals = event.locals as unknown as { user?: { id: string }; db?: AppDatabase };
	if (!locals.user?.id) {
		throw new Error('UNAUTHENTICATED');
	}
	if (!locals.db) {
		throw new Error('Database not initialized');
	}
	return { userId: locals.user.id, db: locals.db };
}

export async function listWallets(event: RequestEvent, includeArchived = false) {
	const { userId, db } = assertUser(event);
	const repo = new WalletsRepo(db);
	return repo.list(userId, includeArchived);
}

export async function getWallet(event: RequestEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new WalletsRepo(db);
	const wallet = await repo.getById(userId, id);
	if (!wallet) throw new Error('NOT_FOUND');
	return wallet;
}

export async function createWallet(event: RequestEvent, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(CreateWalletSchema, input);
	const repo = new WalletsRepo(db);
	return repo.create(userId, validated);
}

export async function updateWallet(event: RequestEvent, id: string, input: unknown) {
	const { userId, db } = assertUser(event);
	const validated = parseInput(UpdateWalletSchema, input);
	const repo = new WalletsRepo(db);
	const updated = await repo.update(userId, id, validated);
	if (!updated) throw new Error('NOT_FOUND');
	return updated;
}

export async function archiveWallet(event: RequestEvent, id: string) {
	const { userId, db } = assertUser(event);
	const repo = new WalletsRepo(db);
	const ok = await repo.archive(userId, id);
	if (!ok) throw new Error('NOT_FOUND');
	return { success: true };
}
