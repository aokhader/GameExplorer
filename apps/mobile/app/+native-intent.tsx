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
 * Query params only the app itself may set. `start` starts a game (`start=1`
 * is the tour and the first-run card, `start=last` is Play again), `resume`
 * opens the saved one, and `elo` / `casual` choose how it is played.
 *
 * A link from outside — a chat message, a web page, a QR code, another app —
 * could set them too. `gameexplorer://play/chess?elo=2800&start=1` started a
 * rated game against the strongest bot the moment it was tapped, with no setup
 * screen to back out of; walking away counted as resigning, and the 2800 was
 * saved as the player's remembered strength (security audit v2, GX-12).
 *
 * So every incoming link loses them here. The app's own navigation never passes
 * through this file (Expo Router calls it only for the launch URL and for
 * `Linking` events), so the tour, the launcher and Continue keep working. A link
 * can still open any of those screens; the player starts the game.
 */
const IN_APP_ONLY = ['start', 'resume', 'elo', 'casual'] as const;

/**
 * `appPath` without the in-app-only params, or null if it had none.
 *
 * Read the way Expo Router reads it (a URL parser, in its `getStateFromPath`):
 * the query ends at the first `#`, and a key is compared decoded, so
 * `st%61rt=1` and a repeated `start` are caught too. The caller has already
 * dropped tabs and newlines, as a URL parser does.
 */
function withoutInAppParams(appPath: string): string | null {
  const hashAt = appPath.indexOf('#');
  const beforeHash = hashAt < 0 ? appPath : appPath.slice(0, hashAt);
  const fragment = hashAt < 0 ? '' : appPath.slice(hashAt);
  const q = beforeHash.indexOf('?');
  if (q < 0) return null;

  const params = new URLSearchParams(beforeHash.slice(q + 1));
  if (!IN_APP_ONLY.some((name) => params.has(name))) return null;
  for (const name of IN_APP_ONLY) params.delete(name);
  const query = params.toString();
  return `${beforeHash.slice(0, q)}${query ? `?${query}` : ''}${fragment}`;
}

/**
 * The logical in-app path of an incoming link.
 *
 * Expo Router hands `redirectSystemPath` the **whole URL**, not a path
 * (`link/linking.js` passes the `Linking` event's `url` straight through), and
 * the three forms it arrives in do not agree on where the path starts:
 *
 *   https://gameexplorer.app/chess/play?invite=1   → authority is a host
 *   gameexplorer://chess/play?invite=1             → "chess" is a path segment
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
  // Tabs and newlines are dropped the way a URL parser — and so Expo Router —
  // drops them, or `st%0Aart`-style spellings would slip past as a key.
  const appPath = toAppPath(path).replace(/[\t\n\r]/g, '');
  const [rawPath, query = ''] = appPath.split('?');
  const segments = rawPath.split('/').filter(Boolean);

  if (segments.length === 2 && segments[1].toLowerCase() === 'play') {
    const game = segments[0].toLowerCase();
    if ((GAMES as readonly string[]).includes(game)) {
      const params = new URLSearchParams(query);
      for (const name of IN_APP_ONLY) params.delete(name);
      params.set('online', '1');
      return `/play/${game}?${params.toString()}`;
    }
  }

  // A link that tries to start or configure a game opens the screen without
  // doing either (IN_APP_ONLY above).
  const stripped = withoutInAppParams(appPath);
  if (stripped != null) return stripped;

  // Anything else — /spectate/<id>, /learn/<game>, the OAuth callback — already
  // matches a route, or is meant to fall through to the unmatched screen. It is
  // returned as the *original* string: rewriting a link that needs no rewrite is
  // how a working route (the OAuth callback, in particular) gets broken.
  return path;
}
