import type { GameType } from '@gameexplorer/db';

/**
 * The game types `/review/[id]` can actually replay and analyse.
 *
 * One list, imported by both the review route and the profile's history rows,
 * because they used to be two and two is one more than can stay in step. The
 * failure mode is specific and silent: the review route falls back to the
 * **chess** replayer for anything it does not recognise, so a game type the
 * profile lets through but review does not support gets its move list read as
 * chess moves — no crash, no error, just a board that is not the game that was
 * played.
 *
 * Adding a game here without adding its replayer and adapter to
 * `app/review/[id].tsx` reintroduces exactly that, so the two live together and
 * `reviewable.test.ts` asserts the route knows every type this list names.
 */
export const REVIEWABLE_GAMES = ['chess', 'checkers', 'reversi', 'go'] as const;

export type ReviewableGame = (typeof REVIEWABLE_GAMES)[number];

export const REVIEWABLE: ReadonlySet<GameType> = new Set<GameType>(REVIEWABLE_GAMES);

export function isReviewable(gameType: GameType | undefined): boolean {
  return gameType !== undefined && REVIEWABLE.has(gameType);
}
