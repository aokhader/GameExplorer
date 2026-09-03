/**
 * Maps an incoming deep link onto a route this app actually has.
 *
 * The server builds invite links for the **web** app — `/{game}/play?invite=<id>`
 * (see `inviteUrl` in `apps/api/src/services/invite.service.ts`) — and the same
 * URL has to open the mobile app when it's installed. Mobile's routes are
 * shaped differently: there is one `/play/[game]` screen with online as a mode
 * inside it, not a separate `/play` route per game. Without this rewrite an App
 * Link lands on a path that does not exist and shows the router's "Unmatched
 * Route" screen — the worst possible first impression for a link a friend sent.
 *
 * Rewriting here rather than adding an `app/[game]/play.tsx` route keeps a
 * dynamic segment out of the root, where it would shadow `/settings`,
 * `/welcome`, `/analysis` and the rest.
 */
const GAMES = ['chess', 'checkers', 'reversi'] as const;

/**
 * The logical in-app path of an incoming link.
 *
 * Expo Router hands `redirectSystemPath` the **whole URL**, not a path
 * (`link/linking.js` passes the `Linking` event's `url` straight through), and
 * the three forms it arrives in do not agree on where the path starts:
 *
 *   https://finesse.games/chess/play?invite=1 → authority is a host
 *   finesse://chess/play?invite=1             → "chess" is a path segment
 *   exp://192.168.1.5:8081/--/chess/play?invite=1  → path follows the `--`
 *
 * A custom scheme has no authority, so the part a URL parser calls the host is
 * really the first segment — dropping it (the obvious reading) is what makes an
 * invite tapped from a messenger open the app on nothing.
 */
function toAppPath(raw: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw);
  if (!scheme) return raw.startsWith('/') ? raw : `/${raw}`;

  const rest = raw.slice(scheme[0].length);
  const isWeb = /^https?$/i.test(scheme[1]);

  // Expo Go / dev-client links put the app path after a `--` segment.
  const marker = rest.indexOf('/--/');
  if (marker >= 0) return `/${rest.slice(marker + 4)}`;

  if (!isWeb) return `/${rest}`;
  const slash = rest.indexOf('/');
  return slash >= 0 ? rest.slice(slash) : '/';
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const appPath = toAppPath(path);
  const [rawPath, query = ''] = appPath.split('?');
  const segments = rawPath.split('/').filter(Boolean);

  if (segments.length === 2 && segments[1].toLowerCase() === 'play') {
    const game = segments[0].toLowerCase();
    if ((GAMES as readonly string[]).includes(game)) {
      const params = new URLSearchParams(query);
      params.set('online', '1');
      return `/play/${game}?${params.toString()}`;
    }
  }

  // Anything else — /spectate/<id>, /learn/<game>, the OAuth callback — already
  // matches a route, or is meant to fall through to the unmatched screen. It is
  // returned as the *original* string: rewriting a link that needs no rewrite is
  // how a working route (the OAuth callback, in particular) gets broken.
  return path;
}
