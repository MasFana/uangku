import { json, type RequestHandler } from '@sveltejs/kit';
import { assertUser } from '$lib/server/types';
import { sql, gt, eq, and } from 'drizzle-orm';
import { wallets, categories, transactions } from '$lib/server/db/schema';
import type {
	SyncRequestPayload,
	SyncResponsePayload,
	SyncPushMutation,
	WalletDTO,
	CategoryDTO,
	TransactionDTO
} from '$lib/shared/sync-contract';
import { invalidateDashboardEdgeCache } from '$lib/server/cache/edge-cache';
import { invalidateDashboard } from '$lib/server/cache';

export const POST: RequestHandler = async (event) => {
	const { userId, db } = assertUser(event as any);
	const body = (await event.request.json()) as SyncRequestPayload;

	const clientCursor = body.cursor || 0;
	const mutations: SyncPushMutation[] = body.mutations || [];

	// Sort mutations topologically: wallets -> categories -> transactions
	const orderWeight: Record<string, number> = {
		wallets: 1,
		categories: 2,
		transactions: 3
	};
	mutations.sort((a, b) => (orderWeight[a.table] || 99) - (orderWeight[b.table] || 99));

	const serverNow = Date.now();
	let appliedCount = 0;

	// Execute mutations atomically via D1 statements
	for (const m of mutations) {
		const payload = m.payload as any;

		if (m.table === 'wallets') {
			if (m.op === 'DELETE') {
				await db
					.update(wallets)
					.set({
						deletedAt: payload.deletedAt ?? new Date(serverNow).toISOString(),
						hlc: m.hlc,
						serverUpdatedAt: serverNow
					})
					.where(and(eq(wallets.userId, userId), eq(wallets.id, m.entityId)));
				appliedCount++;
			} else {
				// UPSERT with LWW check
				await db.run(sql`
					INSERT INTO wallets (
						id, user_id, name, type, initial_balance, current_balance,
						icon, archived, hlc, server_updated_at, deleted_at, created_at
					) VALUES (
						${payload.id}, ${userId}, ${payload.name}, ${payload.type},
						${payload.initialBalance ?? 0}, ${payload.currentBalance ?? payload.initialBalance ?? 0},
						${payload.icon ?? null}, ${payload.archived ? 1 : 0}, ${m.hlc},
						${serverNow}, ${payload.deletedAt ?? null}, ${payload.createdAt ?? new Date(serverNow).toISOString()}
					)
					ON CONFLICT(id) DO UPDATE SET
						name = excluded.name,
						type = excluded.type,
						icon = excluded.icon,
						archived = excluded.archived,
						hlc = excluded.hlc,
						server_updated_at = excluded.server_updated_at,
						deleted_at = excluded.deleted_at
					WHERE wallets.user_id = ${userId} AND excluded.hlc > wallets.hlc
				`);
				appliedCount++;
			}
		} else if (m.table === 'categories') {
			if (m.op === 'DELETE') {
				await db
					.update(categories)
					.set({
						deletedAt: payload.deletedAt ?? new Date(serverNow).toISOString(),
						hlc: m.hlc,
						serverUpdatedAt: serverNow
					})
					.where(and(eq(categories.userId, userId), eq(categories.id, m.entityId)));
				appliedCount++;
			} else {
				await db.run(sql`
					INSERT INTO categories (
						id, user_id, name, kind, icon, color,
						archived, hlc, server_updated_at, deleted_at, created_at
					) VALUES (
						${payload.id}, ${userId}, ${payload.name}, ${payload.kind},
						${payload.icon ?? null}, ${payload.color ?? null},
						${payload.archived ? 1 : 0}, ${m.hlc},
						${serverNow}, ${payload.deletedAt ?? null}, ${payload.createdAt ?? new Date(serverNow).toISOString()}
					)
					ON CONFLICT(id) DO UPDATE SET
						name = excluded.name,
						kind = excluded.kind,
						icon = excluded.icon,
						color = excluded.color,
						archived = excluded.archived,
						hlc = excluded.hlc,
						server_updated_at = excluded.server_updated_at,
						deleted_at = excluded.deleted_at
					WHERE categories.user_id = ${userId} AND excluded.hlc > categories.hlc
				`);
				appliedCount++;
			}
		} else if (m.table === 'transactions') {
			if (m.op === 'DELETE') {
				await db
					.update(transactions)
					.set({
						deletedAt: payload.deletedAt ?? new Date(serverNow).toISOString(),
						hlc: m.hlc,
						serverUpdatedAt: serverNow
					})
					.where(and(eq(transactions.userId, userId), eq(transactions.id, m.entityId)));
				appliedCount++;
			} else {
				await db.run(sql`
					INSERT INTO transactions (
						id, user_id, wallet_id, category_id, type, amount,
						transfer_wallet_id, note, occurred_at, receipt_key,
						hlc, server_updated_at, deleted_at, created_at, updated_at
					) VALUES (
						${payload.id}, ${userId}, ${payload.walletId}, ${payload.categoryId ?? null},
						${payload.type}, ${payload.amount}, ${payload.transferWalletId ?? null},
						${payload.note ?? null}, ${payload.occurredAt}, ${payload.receiptKey ?? null},
						${m.hlc}, ${serverNow}, ${payload.deletedAt ?? null},
						${payload.createdAt ?? new Date(serverNow).toISOString()}, ${new Date(serverNow).toISOString()}
					)
					ON CONFLICT(id) DO UPDATE SET
						wallet_id = excluded.wallet_id,
						category_id = excluded.category_id,
						type = excluded.type,
						amount = excluded.amount,
						transfer_wallet_id = excluded.transfer_wallet_id,
						note = excluded.note,
						occurred_at = excluded.occurred_at,
						receipt_key = excluded.receipt_key,
						hlc = excluded.hlc,
						server_updated_at = excluded.server_updated_at,
						deleted_at = excluded.deleted_at,
						updated_at = excluded.updated_at
					WHERE transactions.user_id = ${userId} AND excluded.hlc > transactions.hlc
				`);
				appliedCount++;
			}
		}
	}

	// Fetch delta: all entities with server_updated_at > clientCursor
	const [deltaWallets, deltaCategories, deltaTransactions] = await Promise.all([
		db
			.select()
			.from(wallets)
			.where(and(eq(wallets.userId, userId), gt(wallets.serverUpdatedAt, clientCursor))),
		db
			.select()
			.from(categories)
			.where(and(eq(categories.userId, userId), gt(categories.serverUpdatedAt, clientCursor))),
		db
			.select()
			.from(transactions)
			.where(and(eq(transactions.userId, userId), gt(transactions.serverUpdatedAt, clientCursor)))
	]);

	// Invalidate edge cache asynchronously if mutations occurred
	if (mutations.length > 0) {
		const backgroundPromise = Promise.all([
			invalidateDashboardEdgeCache(userId),
			invalidateDashboard(event as any, userId)
		]);
		const ctx = (event.platform as any)?.context;
		if (ctx?.waitUntil) {
			ctx.waitUntil(backgroundPromise);
		}
	}

	const responsePayload: SyncResponsePayload = {
		newCursor: serverNow,
		appliedCount,
		delta: {
			wallets: deltaWallets.map((w) => ({
				...w,
				archived: Boolean(w.archived)
			})) as unknown as WalletDTO[],
			categories: deltaCategories.map((c) => ({
				...c,
				archived: Boolean(c.archived)
			})) as unknown as CategoryDTO[],
			transactions: deltaTransactions as unknown as TransactionDTO[]
		}
	};

	return json(responsePayload);
};
