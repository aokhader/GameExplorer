import { createChessAnalysis, stateToFen } from '@gameexplorer/shared';
import { getEngineEvaluation, isEngineAvailable } from '@/engine/chessEngineNative';

/**
 * Checkers and reversi are analysed by the in-house TS engines in
 * `packages/shared`, so their adapters are platform-neutral and live there —
 * web and mobile run byte-identical review for those two games.
 */
export { checkersAnalysis, reversiAnalysis } from '@gameexplorer/shared';

/**
 * Chess is the one game whose engine differs per platform: native Arasan here,
 * Stockfish WASM on web. Only the *raw search* differs — the normalisation,
 * terminal handling, eval-bar squash and grade bands are shared.
 *
 * Budgets are tuned for the native engine, which is far faster than the WASM
 * build web has to use.
 */
export const chessAnalysis = createChessAnalysis(
  async (state, budgetMs) => {
    if (!isEngineAvailable()) throw new Error('Engine unavailable');
    return getEngineEvaluation(state, budgetMs);
  },
  { scanBudgetMs: 250, liveBudgetMs: 600 },
);

/**
 * Chess analysis for an **arbitrary** position — the analysis board.
 *
 * `chessAnalysis` above sends `position startpos moves …`, which is right for a
 * game that descends from the opening: it hands the engine the move history its
 * repetition detection needs, and a FEN cannot carry that.
 *
 * An *edited* position has no such history, so the same command degenerates to
 * `position startpos` and the engine scores the **initial position** instead of
 * the board in front of you — silently, with a plausible-looking number. (Caught
 * on device: a K+Q vs lone K setup came back +0.45, the opening's eval.) The
 * board's own FEN is the position here, so it is sent as one, with the history
 * cleared so `positionCommand` cannot replay moves on top of it.
 */
export const chessPositionAnalysis = createChessAnalysis(
  async (state, budgetMs) => {
    if (!isEngineAvailable()) throw new Error('Engine unavailable');
    const fen = stateToFen(state);
    return getEngineEvaluation({ ...state, moveHistory: [] }, budgetMs, fen);
  },
  { scanBudgetMs: 250, liveBudgetMs: 600 },
);
