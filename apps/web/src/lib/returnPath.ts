/**
 * Where a sign-in round trip may send someone.
 *
 * Plain functions with no directive, so the client auth pages and the OAuth
 * callback route (server) check `?next=` and `?back=` with the same rule.
 */

const PARSE_BASE = 'http://return-path.invalid';

/** The sign-in pages themselves, and the OAuth callback between them. */
export function isAuthPath(pathname: string): boolean {
  return pathname === '/auth' || pathname.startsWith('/auth/');
}

/**
 * A same-site path taken from the URL, or null.
 *
 * Parsed rather than prefix-checked: the URL parser treats `/\evil.example`
 * and `/<tab>/evil.example` as `//evil.example`, a protocol-relative link off
 * the site, which a `startsWith('//')` test lets through. `router.replace` and
 * the callback's redirect would both follow it with a fresh session in hand.
 *
 * An auth page is refused too. Returning to one is the loop this exists to
 * prevent: signing in on a page whose `next` is the sign-up page used to land
 * a signed-in user back on the sign-up form.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  let url: URL;
  try {
    url = new URL(raw, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE || isAuthPath(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * The page above `path`: `/chess/training` → `/chess`, `/spectate/abc` →
 * `/spectate`, `/profile` → `/`. Every game's hub and the Watch list sit one
 * level up from the pages that need an account, so this is where a guest goes
 * back to when they came straight to one of those pages.
 */
export function parentPath(path: string): string {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '');
  const cut = pathname.lastIndexOf('/');
  return cut <= 0 ? '/' : pathname.slice(0, cut);
}
