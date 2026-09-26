/**
 * Where a sign-in may send someone afterwards: an in-app path, or nothing.
 *
 * `next` arrives on the sign-in and choose-username screens as a query param,
 * and both are reachable by deep link, so it is whatever a stranger's link
 * says. It ends up in `router.replace`, and Expo Router hands anything that
 * looks like a URL — `https:`, `tel:`, `sms:`, `market:`, `//host`, another
 * app's scheme — to `Linking.openURL` (`shouldLinkExternally` in its
 * `utils/url.js`). So a link could send someone off the app, to a page of the
 * sender's choosing, straight after a sign-in they did themselves (security
 * audit v2, GX-24).
 *
 * The rule is narrower than "not external", so it does not lean on Expo
 * Router's test staying what it is today: one leading slash, plain path
 * characters, no `//` and no `.`/`..` segment anywhere in the path. A
 * backslash, a space or a control character is refused rather than trusted to
 * be normalised the harmless way, which is how web's version was bypassed
 * (GX-11). An auth screen is refused too: returning to one after signing in is
 * a loop, not a destination. The app itself only ever sends `/profile`.
 */
const PATH = /^\/[\w\-./()]*$/;
const QUERY = /^[\w\-./?=&%#~+,()]*$/;
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$)/;

/** Auth screens, with or without their `(auth)` group segment. */
const AUTH_SCREEN = /^\/(\(auth\)\/)?(sign-in|sign-up|choose-username)\/?$/;

export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cut = raw.search(/[?#]/);
  const path = cut < 0 ? raw : raw.slice(0, cut);
  const rest = cut < 0 ? '' : raw.slice(cut);
  if (!PATH.test(path) || !QUERY.test(rest)) return null;
  if (path.includes('//') || DOT_SEGMENT.test(path) || AUTH_SCREEN.test(path)) return null;
  return raw;
}
