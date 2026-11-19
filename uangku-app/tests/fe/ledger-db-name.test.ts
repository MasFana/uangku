import { describe, expect, it } from 'vitest';
import { LEGACY_IDB_NAME, ledgerDbName } from '../../src/lib/client/db/idb';

describe('ledgerDbName', () => {
	it('gives distinct names to distinct users', () => {
		const ids = ['user-a', 'user-b', 'user-a2', '0000-1111', 'Ünïcode-id'];
		const names = ids.map(ledgerDbName);
		expect(new Set(names).size).toBe(ids.length);
	});

	it('is stable for the same user id', () => {
		expect(ledgerDbName('user-a')).toBe(ledgerDbName('user-a'));
	});

	it('never collides with the legacy shared database name', () => {
		for (const id of ['', 'user-a', LEGACY_IDB_NAME]) {
			expect(ledgerDbName(id)).not.toBe(LEGACY_IDB_NAME);
		}
	});
});
