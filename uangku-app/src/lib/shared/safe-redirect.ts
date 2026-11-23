/**
 * Turn an arbitrary `redirectTo` value into a path on this site.
 *
 * A target that could leave the site becomes `/`: an absolute URL, a
 * protocol-relative `//host`, and the `/\host` form that some browsers read as
 * protocol-relative. Better-Auth does not check `callbackURL` itself, so every
 * value that reaches it must come through here first.
 */
export function safeRedirectPath(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
	return raw;
}
