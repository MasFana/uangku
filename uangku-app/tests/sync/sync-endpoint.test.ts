import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestEvent } from '@sveltejs/kit';
import * as schema from '../../src/lib/server/db/schema';
import { POST } from '../../src/routes/api/sync/+server';
import type { SyncResponsePayload } from '../../src/lib/shared/sync-contract';

const userA = 'user-a';
const userB = 'user-b';

type Env = { APP_DB: D1Database };

let proxy: PlatformProxy<Env>;
let db: DrizzleD1Database<typeof schema>;

async function applyMigrations(d1: D1Database): Promise<void> {
	for (const file of ['drizzle/0000_useful_black_widow.sql', 'drizzle/0002_hlc_sync_rollups_triggers.sql']) {
		const sqlContent = readFileSync(join(__dirname, '../..', file), 'utf8');
		const statements = sqlContent
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter(Boolean);
		for (const statement of statements) {
			await d1.prepare(statement).run();
		}
	}
}

async function postSync(userId: string, body: unknown): Promise<SyncResponsePayload> {
	const request = new Request('https://uangku.test/api/sync', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	// The route only reads `locals`, `request` and `platform`; the rest of a
	// RequestEvent (cookies, fetch, ...) is irrelevant to it.
	const event = { locals: { user: { id: userId }, db }, request, platform: {} } as unknown as RequestEvent;
	const response = await POST(event);
	return (await response.json()) as SyncResponsePayload;
}

const walletUpsert = (hlc: string, name: string) => ({
	entityId: 'w1',
	table: 'wallets',
	op: 'UPSERT',
	hlc,
	payload: { id: 'w1', name, type: 'cash', initialBalance: 5000, archived: false }
});

function maxDeltaWatermark(response: SyncResponsePayload): number {
	let max = 0;
	for (const row of [...response.delta.wallets, ...response.delta.categories, ...response.delta.transactions]) {
		if (row.serverUpdatedAt > max) max = row.serverUpdatedAt;
	}
	return max;
}

describe('POST /api/sync', () => {
	beforeAll(async () => {
		proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false });
		await applyMigrations(proxy.env.APP_DB);
		db = drizzle(proxy.env.APP_DB, { schema });
		const now = new Date();
		await db.insert(schema.users).values([
			{ id: userA, name: 'Alice', email: 'alice@example.com', createdAt: now, updatedAt: now },
			{ id: userB, name: 'Bob', email: 'bob@example.com', createdAt: now, updatedAt: now }
		]);
	});

	afterAll(async () => {
		await proxy?.dispose();
	});

	it('rejects a stale push, keeps the winner, bumps its watermark and delivers it', async () => {
		const winner = await postSync(userA, { cursor: 0, mutations: [walletUpsert('000000b', 'Winner')] });
		expect(winner.applied).toBe(1);
		expect(winner.rejected).toEqual([]);
		expect(winner.newCursor).toBeGreaterThanOrEqual(maxDeltaWatermark(winner));

		const stale = await postSync(userA, {
			cursor: winner.newCursor,
			mutations: [walletUpsert('000000a', 'Loser')]
		});
		expect(stale.applied).toBe(0);
		expect(stale.rejected).toEqual([{ entityId: 'w1', reason: 'stale' }]);

		const rows = await db.select().from(schema.wallets).where(eq(schema.wallets.id, 'w1'));
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('Winner');
		expect(rows[0].hlc).toBe('000000b');
		// The refused write still has to be pullable by the pushing client.
		expect(rows[0].serverUpdatedAt).toBeGreaterThan(winner.newCursor);

		const delivered = stale.delta.wallets.find((w) => w.id === 'w1');
		expect(delivered?.name).toBe('Winner');
		expect(stale.newCursor).toBeGreaterThanOrEqual(maxDeltaWatermark(stale));
	});

	it('rejects a stale DELETE without tombstoning the winner', async () => {
		const stale = await postSync(userA, {
			cursor: 0,
			mutations: [{ entityId: 'w1', table: 'wallets', op: 'DELETE', hlc: '000000a', payload: {} }]
		});
		expect(stale.applied).toBe(0);
		expect(stale.rejected).toEqual([{ entityId: 'w1', reason: 'stale' }]);

		const rows = await db.select().from(schema.wallets).where(eq(schema.wallets.id, 'w1'));
		expect(rows[0].deletedAt).toBeNull();
		expect(rows[0].hlc).toBe('000000b');
	});

	it('rejects invalid payloads and writes nothing', async () => {
		const response = await postSync(userA, {
			cursor: 0,
			mutations: [
				{
					entityId: 'bad1',
					table: 'wallets',
					op: 'UPSERT',
					hlc: '0000001',
					payload: { id: 'bad1', name: 'Bad', type: 'cash', initialBalance: 1.5 }
				},
				{
					entityId: 'bad2',
					table: 'transactions',
					op: 'UPSERT',
					hlc: '0000002',
					payload: {
						id: 'bad2',
						walletId: 'w1',
						type: 'expense',
						amount: -100,
						occurredAt: '2026-01-01T00:00:00.000Z'
					}
				},
				{ entityId: 'bad3', table: 'users', op: 'UPSERT', hlc: '0000003', payload: { id: 'bad3' } }
			]
		});
		expect(response.applied).toBe(0);
		expect(response.rejected).toEqual([
			{ entityId: 'bad1', reason: 'invalid' },
			{ entityId: 'bad2', reason: 'invalid' },
			{ entityId: 'bad3', reason: 'invalid' }
		]);

		expect(await db.select().from(schema.wallets).where(eq(schema.wallets.id, 'bad1'))).toHaveLength(0);
		expect(await db.select().from(schema.transactions).where(eq(schema.transactions.id, 'bad2'))).toHaveLength(0);
	});

	it('rejects mutations touching another user wallet and writes nothing', async () => {
		await db.insert(schema.wallets).values({
			id: 'bw1',
			userId: userB,
			name: 'Bob Wallet',
			type: 'cash',
			initialBalance: 0,
			currentBalance: 0,
			hlc: '',
			serverUpdatedAt: 0,
			createdAt: new Date().toISOString()
		});

		const response = await postSync(userA, {
			cursor: 0,
			mutations: [
				{
					entityId: 'tx-foreign',
					table: 'transactions',
					op: 'UPSERT',
					hlc: '0000001',
					payload: {
						id: 'tx-foreign',
						walletId: 'bw1',
						type: 'expense',
						amount: 100,
						occurredAt: '2026-01-01T00:00:00.000Z'
					}
				},
				{
					entityId: 'bw1',
					table: 'wallets',
					op: 'UPSERT',
					hlc: '0000002',
					payload: { id: 'bw1', name: 'Hijacked', type: 'cash', initialBalance: 0 }
				}
			]
		});
		expect(response.applied).toBe(0);
		// Mutations are applied (and therefore reported) wallets -> categories -> transactions.
		expect(response.rejected).toEqual([
			{ entityId: 'bw1', reason: 'forbidden' },
			{ entityId: 'tx-foreign', reason: 'forbidden' }
		]);

		expect(await db.select().from(schema.transactions).where(eq(schema.transactions.id, 'tx-foreign'))).toHaveLength(0);
		const bobWallet = await db.select().from(schema.wallets).where(eq(schema.wallets.id, 'bw1'));
		expect(bobWallet[0].name).toBe('Bob Wallet');
		expect(bobWallet[0].currentBalance).toBe(0);

		// Re-pointing an already-owned transaction at a foreign wallet is forbidden too.
		const own = await postSync(userA, {
			cursor: 0,
			mutations: [
				{
					entityId: 'tx-own',
					table: 'transactions',
					op: 'UPSERT',
					hlc: '0000010',
					payload: {
						id: 'tx-own',
						walletId: 'w1',
						type: 'expense',
						amount: 500,
						occurredAt: '2026-01-02T00:00:00.000Z'
					}
				}
			]
		});
		expect(own.applied).toBe(1);

		const repoint = await postSync(userA, {
			cursor: 0,
			mutations: [
				{
					entityId: 'tx-own',
					table: 'transactions',
					op: 'UPSERT',
					hlc: '0000011',
					payload: {
						id: 'tx-own',
						walletId: 'bw1',
						type: 'expense',
						amount: 500,
						occurredAt: '2026-01-02T00:00:00.000Z'
					}
				}
			]
		});
		expect(repoint.applied).toBe(0);
		expect(repoint.rejected).toEqual([{ entityId: 'tx-own', reason: 'forbidden' }]);
		const ownRow = await db.select().from(schema.transactions).where(eq(schema.transactions.id, 'tx-own'));
		expect(ownRow[0].walletId).toBe('w1');
	});
});
