import {
  analyzeCheckersPosition,
  analyzeReversiPosition,
  type CheckersGameState,
  type ChessGameState,
  type ReversiGameState,
} from '@gameexplorer/shared';
import { getEngineEvaluation, isEngineAvailable } from '@/engine/chessEngineNative';
import { type AnalysisAdapter, logisticShare } from './types';

// ── Chess ─────────────────────────────────────────────────────────────────────

/**
 * Search depth for the fixed-depth (checkers/reversi) engines. Deeper than the
 * bot's top tier would use, but these boards are small enough that a full-width
 * depth-5 search is a few milliseconds — and review is allowed to be slower than
 * play anyway.
 */
const BOARD_GAME_SCAN_DEPTH = 4;
const BOARD_GAME_LIVE_DEPTH = 5;

/** Score a mate as a large finite number so swing maths never sees Infinity. */
const MATE_SCORE = 100_000;

function chessScore(cp: number | null, mate: number | null, whiteToMove: boolean): number {
  const sign = whiteToMove ? 1 : -1;
  if (mate !== null) return sign * (mate >= 0 ? MATE_SCORE - mate : -MATE_SCORE - mate);
  return sign * (cp ?? 0);
}

export const chessAnalysis: AnalysisAdapter<ChessGameState> = {
  evaluate: async (state, budgetMs) => {
    // A finished position is scored from the rules, not the engine. Arasan
    // answers a mated root with a bare `bestmove (none)` and no `info … score`
    // line at all, so asking would yield cp=null → a flat 0.00 on the very
    // position whose result is least ambiguous. (It also saves a search.)
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

    if (!isEngineAvailable()) throw new Error('Engine unavailable');
    const whiteToMove = state.currentTurn === 'white';
    const raw = await getEngineEvaluation(state, budgetMs);
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
  scanBudgetMs: 250,
  liveBudgetMs: 600,
};

// ── Checkers ──────────────────────────────────────────────────────────────────

export const checkersAnalysis: AnalysisAdapter<CheckersGameState> = {
  evaluate: async (state, budgetMs) => {
    const depth = budgetMs >= 400 ? BOARD_GAME_LIVE_DEPTH : BOARD_GAME_SCAN_DEPTH;
    const r = analyzeCheckersPosition(state, depth);
    return {
      score: r.score,
      mate: null,
      bestMove: r.bestMove ? { from: r.bestMove.from, to: r.bestMove.to } : null,
      terminal: r.terminal,
    };
  },
  lastMove: (state) => {
    const m = state.moveHistory[state.moveHistory.length - 1];
    return m ? { from: m.from, to: m.to } : null;
  },
  formatScore: ({ score, terminal }) => {
    if (terminal) return score > 0 ? 'White wins' : score < 0 ? 'Black wins' : 'Draw';
    const pieces = score / 100;
    return `${pieces > 0 ? '+' : ''}${pieces.toFixed(1)}`;
  },
  // A man is 100, so 250 (two and a half men) is a commanding lead.
  whiteShare: ({ score, terminal }) =>
    terminal ? (score > 0 ? 0.98 : score < 0 ? 0.02 : 0.5) : logisticShare(score, 250),
  // Scaled off a man (100): giving one away outright is a blunder.
  thresholds: { inaccuracy: 40, mistake: 90, blunder: 160 },
  scanBudgetMs: 0,
  liveBudgetMs: 400,
};

// ── Reversi ───────────────────────────────────────────────────────────────────

export const reversiAnalysis: AnalysisAdapter<ReversiGameState> = {
  evaluate: async (state, budgetMs) => {
    const depth = budgetMs >= 400 ? BOARD_GAME_LIVE_DEPTH : BOARD_GAME_SCAN_DEPTH;
    const r = analyzeReversiPosition(state, depth);
    return {
      score: r.score,
      mate: null,
      bestMove: r.bestMove ? { from: r.bestMove.position, to: r.bestMove.position } : null,
      terminal: r.terminal,
    };
  },
  lastMove: (state) => {
    const m = state.moveHistory[state.moveHistory.length - 1];
    // A pass has no square — and no decision behind it, so it can't be graded.
    return m?.position ? { from: m.position, to: m.position } : null;
  },
  formatScore: ({ score, terminal }) => {
    if (terminal) return score > 0 ? 'White wins' : score < 0 ? 'Black wins' : 'Draw';
    // Positional points, not discs — rounded, since a decimal would imply a
    // precision the heuristic doesn't have.
    return `${score > 0 ? '+' : ''}${Math.round(score)}`;
  },
  // A corner is worth ~40, so 150 is a few corners' worth of control.
  whiteShare: ({ score, terminal }) =>
    terminal ? (score > 0 ? 0.98 : score < 0 ? 0.02 : 0.5) : logisticShare(score, 150),
  // Wider bands than chess: the positional score swings on every flip.
  thresholds: { inaccuracy: 60, mistake: 140, blunder: 260 },
  scanBudgetMs: 0,
  liveBudgetMs: 400,
};
