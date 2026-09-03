/**
 * iOS Universal Links association file.
 *
 * The counterpart to `assetlinks.json`: it tells iOS that this site and the app
 * share a publisher, so tapping an invite link opens the app instead of Safari.
 *
 * `APPLE_TEAM_ID` is the 10-character prefix from the Apple Developer account
 * (Membership → Team ID). Public information, but deployment-specific — hence
 * the environment rather than the repo. Unset means 404, for the same reason as
 * the Android file: a wrong association is worse than a missing one.
 *
 * Two details iOS is strict about and Android is not:
 *  - The file has **no extension** and must be served as `application/json`.
 *  - Paths are matched against the URL *path only*, so `?invite=` cannot be
 *    expressed here — `/chess/play` and friends are claimed whole, and the app
 *    reads the query itself (see `app/+native-intent.tsx` on mobile).
 */
import { GAME_LIST } from '@finesse/shared';

export const dynamic = 'force-static';

const BUNDLE_ID = 'com.finesse.app';

/**
 * Every route an invite or spectate link can point at, derived from the catalog
 * rather than typed out: only games offering `online` can produce an invite
 * link, so a hand-written list here goes stale the moment a game gains or loses
 * that mode. Android's equivalent is `intentFilters` in
 * `apps/mobile/app.config.ts`, and the two must agree.
 */
const PATHS = [
  ...GAME_LIST.filter((g) => g.modes.includes('online')).map((g) => `/${g.slug}/play`),
  '/spectate/*',
];

export function GET(): Response {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new Response('Not configured', { status: 404 });

  const body = {
    applinks: {
      details: [{ appIDs: [`${teamId}.${BUNDLE_ID}`], components: PATHS.map((p) => ({ '/': p })) }],
    },
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
