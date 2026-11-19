// Single source of truth now lives in `$lib/shared/default-categories` so the client can
// seed the same list offline. Kept here as a re-export for existing server imports.
export { DEFAULT_CATEGORIES, type DefaultCategory } from '$lib/shared/default-categories';
