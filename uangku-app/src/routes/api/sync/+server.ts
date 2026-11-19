import { json, type RequestHandler } from '@sveltejs/kit';
import { assertUser } from '$lib/server/types';
import { sql, gt, eq, and, inArray } from 'drizzle-orm';
import { wallets, categories, transactions } from '$lib/server/db/schema';
import type {
	SyncRequestPayload,
	SyncResponsePayload,
	SyncRejectedMutation,
	WalletDTO,
	CategoryDTO,
	TransactionDTO
} from '$lib/shared/sync-contract';
import { parseSyncMutation, type ParsedSyncMutation } from '$lib/server/validation';
import { canonicalizeHLC } from '$lib/shared/hlc';

// Wallets/categories first: transactions reference them (FK + balance triggers).
const ORDER_WEIGHT: Record<string, number> = { wallets: 1, categories: 2, transactions: 3 };

/** Owner lookup row: enough to decide `forbidden` without a second query. */
type OwnerRow = { id: string; userId: string };

/** Non-empty string or null (ids: `''` and absent are equivalent). */
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
/** Any string verbatim, else null (free text columns may be empty). */
const nullableStr = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const POST: RequestHandler = async (event) => {
	const { userId, db } = assertUser(event as any);
	const body = (await event.request.json()) as SyncRequestPayload;

	const clientCursor = Number.isFinite(body?.cursor) ? Number(body.cursor) : 0;
	const rawMutations: unknown[] = Array.isArray(body?.mutations) ? body.mutations : [];

	const rejected: SyncRejectedMutation[] = [];
	const canonicalized: SyncRejectedMutation[] = [];
	const runnable: ParsedSyncMutation[] = [];

	// 1. Valibot first: a malformed envelope/payload never reaches D1.
	for (const raw of rawMutations) {
		const parsed = parseSyncMutation(raw);
		if (!parsed) {
			rejected.push({ entityId: str((raw as Record<string, unknown>)?.entityId) ?? '', reason: 'invalid' });
			continue;
		}
		runnable.push(parsed);
	}

	// 2. Topological order.
	runnable.sort((a, b) => (ORDER_WEIGHT[a.table] ?? 99) - (ORDER_WEIGHT[b.table] ?? 99));

	// 3. Ownership: resolve every referenced id in one round-trip per table.
	//    A foreign wallet id must never reach the FK or the balance triggers.
	const walletIds = new Set<string>();
	const categoryIds = new Set<string>();
	const transactionIds = new Set<string>();
	for (const mut of runnable) {
		if (mut.table === 'wallets') {
			walletIds.add(mut.entityId);
		} else if (mut.table === 'categories') {
			categoryIds.add(mut.entityId);
		} else {
			transactionIds.add(mut.entityId);
			const walletId = str(mut.payload.walletId);
			const transferWalletId = str(mut.payload.transferWalletId);
			const categoryId = str(mut.payload.categoryId);
			if (walletId) walletIds.add(walletId);
			if (transferWalletId) walletIds.add(transferWalletId);
			if (categoryId) categoryIds.add(categoryId);
		}
	}

	const ownerRows: OwnerRow[][] = await Promise.all([
		walletIds.size > 0
			? db
				.select({ id: wallets.id, userId: wallets.userId })
				.from(wallets)
				.where(inArray(wallets.id, [...walletIds]))
			: [],
		categoryIds.size > 0
			? db
				.select({ id: categories.id, userId: categories.userId })
				.from(categories)
				.where(inArray(categories.id, [...categoryIds]))
			: [],
		transactionIds.size > 0
			? db
				.select({ id: transactions.id, userId: transactions.userId })
				.from(transactions)
				.where(inArray(transactions.id, [...transactionIds]))
			: []
	]);

	const [walletOwners, categoryOwners, transactionOwners] = ownerRows;
	const walletOwner = new Map(walletOwners.map((row) => [row.id, row.userId]));
	const categoryOwner = new Map(categoryOwners.map((row) => [row.id, row.userId]));
	const transactionOwner = new Map(transactionOwners.map((row) => [row.id, row.userId]));
	const owns = (map: Map<string, string>, id: string | null) => id !== null && map.get(id) === userId;

	const serverNow = Date.now();
	// A stale push still has to be visible to the pull that follows it, so the
	// watermark bump must be strictly greater than the cursor just sent.
	const bumpTimestamp = Math.max(serverNow, clientCursor + 1);
	let applied = 0;

	for (const mut of runnable) {
		const { table, op, entityId, hlc: clientHlc, payload } = mut;

		// 4. Ownership gate (before any write).
		let owner: string | undefined;
		if (table === 'wallets') {
			owner = walletOwner.get(entityId);
		} else if (table === 'categories') {
			owner = categoryOwner.get(entityId);
		} else {
			owner = transactionOwner.get(entityId);
			// References are checked for every UPSERT, not just new rows: an
			// existing own transaction must not be re-pointed at a foreign wallet.
			if (op === 'UPSERT') {
				const walletId = str(payload.walletId);
				const transferWalletId = str(payload.transferWalletId);
				const categoryId = str(payload.categoryId);
				const referencesOwned =
					owns(walletOwner, walletId) &&
					(transferWalletId === null || owns(walletOwner, transferWalletId)) &&
					(categoryId === null || owns(categoryOwner, categoryId));
				if (!referencesOwned) {
					rejected.push({ entityId, reason: 'forbidden' });
					continue;
				}
			}
		}
		if (owner !== undefined && owner !== userId) {
			rejected.push({ entityId, reason: 'forbidden' });
			continue;
		}

		// 5. Apply with an LWW guard. Zero rows returned = the write lost to a
		//    newer HLC: report it stale and bump the winner so this client's
		//    delta delivers it.
		//    A client clock running ahead must not win every future conflict:
		//    fold stamps past the server ceiling before the SQL guard sees them.
		const writeHlc = canonicalizeHLC(clientHlc, serverNow);
		const wasClamped = writeHlc !== clientHlc;
		let wrote = 0;
		if (table === 'wallets') {
			if (op === 'DELETE') {
				const rows = await db.all(sql`
					UPDATE wallets SET
						deleted_at = ${nullableStr(payload.deletedAt) ?? new Date(serverNow).toISOString()},
						hlc = ${writeHlc},
						server_updated_at = ${serverNow}
					WHERE user_id = ${userId} AND id = ${entityId} AND ${writeHlc} > hlc
					RETURNING id
				`);
				wrote = rows.length;
			} else {
				const rows = await db.all(sql`
					INSERT INTO wallets (
						id, user_id, name, type, initial_balance, current_balance,
						icon, archived, hlc, server_updated_at, deleted_at, created_at
					) VALUES (
						${entityId}, ${userId}, ${nullableStr(payload.name)}, ${nullableStr(payload.type)},
						${payload.initialBalance ?? 0}, ${payload.currentBalance ?? payload.initialBalance ?? 0},
						${nullableStr(payload.icon)}, ${payload.archived ? 1 : 0}, ${writeHlc},
						${serverNow}, ${nullableStr(payload.deletedAt)},
						${nullableStr(payload.createdAt) ?? new Date(serverNow).toISOString()}
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
					RETURNING id
				`);
				wrote = rows.length;
			}
		} else if (table === 'categories') {
			if (op === 'DELETE') {
				const rows = await db.all(sql`
					UPDATE categories SET
						deleted_at = ${nullableStr(payload.deletedAt) ?? new Date(serverNow).toISOString()},
						hlc = ${writeHlc},
						server_updated_at = ${serverNow}
					WHERE user_id = ${userId} AND id = ${entityId} AND ${writeHlc} > hlc
					RETURNING id
				`);
				wrote = rows.length;
			} else {
				const rows = await db.all(sql`
					INSERT INTO categories (
						id, user_id, name, kind, icon, color,
						archived, hlc, server_updated_at, deleted_at, created_at
					) VALUES (
						${entityId}, ${userId}, ${nullableStr(payload.name)}, ${nullableStr(payload.kind)},
						${nullableStr(payload.icon)}, ${nullableStr(payload.color)},
						${payload.archived ? 1 : 0}, ${writeHlc},
						${serverNow}, ${nullableStr(payload.deletedAt)},
						${nullableStr(payload.createdAt) ?? new Date(serverNow).toISOString()}
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
					RETURNING id
				`);
				wrote = rows.length;
			}
		} else {
			if (op === 'DELETE') {
				const rows = await db.all(sql`
					UPDATE transactions SET
						deleted_at = ${nullableStr(payload.deletedAt) ?? new Date(serverNow).toISOString()},
						hlc = ${writeHlc},
						server_updated_at = ${serverNow}
					WHERE user_id = ${userId} AND id = ${entityId} AND ${writeHlc} > hlc
					RETURNING id
				`);
				wrote = rows.length;
			} else {
				const rows = await db.all(sql`
					INSERT INTO transactions (
						id, user_id, wallet_id, category_id, type, amount,
						transfer_wallet_id, note, occurred_at, receipt_key,
						hlc, server_updated_at, deleted_at, created_at, updated_at
					) VALUES (
						${entityId}, ${userId}, ${nullableStr(payload.walletId)}, ${str(payload.categoryId)},
						${nullableStr(payload.type)}, ${payload.amount}, ${str(payload.transferWalletId)},
						${nullableStr(payload.note)}, ${nullableStr(payload.occurredAt)}, ${nullableStr(payload.receiptKey)},
						${writeHlc}, ${serverNow}, ${nullableStr(payload.deletedAt)},
						${nullableStr(payload.createdAt) ?? new Date(serverNow).toISOString()},
						${nullableStr(payload.updatedAt) ?? new Date(serverNow).toISOString()}
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
					RETURNING id
				`);
				wrote = rows.length;
			}
		}

		if (wrote > 0) {
			applied++;
			// Applied, but the stored stamp is not the client's: tell it to adopt
			// the canonical row. Not `rejected` — the write did land.
			if (wasClamped) canonicalized.push({ entityId, reason: 'clock_skew' });
		} else {
			rejected.push({ entityId, reason: 'stale' });
			// The refused write left the winner's watermark untouched, so bump it:
			// the winner must land in this client's delta. `table` comes from the
			// validated envelope, never from raw input.
			await db.run(sql`
				UPDATE ${sql.identifier(table)} SET server_updated_at = ${bumpTimestamp}
				WHERE user_id = ${userId} AND id = ${entityId}
			`);
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

	const deltaWalletsDto = deltaWallets.map((w) => ({ ...w, archived: Boolean(w.archived) })) as unknown as WalletDTO[];
	const deltaCategoriesDto = deltaCategories.map((c) => ({
		...c,
		archived: Boolean(c.archived)
	})) as unknown as CategoryDTO[];
	const deltaTransactionsDto = deltaTransactions as unknown as TransactionDTO[];

	// The cursor must clear every row we just handed out, otherwise a row
	// written by another device in the same millisecond is skipped forever.
	let maxDelta = 0;
	for (const row of deltaWalletsDto) if (row.serverUpdatedAt > maxDelta) maxDelta = row.serverUpdatedAt;
	for (const row of deltaCategoriesDto) if (row.serverUpdatedAt > maxDelta) maxDelta = row.serverUpdatedAt;
	for (const row of deltaTransactionsDto) if (row.serverUpdatedAt > maxDelta) maxDelta = row.serverUpdatedAt;
	const newCursor = Math.max(serverNow, maxDelta, clientCursor);

	console.log(
		JSON.stringify({
			event: 'sync_cycle',
			userId,
			applied,
			rejected: rejected.length,
			cursor: clientCursor,
			newCursor
		})
	);

	const responsePayload: SyncResponsePayload = {
		newCursor,
		serverNow,
		applied,
		rejected,
		canonicalized,
		delta: {
			wallets: deltaWalletsDto,
			categories: deltaCategoriesDto,
			transactions: deltaTransactionsDto
		}
	};

	return json(responsePayload);
};
