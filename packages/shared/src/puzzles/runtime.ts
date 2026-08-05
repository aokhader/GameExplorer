/**
 * The solve loop, as a pure synchronous reducer over an opaque game state.
 *
 * Deliberately **two-phase**: a correct player move leaves the run in
 * `'replying'` and the *platform* owns the beat before it calls
 * `applyOpponentReply`. Nothing here starts a timer or touches a clock, so the
 * whole loop is unit-testable without fake timers — the same separation
 * `useLocalGame` keeps between its turn effect and move application.
 *
 * `packages/shared` has no react dependency, which is why this is a reducer and
 * the hook that drives it lives in `packages/client`.
 */

import type { Puzzle, PuzzleMove, PuzzleRules } from './types';

export type PuzzlePhase =
  /** Waiting for the player's move. */
  | 'playing'
  /** The player was right; the opponent's scripted answer is owed. */
  | 'replying'
  /** The player missed; the board is unchanged and a retry is owed. */
  | 'wrong'
  /** The line is finished. */
  | 'solved';

export interface PuzzleRun<S> {
  puzzle: Puzzle;
  state: S;
  /** Index into `puzzle.steps` of the step currently being solved. */
  stepIndex: number;
  phase: PuzzlePhase;
  /** Wrong moves this sitting. Survives `retryPuzzle`. */
  attempts: number;
  /** What the player played to get here, while `phase === 'wrong'`. */
  wrongMove: PuzzleMove | null;
  hintUsed: boolean;
  /**
   * No wrong moves and no hint — the only kind of solve that extends a streak.
   *
   * Maintained as the invariant `clean === (attempts === 0 && !hintUsed)`, so
   * it reads true from the start and can only ever be lost.
   */
  clean: boolean;
}

export type PuzzleMoveResult = 'correct' | 'wrong' | 'solved' | 'ignored';

/**
 * Run the auto-pass rule to a fixed point.
 *
 * Reversi hands the turn back when the side to move has no legal move, and the
 * data never spells a pass out. Capped at two, because two consecutive passes
 * end the game and a third would mean the engine disagreed with itself.
 */
function settle<S>(state: S, rules: PuzzleRules<S>): S {
  const { mustPass, executePass } = rules;
  if (!mustPass || !executePass) return state;

  let next = state;
  for (let i = 0; i < 2; i++) {
    if (rules.isGameOver(next) || !mustPass(next)) break;
    next = executePass(next);
  }
  return next;
}

/** Apply a move that the data says is legal. Throws if it isn't. */
function applyScripted<S>(state: S, move: PuzzleMove, rules: PuzzleRules<S>, what: string): S {
  const result = rules.validateMove(state, move);
  if (!result.valid || !result.resultingState) {
    // Not a player error — the authored line disagrees with the engine, which
    // the validation suite exists to catch before it ever ships.
    throw new Error(`Puzzle ${what} '${rules.formatMove(move)}' is not legal in this position`);
  }
  return settle(result.resultingState, rules);
}

export function startPuzzle<S>(puzzle: Puzzle, rules: PuzzleRules<S>): PuzzleRun<S> {
  return {
    puzzle,
    state: settle(rules.decode(puzzle.position), rules),
    stepIndex: 0,
    phase: puzzle.steps.length === 0 ? 'solved' : 'playing',
    attempts: 0,
    wrongMove: null,
    hintUsed: false,
    clean: true,
  };
}

/**
 * Offer the player's move.
 *
 * Returns `'ignored'` with the run untouched whenever it isn't the player's
 * turn to act — during the reply beat, after solving, or while a wrong move is
 * still on screen. **This is what makes every board safe without a single board
 * edit:** stray taps land here and stop.
 */
export function applyPlayerMove<S>(
  run: PuzzleRun<S>,
  rules: PuzzleRules<S>,
  move: PuzzleMove,
): { run: PuzzleRun<S>; result: PuzzleMoveResult } {
  if (run.phase !== 'playing') return { run, result: 'ignored' };

  const step = run.puzzle.steps[run.stepIndex];
  const scripted = rules.parseMove(step.move);

  if (!rules.sameMove(move, scripted)) {
    // The board is left exactly as it was. An illegal move and a legal-but-not-
    // the-solution move are the same answer here, so nothing reaches the engine.
    return {
      run: {
        ...run,
        phase: 'wrong',
        wrongMove: move,
        attempts: run.attempts + 1,
        clean: false,
      },
      result: 'wrong',
    };
  }

  const state = applyScripted(run.state, scripted, rules, 'move');

  if (step.reply !== undefined) {
    return { run: { ...run, state, phase: 'replying', wrongMove: null }, result: 'correct' };
  }

  // No reply. Usually that's the end of the line — but in reversi the opponent
  // can be left with no legal move, which `settle` has already passed for, so
  // the player moves again. "Solved" is therefore running out of STEPS, not
  // running out of replies.
  const stepIndex = run.stepIndex + 1;
  const done = stepIndex >= run.puzzle.steps.length;
  return {
    run: { ...run, state, stepIndex, phase: done ? 'solved' : 'playing', wrongMove: null },
    result: done ? 'solved' : 'correct',
  };
}

/**
 * Play the opponent's scripted answer and hand the turn back.
 *
 * A no-op unless the run is actually waiting on one, so a double-fired timer
 * can't play the reply twice.
 */
export function applyOpponentReply<S>(run: PuzzleRun<S>, rules: PuzzleRules<S>): PuzzleRun<S> {
  if (run.phase !== 'replying') return run;

  const step = run.puzzle.steps[run.stepIndex];
  if (step.reply === undefined) return run;

  const state = applyScripted(run.state, rules.parseMove(step.reply), rules, 'reply');
  const stepIndex = run.stepIndex + 1;
  const done = stepIndex >= run.puzzle.steps.length;

  return { ...run, state, stepIndex, phase: done ? 'solved' : 'playing' };
}

/**
 * Back to the start position, keeping the score.
 *
 * `attempts` and `hintUsed` survive on purpose — retrying is how you solve a
 * puzzle you got wrong, not how you erase having got it wrong.
 */
export function retryPuzzle<S>(run: PuzzleRun<S>, rules: PuzzleRules<S>): PuzzleRun<S> {
  return {
    ...run,
    state: settle(rules.decode(run.puzzle.position), rules),
    stepIndex: 0,
    phase: 'playing',
    wrongMove: null,
    clean: run.attempts === 0 && !run.hintUsed,
  };
}

/**
 * The move the player is looking for, or null when it isn't their turn.
 *
 * A pure query — taking the hint is a separate decision, so that a UI can
 * render the arrow and bill for it in whichever order it likes.
 */
export function hintFor<S>(run: PuzzleRun<S>, rules: PuzzleRules<S>): PuzzleMove | null {
  if (run.phase !== 'playing') return null;
  return rules.parseMove(run.puzzle.steps[run.stepIndex].move);
}

/** Record that the player took a hint — costs them the clean solve. */
export function markHintUsed<S>(run: PuzzleRun<S>): PuzzleRun<S> {
  return run.hintUsed ? run : { ...run, hintUsed: true, clean: false };
}
