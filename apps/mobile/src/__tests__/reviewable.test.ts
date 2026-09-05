import fs from 'fs';
import path from 'path';
import { REVIEWABLE, REVIEWABLE_GAMES, isReviewable } from '@/analysis/reviewable';

/**
 * The list of game types review can handle.
 *
 * This exists because the failure it guards is invisible. `/review/[id]` falls
 * back to the **chess** replayer for any type it does not branch on, so a game
 * the profile offers but review does not implement gets its move list read as
 * chess moves — no crash, no error, just a board showing a game nobody played.
 * A typecheck cannot see it, because every move object is structurally
 * compatible enough to get partway through.
 *
 * The route and the profile now read one list. What is left to assert is that
 * the route actually *branches* on every type in it.
 */

const ROUTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'review', '[id].tsx'),
  'utf8',
);

describe('REVIEWABLE', () => {
  it('names the four games with a replayer and an adapter', () => {
    expect([...REVIEWABLE_GAMES].sort()).toEqual(['checkers', 'chess', 'go', 'reversi']);
  });

  it('accepts only what it names', () => {
    for (const game of REVIEWABLE_GAMES) expect(isReviewable(game)).toBe(true);
    expect(isReviewable('liquidate' as never)).toBe(false);
    expect(isReviewable(undefined)).toBe(false);
    // The set and the predicate are the same fact; the profile reads one and
    // the route the other, so they must not be able to disagree.
    expect(REVIEWABLE.size).toBe(REVIEWABLE_GAMES.length);
    for (const game of REVIEWABLE_GAMES) expect(REVIEWABLE.has(game)).toBe(true);
  });

  it('is the same list the route gates on', () => {
    // Both read `reviewable.ts`; this catches a future edit that reintroduces a
    // local copy in the route.
    expect(ROUTE).toContain('isReviewable(gameType)');
    expect(ROUTE).not.toMatch(/const\s+reviewSupported\s*=\s*gameType\s*===/);
  });

  it.each(
    REVIEWABLE_GAMES.filter((game) => game !== 'chess'),
  )('gives %s its own branch in the route, not the chess fallback', (game) => {
    /*
     * Chess is the fallback, so it needs no branch. Every other type must be
     * named explicitly — three times over, because the route makes three
     * separate decisions per game and missing any one of them silently uses
     * chess's:
     *   - which replayer rebuilds the timeline
     *   - which adapter scores it
     *   - which board draws it
     */
    const mentions = ROUTE.split(`gameType === '${game}'`).length - 1;
    expect(mentions).toBeGreaterThanOrEqual(3);
  });

  it('draws a Go board for a Go game', () => {
    // The specific miss this pass was fixing: Go was reviewable nowhere, and
    // the way it would have gone wrong is a chess board full of Go moves.
    expect(ROUTE).toContain('<GoBoard');
    expect(ROUTE).toContain('replayGoMoves');
    expect(ROUTE).toContain('createGoAnalysis');
  });
});
