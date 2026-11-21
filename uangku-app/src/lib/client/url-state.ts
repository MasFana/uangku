import { page } from '$app/state';

/**
 * The URL the user is actually on.
 *
 * SvelteKit 3 keeps `page.url` at the last real navigation. A
 * `goto(url, { shallow: true })` only changes the address bar and
 * `page.shallow.url`. URL-backed state (filters, pagination, tabs) must read
 * this helper instead of `page.url`, or it keeps showing the old values.
 */
export function currentUrl() {
	const shallow = page.shallow;
	return shallow ? shallow.url : page.url;
}
