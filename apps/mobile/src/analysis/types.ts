import type { LocalMove } from '@/engine/useLocalGame';

/** One position's verdict, normalised across all three games. */
export interface PositionEval {
  /**
   * WHITE-POSITIVE score in the game's own units (chess/checkers ≈ centipawns,
   * reversi ≈ positional points). Every adapter normalises to this sign so the
   * eval bar, the swing maths, and the move grades are written once.
   */
  score: number;
  /**
   * Forced mate in N for White (positive) or Black (negative), when the engine
   * reports one. Chess only; null everywhere else.
   */
  mate: number | null;
  /** The move the engine would play here, or null in a finished position. */
  bestMove: LocalMove | null;
  /** The score is a decided result, not a heuristic guess. */
  terminal: boolean;
}

/** How badly a played move compares with the engine's choice. */
export type MoveGrade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * Score loss (in the game's own units) at which a move earns each grade. A move
 * losing less than `inaccuracy` is 'good'; matching the engine's own move is
 * 'best'. Per game because the scales differ — a checkers man is 100 points, a
 * reversi corner about 40.
 */
export interface GradeThresholds {
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

/**
 * What review needs from a game, on top of what `LocalGameAdapter` already
 * provides. Kept separate from the play adapter because analysis is the only
 * caller that wants a full-strength, noise-free, *scored* search — the bot
 * adapters deliberately hide all three.
 */
export interface AnalysisAdapter<S> {
  /**
   * Score one position at full strength. `budgetMs` is a hint for engines that
   * search on a clock (chess); the fixed-depth searches ignore it.
   */
  evaluate(state: S, budgetMs: number): Promise<PositionEval>;
  /**
   * The move that produced this state, or null at the start — and for a reversi
   * pass, which is nobody's decision and so can't be graded.
   */
  lastMove(state: S): LocalMove | null;
  /** Human-readable eval, e.g. "+1.25" or "Mate in 3". */
  formatScore(evaluation: PositionEval): string;
  /**
   * White's share of the eval bar, 0–1. A squash of `score`, since the raw
   * number is unbounded and a bar is not.
   */
  whiteShare(evaluation: PositionEval): number;
  thresholds: GradeThresholds;
  /** Engine budget per position during a full-game scan. */
  scanBudgetMs: number;
  /** Engine budget for the single position the user is looking at. */
  liveBudgetMs: number;
}

/**
 * Squash an unbounded score into a 0–1 bar share, White-positive. `scale` is the
 * score at which White holds roughly 73% of the bar — set per game so the bar
 * moves at a rate that matches how much that game's numbers actually mean.
 */
export function logisticShare(score: number, scale: number): number {
  return 1 / (1 + Math.exp(-score / scale));
}

/** Grade a played move by how much score it gave away, in the game's units. */
export function gradeForLoss(loss: number, t: GradeThresholds, matchedEngine: boolean): MoveGrade {
  if (matchedEngine) return 'best';
  if (loss >= t.blunder) return 'blunder';
  if (loss >= t.mistake) return 'mistake';
  if (loss >= t.inaccuracy) return 'inaccuracy';
  return 'good';
}
