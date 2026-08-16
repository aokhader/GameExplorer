import type { ChessGameState } from '../types/chess.types';
import { logisticShare, type AnalysisAdapter, type EngineMove, type PositionEval } from './types';

/** Score a mate as a large finite number so swing maths never sees Infinity. */
export const MATE_SCORE = 100_000;

/** What a UCI engine reports for a position, before any normalisation. */
export interface RawChessEval {
  /** Centipawns, *relative to the side to move* — as UCI defines it. */
  cp: number | null;
  /** Mate in N, also side-to-move relative. */
  mate: number | null;
  bestMove: EngineMove | null;
}

/** Convert a side-to-move-relative UCI score into a White-positive one. */
export function chessScore(cp: number | null, mate: number | null, whiteToMove: boolean): number {
  const sign = whiteToMove ? 1 : -1;
  if (mate !== null) return sign * (mate >= 0 ? MATE_SCORE - mate : -MATE_SCORE - mate);
  return sign * (cp ?? 0);
}

/**
 * The chess review adapter, minus the engine.
 *
 * Chess is the only game whose analysis differs by platform — mobile searches
 * with native Arasan, web with Stockfish WASM — but that difference is confined
 * to *where a raw score comes from*. Everything downstream (terminal handling,
 * the White-positive normalisation, the eval-bar squash, the grade bands) is one
 * implementation on purpose: both of the bugs this layer has ever had were in
 * that shared half, and a second copy is a second place to reintroduce them.
 *
 * @param getRawEval  Ask the platform's engine for a side-to-move-relative score.
 * @param budgets     Engine time per position; native and WASM are not the same speed.
 */
export function createChessAnalysis(
  getRawEval: (state: ChessGameState, budgetMs: number) => Promise<RawChessEval>,
  budgets: { scanBudgetMs: number; liveBudgetMs: number },
): AnalysisAdapter<ChessGameState> {
  return {
    evaluate: async (state, budgetMs): Promise<PositionEval> => {
      // A finished position is scored from the rules, not the engine. Arasan
      // answers a mated root with a bare `bestmove (none)` and no `info … score`
      // line at all, so asking would yield cp=null → a flat 0.00 on the very
      // position whose result is least ambiguous. (It also saves a search, and
      // lets a finished game be reviewed on a build with no engine.)
      if (state.isCheckmate) {
        // The side to move is the one mated.
        const whiteMated = state.currentTurn === 'white';
        return {
          score: whiteMated ? -MATE_SCORE : MATE_SCORE,
          mate: 0,
          bestMove: null,
          terminal: true,
        };
      }
      if (state.isStalemate || state.isDraw) {
        return { score: 0, mate: null, bestMove: null, terminal: true };
      }

      const whiteToMove = state.currentTurn === 'white';
      const raw = await getRawEval(state, budgetMs);
      return {
        // UCI scores are side-to-move relative; everything downstream is
        // White-positive, so flip when Black is to move.
        score: chessScore(raw.cp, raw.mate, whiteToMove),
        mate: raw.mate === null ? null : (whiteToMove ? 1 : -1) * raw.mate,
        bestMove: raw.bestMove
          ? { from: raw.bestMove.from, to: raw.bestMove.to, promotion: raw.bestMove.promotion }
          : null,
        terminal: raw.mate === 0,
      };
    },
    lastMove: (state) => {
      const m = state.moveHistory[state.moveHistory.length - 1];
      return m ? { from: m.from, to: m.to, promotion: m.promotion } : null;
    },
    currentTurn: (state) => state.currentTurn,
    formatScore: ({ score, mate }) => {
      if (mate !== null) {
        // `mate: 0` is mate already on the board — there is no "in N" to give, and
        // the sign lives on the score instead.
        if (mate === 0) return `Checkmate — ${score > 0 ? 'White' : 'Black'} wins`;
        return `Mate in ${Math.abs(mate)} for ${mate > 0 ? 'White' : 'Black'}`;
      }
      const pawns = score / 100;
      return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
    },
    // 300cp ≈ 73% of the bar: a three-pawn edge should look decisive but not total.
    // A forced mate pins the bar — and reads its side off the score, since a mate
    // already delivered carries `mate: 0` and so has no sign of its own.
    whiteShare: ({ score, mate }) =>
      mate !== null ? (score > 0 ? 0.97 : 0.03) : logisticShare(score, 300),
    // Lichess-style centipawn-loss bands.
    thresholds: { inaccuracy: 50, mistake: 100, blunder: 200 },
    ...budgets,
  };
}
