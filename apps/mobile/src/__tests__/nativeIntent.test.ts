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
