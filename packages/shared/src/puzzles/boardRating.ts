/**
 * Reading a checkers or reversi puzzle's difficulty off the position itself.
 *
 * The counterpart to `goRating.ts`, and it exists for a related reason: the bot
 * ladder cannot see the easy end. Its weakest tier is `ELO_BANDS[0]` — a depth-1
 * search with heavy noise and a ~50% blunder rate — and two separate effects put
 * a floor under it. A depth-1 search is precisely a "find the best immediate
 * move" machine, which is exactly the shape of the easiest puzzles; and the
 * blunder component **succeeds by luck** when the branching factor is small,
 * which is why below-floor checkers puzzles average 2.4 legal moves against 6.4
 * for the rest. Neither is a fact about the puzzles.
 *
 * So difficulty is read structurally instead, from four properties of the
 * position and its line. Every one is defined so that **larger means harder**,
 * and `calibration.gate.test.ts` asserts each fitted coefficient carries that
 * sign — the check that caught a fitted-noise feature in the Go model.
 *
 * Split from `calibration.ts` because that module is deliberately engine-free,
 * and this one has to search. Shared rather than living in the calibration
 * script because two callers must agree exactly: the script that fits the model
 * and the CI check that re-proves it still reproduces the hand-rated puzzles.
 */

import { CheckersEngine } from '../game-logic/checkers/engine';
import { analyzeCheckersPosition } from '../game-logic/checkers/weakEngine';
import { ReversiEngine } from '../game-logic/reversi/engine';
import { analyzeReversiPosition } from '../game-logic/reversi/weakEngine';
import { checkersPuzzleRules, reversiPuzzleRules } from './rules';
import type { Puzzle, PuzzleGame, PuzzleMove, PuzzleRules } from './types';

/** The depth the content gate agrees at, and so the deepest worth probing. */
const MAX_SEARCH_DEPTH = 6;

/**
 * What a checkers or reversi puzzle's difficulty is read from.
 *
 * Larger is harder in every field, which is what makes the sign check in the
 * gate meaningful.
 */
export interface BoardStructuralFeatures {
  /**
   * The shallowest search that already sees the key move, 1–6, or 7 when even
   * the gate's own depth does not (which the gate makes impossible for step 1).
   *
   * "How far ahead must you look to see it" is about as direct a statement of
   * difficulty as a position affords, and unlike the bot ladder it is
   * deterministic and free of the luck that lifts easy puzzles above the floor.
   */
  searchDepth: number;
  /**
   * Bits of decision the solver must get right across the whole line —
   * `Σ log2(legal moves)` at each of the player's turns.
   *
   * A one-move puzzle among three candidates asks less than a three-move line
   * among eight. This is the feature that separates "spot the move" from "play
   * the sequence", and the two games lean on it very differently.
   */
  decisionLoad: number;
  /** Player moves in the scripted line. */
  lineLength: number;
  /** Pieces on the board for checkers, empty squares for reversi. */
  complexity: number;
}

interface Binding<S> {
  rules: PuzzleRules<S>;
  legalCount(state: S): number;
  bestMoveKey(state: S, depth: number): string | null;
  moveKey(move: PuzzleMove): string;
  complexity(state: S): number;
}

const CHECKERS: Binding<ReturnType<typeof checkersPuzzleRules.decode>> = {
  rules: checkersPuzzleRules,
  legalCount: (state) => CheckersEngine.getAllLegalMoves(state).length,
  bestMoveKey(state, depth) {
    const best = analyzeCheckersPosition(state, depth).bestMove;
    return best ? `${best.from}${best.to}` : null;
  },
  moveKey: (move) => `${move.from}${move.to}`,
  complexity: (state) => state.board.flat().filter(Boolean).length,
};

const REVERSI: Binding<ReturnType<typeof reversiPuzzleRules.decode>> = {
  rules: reversiPuzzleRules,
  legalCount: (state) => ReversiEngine.getAllLegalMoves(state).length,
  bestMoveKey(state, depth) {
    const best = analyzeReversiPosition(state, depth).bestMove;
    return best ? best.position : null;
  },
  moveKey: (move) => move.to,
  complexity: (state) => 64 - state.board.flat().filter(Boolean).length,
};

/**
 * Features for one puzzle. Throws for a game this does not rate, rather than
 * returning zeros — a zeroed feature vector rates as the easiest thing there
 * is, which is the worst possible way to fail.
 */
export function boardFeaturesFor(puzzle: Puzzle): BoardStructuralFeatures {
  if (puzzle.game !== 'checkers' && puzzle.game !== 'reversi') {
    throw new Error(`boardFeaturesFor: ${puzzle.game} is not rated structurally this way`);
  }
  // The two bindings are structurally identical but over different opaque state
  // types, and nothing here inspects that state except through the binding.
  const g = (puzzle.game === 'checkers' ? CHECKERS : REVERSI) as Binding<unknown>;
  const { rules } = g;

  const start = rules.decode(puzzle.position);
  const wanted = g.moveKey(rules.parseMove(puzzle.steps[0].move));

  let searchDepth = MAX_SEARCH_DEPTH + 1;
  for (let depth = 1; depth <= MAX_SEARCH_DEPTH; depth++) {
    if (g.bestMoveKey(start, depth) === wanted) {
      searchDepth = depth;
      break;
    }
  }

  let state: unknown = start;
  let decisionLoad = 0;
  for (const step of puzzle.steps) {
    const choices = g.legalCount(state);
    if (choices < 1) break;
    decisionLoad += Math.log2(choices);

    const played = rules.validateMove(state, rules.parseMove(step.move));
    if (!played.valid || !played.resultingState) break;
    state = played.resultingState;

    if (step.reply !== undefined) {
      const replied = rules.validateMove(state, rules.parseMove(step.reply));
      if (!replied.valid || !replied.resultingState) break;
      state = replied.resultingState;
    }
    // Reversi hands the turn straight back when the opponent cannot move; the
    // data never spells that out, so mirror what the runtime does.
    for (let i = 0; i < 2 && rules.mustPass?.(state) && !rules.isGameOver(state); i++) {
      state = rules.executePass!(state);
    }
  }

  return {
    searchDepth,
    decisionLoad,
    lineLength: puzzle.steps.length,
    complexity: g.complexity(start),
  };
}

/** Games rated by this model. */
export const STRUCTURAL_BOARD_GAMES: readonly PuzzleGame[] = ['checkers', 'reversi'];
