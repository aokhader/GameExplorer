import { getBestCheckersMove, type CheckersGameState } from '@gameexplorer/shared';
import { CHECKERS_RULES } from '@gameexplorer/client/game/localRules';
import type { LocalGameAdapter } from './useLocalGame';

/** Bot pacing by strength — mirrors web's checkers `thinkTimeForElo`. */
function thinkTimeForElo(elo: number): number {
  if (elo < 700) return 300;
  if (elo < 1000) return 500;
  if (elo < 1400) return 750;
  if (elo < 1800) return 1000;
  return 1300;
}

/**
 * Checkers binding for `useLocalGame` — thin glue over the shared engine + bot +
 * the `saveCheckersGame` writer. No rules live here; it only adapts names/shapes.
 */
export const checkersAdapter: LocalGameAdapter<CheckersGameState> = {
  // The rules and the writer are shared with anything that replays or resigns a
  // saved checkers game away from this screen.
  ...CHECKERS_RULES,
  getBotMove: (s, elo) => getBestCheckersMove(s, elo),
  getHintMove: (s, elo) => getBestCheckersMove(s, elo),
  // Always the engine's strongest play — as on web, checkers hints don't scale
  // with the player (there's no separate hint ladder to scale along).
  hintElo: () => 2000,
  thinkTimeForElo,
};
