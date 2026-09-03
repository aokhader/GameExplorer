import {
  ReversiEngine,
  getBestReversiMove,
  type ReversiGameState,
} from '@finesse/shared';
import { saveReversiGame } from '@finesse/db';
import type { LocalGameAdapter } from './useLocalGame';

/** Bot pacing by strength — mirrors web's reversi `thinkTimeForElo`. */
function thinkTimeForElo(elo: number): number {
  if (elo < 700) return 350;
  if (elo < 1000) return 550;
  if (elo < 1400) return 800;
  if (elo < 1800) return 1100;
  return 1400;
}

/**
 * Reversi binding for `useLocalGame`. Reversi moves are a single placement, so
 * the loop's `from`/`to` pair is collapsed to one position (`from === to`). The
 * `mustPass`/`executePass` pair lets the loop auto-pass when a side has no legal
 * move — the one reversi-specific bit the engine-agnostic loop needs. No rules
 * live here; it only adapts names/shapes over the shared engine + bot + writer.
 */
export const reversiAdapter: LocalGameAdapter<ReversiGameState> = {
  gameType: 'reversi',
  newGame: () => ReversiEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isGameOver,
  winner: (s) => s.winner,
  validateMove: (s, from) => {
    const r = ReversiEngine.validateMove(s, from);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  getBotMove: (s, elo) => {
    const { position } = getBestReversiMove(s, elo);
    return { from: position, to: position };
  },
  getHintMove: (s, elo) => {
    const { position } = getBestReversiMove(s, elo);
    return { from: position, to: position };
  },
  // Always the engine's strongest square, as on web.
  hintElo: () => 2000,
  thinkTimeForElo,
  mustPass: (s) => ReversiEngine.mustPass(s),
  executePass: (s) => ReversiEngine.executePass(s),
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveReversiGame(state, playerColor, result, difficulty, userId, options),
};
