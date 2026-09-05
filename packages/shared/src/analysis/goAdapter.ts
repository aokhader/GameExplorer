/**
 * Go review.
 *
 * `analyzeGoPosition`'s docstring has said *"the eval numbers are there for the
 * review mode Go does not have yet"* since Go shipped. This is that mode.
 *
 * A factory rather than a constant, following `createChessAnalysis`, because
 * two of the numbers below **depend on the board size** and there is no honest
 * fixed value for them. A fifteen-point lead is decisive on 9×9 and barely
 * worth mentioning on 19×19; a move that costs eight points is a blunder on a
 * small board and an ordinary endgame slip on a big one. Baking in the 9×9
 * figures and using them at 19×19 would produce a review that calls almost
 * every move a blunder, which is worse than no review.
 */

import { GoEngine } from '../game-logic/go/engine';
import { analyzeGoPosition, goAnalysisIterations } from '../game-logic/go/bot';
import { toGoPoint } from '../game-logic/go/notation';
import type { GoGameState } from '../game-logic/go/types';
import { logisticShare, type AnalysisAdapter } from './types';

/**
 * Playouts the whole-game scan may spend per position.
 *
 * Review scans every position in the game before the player has looked at any
 * of them, so this is multiplied by the length of the game — 200-plus positions
 * at 13×13. It is deliberately a fraction of what the live budget spends on the
 * one position being looked at.
 */
const SCAN_FRACTION = 0.08;

/** Budgets are a *hint* here: this engine searches to a playout count, not a clock. */
const DEEP_SEARCH_BUDGET_MS = 400;

/**
 * A Go score, as a Go player writes it: `B+3.5`, `W+7.5`, or `Draw` for jigo.
 *
 * Not `+3.5`. Every other game in this app has a natural "positive is white"
 * reading, and Go does not — a Go result is *always* written with the winner's
 * initial in front of it, and a review that showed a bare signed number would be
 * the one place in the app speaking a language Go players do not use.
 */
function formatGoScore(score: number): string {
  if (score === 0) return 'Draw';
  const points = Math.abs(score);
  const rounded = Number.isInteger(points) ? points : points.toFixed(1);
  return `${score > 0 ? 'W' : 'B'}+${rounded}`;
}

export function createGoAnalysis(size: number): AnalysisAdapter<GoGameState> {
  const liveIterations = goAnalysisIterations(size);
  const scanIterations = Math.max(30, Math.round(liveIterations * SCAN_FRACTION));

  /**
   * What counts as a decisive lead on this board, for the eval bar's squash.
   *
   * Scaled off the board's own edge: roughly a third of the points on one side
   * of a 9×9 board is a won game, and the same *proportion* is on 19×19. The
   * constant is chosen so 9×9 keeps the ~15-point feel the score bar already
   * has.
   */
  const decisive = size * 1.7;

  return {
    evaluate: async (state, budgetMs) => {
      const iterations = budgetMs >= DEEP_SEARCH_BUDGET_MS ? liveIterations : scanIterations;

      // A position that is no longer being played has a settled score; asking
      // the search about it would spend playouts to guess at a fact.
      if (state.phase !== 'playing') {
        const { lead } = GoEngine.score(state);
        return { score: -lead, mate: null, bestMove: null, terminal: true };
      }

      const result = await analyzeGoPosition(state, { iterations });
      return {
        // ⚠️ SIGN. `PositionEval.score` is WHITE-positive across every game here
        // (see `analysis/types.ts`), and `analyzeGoPosition` reports a
        // BLACK-positive `scoreLead`. The negation is the whole conversion, and
        // getting it wrong produces a review that is confidently backwards
        // rather than one that fails. The Go puzzle rules carry the same note
        // for the same reason.
        score: -result.scoreLead,
        mate: null,
        bestMove: result.position ? { from: result.position, to: result.position } : null,
        terminal: false,
      };
    },

    lastMove: (state) => {
      const move = state.moveHistory[state.moveHistory.length - 1];
      // A pass has no point on the board — and no decision behind it that could
      // be graded. Reversi's adapter says the same thing for the same reason.
      return move?.position ? { from: move.position, to: move.position } : null;
    },

    currentTurn: (state) => state.currentTurn,

    /*
     * Go's engine coordinates are not what a player reads: a board's columns
     * skip the letter I, so the engine's `i9` is the point everyone calls `J9`.
     * `toGoPoint` is the single place that translation lives.
     */
    formatMove: (move) => toGoPoint(move.to),

    formatScore: ({ score, terminal }) => {
      if (!terminal) return formatGoScore(score);
      if (score === 0) return 'Draw';
      return score > 0 ? 'White wins' : 'Black wins';
    },

    whiteShare: ({ score, terminal }) =>
      terminal ? (score > 0 ? 0.98 : score < 0 ? 0.02 : 0.5) : logisticShare(score, decisive),

    /*
     * Wider than any other game's, and scaled with the board.
     *
     * Two reasons. The estimate is a Monte-Carlo average rather than an exact
     * search, so a few points of noise between neighbouring positions is normal
     * and must not be graded as a mistake. And Go's endgame is made of moves
     * genuinely worth one or two points, which would otherwise fill a review
     * with inaccuracies for playing the game correctly.
     */
    thresholds: {
      inaccuracy: size * 0.45,
      mistake: size * 1,
      blunder: size * 2,
    },

    scanBudgetMs: 0,
    liveBudgetMs: DEEP_SEARCH_BUDGET_MS,
  };
}

/**
 * The 9×9 adapter — the default, and what a row with no stored board size is.
 *
 * A saved game carries its own size now (`supabase-add-go-rules.sql`), so the
 * review route builds the adapter for that size instead. This one is for
 * callers with no row to read: tests, and rows written before that column
 * existed.
 */
export const goAnalysis = createGoAnalysis(9);

/** Go move list for the review's move ribbon — `D4`, `Q16`, `Pass`. */
export function goTimelineToPoints(timeline: readonly GoGameState[]): string[] {
  const last = timeline[timeline.length - 1];
  if (!last) return [];
  return last.moveHistory.map((move) =>
    move.position === null ? 'Pass' : toGoPoint(move.position),
  );
}
