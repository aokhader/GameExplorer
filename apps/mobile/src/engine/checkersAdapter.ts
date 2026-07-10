import {
  CheckersEngine,
  getBestCheckersMove,
  type CheckersGameState,
} from '@gameexplorer/shared';
import { saveCheckersGame } from '@gameexplorer/db';
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
  gameType: 'checkers',
  newGame: () => CheckersEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isGameOver,
  winner: (s) => s.winner,
  validateMove: (s, from, to) => {
    const r = CheckersEngine.validateMove(s, from, to);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  getBotMove: (s, elo) => getBestCheckersMove(s, elo),
  thinkTimeForElo,
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveCheckersGame(state, playerColor, result, difficulty, userId, options),
};
