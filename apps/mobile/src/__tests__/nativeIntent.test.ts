import { redirectSystemPath } from '../../app/+native-intent';

/**
 * The rewrite that makes a *web* invite link open the *mobile* app on a route
 * that exists. Getting it wrong is invisible in every other gate — typecheck,
 * lint and component tests all pass while a link a friend sent lands on the
 * router's "Unmatched Route" screen.
 *
 * The cases below are the URL *forms Expo Router actually delivers*, not bare
 * paths. An earlier version of this file tested `/chess/play?invite=…` and
 * passed while the real thing — `gameexplorer://chess/play?invite=…` — fell
 * through untouched, because `redirectSystemPath` is handed the whole URL and a
 * custom scheme's "host" is really its first path segment.
 */
const intent = (path: string) => redirectSystemPath({ path, initial: true });

const WEB = 'https://game-explorer-site.vercel.app';

describe('redirectSystemPath — invite links, in every form they arrive', () => {
  it('rewrites an https App Link (what the server actually sends)', () => {
    expect(intent(`${WEB}/chess/play?invite=abc123`)).toBe('/play/chess?invite=abc123&online=1');
  });

  it('rewrites a custom-scheme link, whose "host" is a path segment', () => {
    expect(intent('gameexplorer://chess/play?invite=abc123')).toBe(
      '/play/chess?invite=abc123&online=1',
    );
  });

  it('rewrites a dev-client / Expo Go link, whose path follows `--`', () => {
    expect(intent('exp://192.168.1.5:8081/--/chess/play?invite=abc123')).toBe(
      '/play/chess?invite=abc123&online=1',
    );
  });

  it('handles a bare path too, since one costs nothing to accept', () => {
    expect(intent('/checkers/play?invite=x')).toBe('/play/checkers?invite=x&online=1');
  });

  it('handles all three games', () => {
    for (const game of ['chess', 'checkers', 'reversi']) {
      expect(intent(`${WEB}/${game}/play?invite=x`)).toBe(`/play/${game}?invite=x&online=1`);
    }
  });

  it('opens online mode even without an invite id', () => {
    // `/{game}/play` with no query is web's plain "play online" route.
    expect(intent(`${WEB}/chess/play`)).toBe('/play/chess?online=1');
  });

  it('is case-insensitive, since links get typed and pasted', () => {
    expect(intent(`${WEB}/Chess/Play?invite=abc`)).toBe('/play/chess?invite=abc&online=1');
  });
});

describe('redirectSystemPath — everything else passes through untouched', () => {
  /**
   * Returned verbatim, not normalised: the OAuth callback in particular is a
   * working link today, and "improving" its shape on the way past is how that
   * breaks.
   */
  it('leaves routes the app already has alone', () => {
    for (const path of [
      `${WEB}/spectate/game-1`,
      'gameexplorer://auth/callback#access_token=x',
      'gameexplorer://spectate/game-1',
      `${WEB}/learn/chess`,
      '/play/chess',
      '/',
    ]) {
      expect(intent(path)).toBe(path);
    }
  });

  /**
   * `/liquidate/play` does not exist on either platform and `/go/play` is a game
   * we don't have. Neither should be rewritten into a `/play/[game]` route that
   * would render the unknown-game placeholder as if it were real.
   */
  it('does not claim /play under a game the app does not ship', () => {
    expect(intent(`${WEB}/liquidate/play`)).toBe(`${WEB}/liquidate/play`);
    expect(intent('gameexplorer://go/play?invite=abc')).toBe('gameexplorer://go/play?invite=abc');
  });

  it('ignores a deeper path that merely contains "play"', () => {
    expect(intent(`${WEB}/chess/play/extra`)).toBe(`${WEB}/chess/play/extra`);
    expect(intent(`${WEB}/chess/learn`)).toBe(`${WEB}/chess/learn`);
  });
});

/**
 * Security audit v2, GX-12. A link from outside could start a rated game
 * against the 2800 bot the moment it was tapped, and save 2800 as the player's
 * remembered strength. The params that start or configure a game are the
 * app's own; every incoming link loses them, and the screen opens on its form.
 */
describe('redirectSystemPath — a link cannot start or configure a game', () => {
  it('drops the tour-style auto-start from a custom-scheme link', () => {
    expect(intent('gameexplorer://play/chess?elo=2800&start=1')).toBe('/play/chess');
  });

  it('drops every in-app-only param, in every URL form', () => {
    for (const link of [
      'gameexplorer://play/checkers?start=1&elo=1800&casual=0',
      'gameexplorer:///play/checkers?start=last',
      'exp+gameexplorer://play/checkers?resume=1',
      'exp://192.168.1.5:8081/--/play/checkers?start=1',
      '/play/checkers?start=1',
    ]) {
      expect(intent(link)).toMatch(/^\/+play\/checkers$/);
    }
  });

  it('covers games that have no invite links too', () => {
    expect(intent('gameexplorer://play/go?start=1&elo=2000')).toBe('/play/go');
    expect(intent('gameexplorer://play/liquidate?start=1')).toBe('/play/liquidate');
    expect(intent('gameexplorer://play/go?resume=1')).toBe('/play/go');
  });

  it('keeps every other param, so the rest of the link still works', () => {
    expect(intent('gameexplorer://spectate/g-1?white=Ann&start=1&black=Bob')).toBe(
      '/spectate/g-1?white=Ann&black=Bob',
    );
    expect(intent('gameexplorer://play/chess?online=1&elo=2800')).toBe('/play/chess?online=1');
  });

  it('strips them from an invite link as well', () => {
    expect(intent(`${WEB}/chess/play?invite=abc&start=1&elo=2800&casual=0`)).toBe(
      '/play/chess?invite=abc&online=1',
    );
    expect(intent('gameexplorer://reversi/play?invite=abc&resume=1')).toBe(
      '/play/reversi?invite=abc&online=1',
    );
  });

  it('is not fooled by how the key is spelled', () => {
    for (const link of [
      'gameexplorer://play/chess?st%61rt=1&elo=2800', // percent-encoded key
      'gameexplorer://play/chess?start=1&start=1&elo=2800', // repeated key
      'gameexplorer://play/chess?st\nart=1&e\tlo=2800', // a URL parser drops tabs and newlines
      'gameexplorer://play/chess?start=1&elo=2800#section', // a fragment after the query
    ]) {
      expect(intent(link)).toMatch(/^\/play\/chess(#section)?$/);
    }
  });

  it('leaves a param that only looks like one inside the fragment, where the router never reads it', () => {
    expect(intent('gameexplorer://play/chess#?start=1')).toBe('gameexplorer://play/chess#?start=1');
  });
});
