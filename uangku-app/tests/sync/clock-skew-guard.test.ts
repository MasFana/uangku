import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import { MAX_HLC_FUTURE_SKEW_MS, parseHLC } from '../../src/lib/shared/hlc';

const userA = 'user-a';

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

/** Same wire format as `formatHLC` in $lib/shared/hlc. */
const mkHlc = (timestampMs: number, counter: number, nodeId: string) =>
	`${Math.max(0, timestampMs).toString(36).padStart(9, '0')}-${counter
		.toString(36)
		.padStart(4, '0')}-${nodeId}`;

const walletUpsert = (entityId: string, hlc: string, name: string) => ({
	entityId,
	table: 'wallets',
	op: 'UPSERT',
	hlc,
	payload: { id: entityId, name, type: 'cash', initialBalance: 5000, archived: false }
});

async function storedHlc(entityId: string): Promise<string> {
	const rows = await db.select().from(schema.wallets).where(eq(schema.wallets.id, entityId));
	expect(rows).toHaveLength(1);
	return rows[0].hlc;
}

describe('POST /api/sync clock-skew guard', () => {
	beforeAll(async () => {
		proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false });
		await applyMigrations(proxy.env.APP_DB);
		db = drizzle(proxy.env.APP_DB, { schema });
		const now = new Date();
		await db
			.insert(schema.users)
			.values([{ id: userA, name: 'Alice', email: 'alice@example.com', createdAt: now, updatedAt: now }]);
	});

	afterAll(async () => {
		await proxy?.dispose();
	});

	it('clamps a stamp one hour ahead to the server clock and reports it canonicalized', async () => {
		const farAhead = mkHlc(Date.now() + 60 * 60_000, 7, 'device-a');
		const response = await postSync(userA, {
			cursor: 0,
			mutations: [walletUpsert('w-skew', farAhead, 'Skewed')]
		});

		expect(response.applied).toBe(1);
		expect(response.rejected).toEqual([]);
		expect(response.canonicalized).toEqual([{ entityId: 'w-skew', reason: 'clock_skew' }]);

		const stored = await storedHlc('w-skew');
		expect(stored).not.toBe(farAhead);
		const parsed = parseHLC(stored);
		expect(parsed?.timestampMs).toBe(response.serverNow); // fold to server clock, not ceiling
		expect(parsed?.counter).toBe(7); // counter + node id survive the fold
		expect(parsed?.nodeId).toBe('device-a');
	});

	// Regression: folding to the ceiling parked the row in the future, so a
	// normal edit during the skew window compared older and was rejected as
	// stale. Folding to the server clock keeps the row writable.
	it('accepts a normal edit of the same row right after a clamped push', async () => {
		const farAhead = mkHlc(Date.now() + 60 * 60_000, 2, 'device-future');
		const first = await postSync(userA, {
			cursor: 0,
			mutations: [walletUpsert('w-unwritable', farAhead, 'Future')]
		});
		expect(first.applied).toBe(1);
		expect(await storedHlc('w-unwritable')).toBe(
			mkHlc(first.serverNow, 2, 'device-future')
		);

		const normal = mkHlc(first.serverNow + 1_000, 1, 'device-a');
		const second = await postSync(userA, {
			cursor: 0,
			mutations: [walletUpsert('w-unwritable', normal, 'Edited')]
		});

		expect(second.applied).toBe(1);
		expect(second.rejected).toEqual([]);
		expect(second.canonicalized).toEqual([]);
		expect(await storedHlc('w-unwritable')).toBe(normal);
	});

	it('leaves a stamp inside the future window byte-identical', async () => {
		const inside = mkHlc(Date.now() + 60_000, 3, 'device-b');
		const response = await postSync(userA, {
			cursor: 0,
			mutations: [walletUpsert('w-inside', inside, 'Inside')]
		});

		expect(response.applied).toBe(1);
		expect(response.rejected).toEqual([]);
		expect(response.canonicalized).toEqual([]);
		expect(await storedHlc('w-inside')).toBe(inside);
	});

	it('leaves a stamp exactly at the ceiling unchanged', async () => {
		const fixedNow = 1_800_000_000_000;
		vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
		let response: SyncResponsePayload;
		try {
			const atCeiling = mkHlc(fixedNow + MAX_HLC_FUTURE_SKEW_MS, 1, 'device-c');
			response = await postSync(userA, {
				cursor: 0,
				mutations: [walletUpsert('w-ceiling', atCeiling, 'Ceiling')]
			});
			expect(response.serverNow).toBe(fixedNow);
			expect(response.applied).toBe(1);
			expect(response.rejected).toEqual([]);
			expect(response.canonicalized).toEqual([]);
			expect(await storedHlc('w-ceiling')).toBe(atCeiling);
		} finally {
			vi.restoreAllMocks();
		}
	});

	// A clock years behind is NOT this guard's concern: the stamp is already
	// below the ceiling, so the pre-existing LWW rule decides. A brand-new row
	// applies as-is; a second, older stamp on the same row loses as `stale`.
	it('does not clamp an old stamp; LWW decides instead', async () => {
		const old = mkHlc(Date.now() - 730 * 24 * 60 * 60_000, 1, 'device-slow');
		const first = await postSync(userA, {
			cursor: 0,
			mutations: [walletUpsert('w-old', old, 'Old clock')]
		});

		expect(first.applied).toBe(1);
		expect(first.rejected).toEqual([]);
		expect(first.canonicalized).toEqual([]);
		expect(await storedHlc('w-old')).toBe(old);

		const older = mkHlc(Date.now() - 731 * 24 * 60 * 60_000, 1, 'device-slow');
		const second = await postSync(userA, {
			cursor: 0,
			mutations: [walletUpsert('w-old', older, 'Even older clock')]
		});

		expect(second.applied).toBe(0);
		expect(second.rejected).toEqual([{ entityId: 'w-old', reason: 'stale' }]);
		expect(second.canonicalized).toEqual([]);
		expect(await storedHlc('w-old')).toBe(old);
	});
});