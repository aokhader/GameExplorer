import { botThinkMs, getBestCheckersMoveSliced, type CheckersGameState } from '@gameexplorer/shared';
import { CHECKERS_RULES } from '@gameexplorer/client/game/localRules';
import type { LocalGameAdapter } from './useLocalGame';
import { slicedOnJsThread } from './yieldToJsQueue';

/**
 * Checkers binding for `useLocalGame` — thin glue over the shared engine + bot +
 * the `saveCheckersGame` writer. No rules live here; it only adapts names/shapes.
 */
export const checkersAdapter: LocalGameAdapter<CheckersGameState> = {
  // The rules and the writer are shared with anything that replays or resigns a
  // saved checkers game away from this screen.
  ...CHECKERS_RULES,
  // Sliced: the search shares the JS thread with the board's touch handlers,
  // and at depth 5 it held a piece the player picked up for up to ~0.2 s.
  getBotMove: (s, elo, signal) => getBestCheckersMoveSliced(s, elo, slicedOnJsThread(signal)),
  getHintMove: (s, elo, signal) => getBestCheckersMoveSliced(s, elo, slicedOnJsThread(signal)),
  // Always the engine's strongest play — as on web, checkers hints don't scale
  // with the player (there's no separate hint ladder to scale along).
  hintElo: () => 2000,
  thinkTimeForElo: () => botThinkMs(),
};
