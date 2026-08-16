import { analyzeCheckersPosition } from '../game-logic/checkers/weakEngine';
import { analyzeReversiPosition } from '../game-logic/reversi/weakEngine';
import type { CheckersGameState } from '../game-logic/checkers/types';
import type { ReversiGameState } from '../game-logic/reversi/types';
import { logisticShare, type AnalysisAdapter } from './types';

/**
 * Checkers and reversi review adapters.
 *
 * Unlike chess these are fully platform-neutral — both games are analysed by the
 * in-house TS engines that already live here, so web and mobile run byte-identical
 * code and there is nothing to duplicate per platform.
 *
 * Search depth is deeper than the bot's top tier would use, but these boards are
 * small enough that a full-width depth-5 search is a few milliseconds — and review
 * is allowed to be slower than play anyway.
 */
const BOARD_GAME_SCAN_DEPTH = 4;
const BOARD_GAME_LIVE_DEPTH = 5;

/** Budgets are a *hint* here: these engines search to a fixed depth, not a clock. */
const DEEP_SEARCH_BUDGET_MS = 400;

export const checkersAnalysis: AnalysisAdapter<CheckersGameState> = {
  evaluate: async (state, budgetMs) => {
    const depth = budgetMs >= DEEP_SEARCH_BUDGET_MS ? BOARD_GAME_LIVE_DEPTH : BOARD_GAME_SCAN_DEPTH;
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
  currentTurn: (state) => state.currentTurn,
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
  liveBudgetMs: DEEP_SEARCH_BUDGET_MS,
};

export const reversiAnalysis: AnalysisAdapter<ReversiGameState> = {
  evaluate: async (state, budgetMs) => {
    const depth = budgetMs >= DEEP_SEARCH_BUDGET_MS ? BOARD_GAME_LIVE_DEPTH : BOARD_GAME_SCAN_DEPTH;
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
  currentTurn: (state) => state.currentTurn,
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
  liveBudgetMs: DEEP_SEARCH_BUDGET_MS,
};
