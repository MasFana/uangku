/**
 * App-upgrade cursor policy (pure, no IDB, no runes).
 *
 * `sync_meta.cursor` is a watermark over the server's `server_updated_at`: rows
 * stamped at or below it are never re-delivered. That is only sound while the
 * client's merge rules are unchanged, so when `SYNC_PROTOCOL_VERSION` changes the
 * cursor is dropped once and the next pull is a full delta. The build version is
 * deliberately not used: every deploy would otherwise re-download every ledger.
 */

/** `sync_meta` keys owned here; the engine reads/writes them via `idbGet`/`idbPut`. */
export const CURSOR_META_KEY = 'cursor';
export const SYNC_PROTOCOL_META_KEY = 'syncProtocol';

/**
 * True when a cursor exists and was recorded under a different protocol version.
 *
 * `hasCursor` is what distinguishes the two "no version stamped" states:
 * - no cursor at all = fresh install; its first pull is already a full delta, so
 *   there is nothing to reset;
 * - cursor but no (or empty) version = DB written by a build older than this check,
 *   i.e. exactly the installs whose rows were pushed under the old merge rules and
 *   whose cursor already passed them. Those MUST reset or their rows stay "pending"
 *   forever, so a missing version counts as "different".
 */
export function shouldResetCursor(
	hasCursor: boolean,
	storedVersion: string | null | undefined,
	currentVersion: string
): boolean {
	return hasCursor && storedVersion !== currentVersion;
}
