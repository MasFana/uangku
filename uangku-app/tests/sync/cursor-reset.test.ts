import { describe, expect, it } from 'vitest';
import { shouldResetCursor } from '../../src/lib/client/sync/cursor-reset';

describe('shouldResetCursor', () => {
	it('keeps the cursor when the stored version matches the running one', () => {
		expect(shouldResetCursor(true, '1.4.0', '1.4.0')).toBe(false);
	});

	it('resets the cursor when the app version changed', () => {
		expect(shouldResetCursor(true, '1.4.0', '1.4.1')).toBe(true);
	});

	it('does not reset a fresh install (no cursor yet)', () => {
		expect(shouldResetCursor(false, null, '1.4.0')).toBe(false);
		expect(shouldResetCursor(false, undefined, '1.4.0')).toBe(false);
		// Even a stamped version must not reset when no cursor exists to drop.
		expect(shouldResetCursor(false, '1.4.0', '1.4.1')).toBe(false);
	});

	it('resets a legacy DB (cursor with no recorded version)', () => {
		expect(shouldResetCursor(true, null, '1.4.0')).toBe(true);
		expect(shouldResetCursor(true, undefined, '1.4.0')).toBe(true);
		expect(shouldResetCursor(true, '', '1.4.0')).toBe(true);
	});
});
