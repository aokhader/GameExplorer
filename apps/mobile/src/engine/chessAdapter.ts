import {
  ChessEngine,
  getBestMoveElo,
  type ChessGameState,
  type PieceType,
} from '@gameexplorer/shared';
import { saveGame } from '@gameexplorer/db';
import type { LocalGameAdapter } from './useLocalGame';

/** Bot pacing by strength — mirrors web's `useStockfish` `thinkTimeForElo`. */
function thinkTimeForElo(elo: number): number {
  if (elo < 800) return 400;
  if (elo < 1200) return 650;
  if (elo < 1400) return 900;
  if (elo < 1800) return 1100;
  return 1400;
}

/**
 * Chess binding for `useLocalGame`. Uses the in-house pure-TS `getBestMoveElo`
 * engine, which covers the whole supported range (≤1399). Chess bots ship capped
 * below 1400 on mobile — the GPL-free ≥1400 engine (zurichess/extended-TS) is a
 * documented follow-on (see mobile-app-plan "Chess engine decision"); the elo is
 * clamped here so the contract holds even if a higher setup value ever reaches it.
 *
 * `validateMove` threads the optional promotion piece; the board resolves the
 * picker before it ever calls with a promotion move.
 */
export const chessAdapter: LocalGameAdapter<ChessGameState> = {
  gameType: 'chess',
  newGame: () => ChessEngine.newGame(),
  currentTurn: (s) => s.currentTurn,
  isGameOver: (s) => s.isCheckmate || s.isStalemate || s.isDraw,
  // Checkmate = the side to move is mated → the other color wins. Stalemate /
  // draw → null (no winner).
  winner: (s) => (s.isCheckmate ? (s.currentTurn === 'white' ? 'black' : 'white') : null),
  validateMove: (s, from, to, promotion) => {
    const r = ChessEngine.validateMove(s, from, to, false, promotion as PieceType | undefined);
    return { valid: r.valid, resultingState: r.resultingState };
  },
  getBotMove: (s, elo) => {
    const m = getBestMoveElo(s, Math.min(elo, 1399));
    return { from: m.from, to: m.to, promotion: m.promotion };
  },
  thinkTimeForElo,
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveGame(state, playerColor, result, difficulty, userId, options),
};
