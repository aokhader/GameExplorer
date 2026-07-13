import {
  ChessEngine,
  getBestMoveElo,
  STOCKFISH_MIN_ELO,
  type ChessGameState,
  type PieceType,
} from '@gameexplorer/shared';
import { saveGame } from '@gameexplorer/db';
import type { LocalGameAdapter } from './useLocalGame';
import { getStockfishBestMove, stockfishNewGame } from './stockfishEngine';

/** Bot pacing by strength — mirrors web's `useStockfish` `thinkTimeForElo`. */
function thinkTimeForElo(elo: number): number {
  if (elo < 800) return 400;
  if (elo < 1200) return 650;
  if (elo < 1400) return 900;
  if (elo < 1800) return 1100;
  return 1400;
}

/**
 * Chess binding for `useLocalGame`. Same split as web's bot page: below 1400
 * the in-house pure-TS `getBestMoveElo` engine plays (sync, offline, capped at
 * 1399 by its calibration); at 1400+ the native Stockfish service takes over
 * (async, also offline — the engine ships in the app). Screens gate the bot
 * turn on `useStockfishNative().isReady` so a strong request never fires
 * before the engine handshake completes.
 *
 * `validateMove` threads the optional promotion piece; the board resolves the
 * picker before it ever calls with a promotion move.
 */
export const chessAdapter: LocalGameAdapter<ChessGameState> = {
  gameType: 'chess',
  newGame: () => {
    // Fresh game → clear Stockfish's tables (no-op when it isn't running).
    stockfishNewGame();
    return ChessEngine.newGame();
  },
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
    if (elo >= STOCKFISH_MIN_ELO) return getStockfishBestMove(s, elo);
    const m = getBestMoveElo(s, elo);
    return { from: m.from, to: m.to, promotion: m.promotion };
  },
  thinkTimeForElo,
  save: ({ state, playerColor, result, difficulty, userId, options }) =>
    saveGame(state, playerColor, result, difficulty, userId, options),
};
