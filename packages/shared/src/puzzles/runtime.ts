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
  /** The player missed; a refutation is owed, then a retry. */
  | 'wrong'
  /** The line is finished. */
  | 'solved';

/**
 * Why the move the player just played doesn't work.
 *
 * Computed by `applyRefutation` rather than `applyPlayerMove`, because it is
 * the one part of this file that runs a search and the caller has to be free to
 * get "Not quite" on screen first. See `REFUTATION_DEPTH` for what that costs.
 */
export interface PuzzleRefutation {
  /** What the player played. */
  move: PuzzleMove;
  /**
   * The opponent's best answer — present only when the move is actually
   * refuted. A move that merely fails to solve has no punish to show, and
   * inventing one would teach the player something false.
   */
  reply: PuzzleMove | null;
  /**
   * True when the move loses something, as opposed to just not solving the
   * puzzle. Missing a mate in one is not the same mistake as hanging a rook,
   * and the copy says so.
   */
  refuted: boolean;
  /** Position value after the answer, from the PLAYER's side. */
  score: number;
  /** False when the move was not legal at all — there is nothing to show. */
  legal: boolean;
}

export interface PuzzleRun<S> {
  puzzle: Puzzle;
  /**
   * The position the player has to move in — the main line only.
   *
   * Deliberately untouched by a wrong move: `timeline` may run past it to show
   * a refutation, but the line itself never advances on a miss, so every rule
   * below can keep reading this without asking whether a branch is on screen.
   */
  state: S;
  /**
   * Every position the board may show: the main line so far, and — while a
   * wrong move is being answered — the branch that refutes it.
   *
   * Invariant: `timeline[mainLength - 1] === state`, and anything past
   * `mainLength` is the refutation branch.
   */
  timeline: S[];
  /** How much of `timeline` is the real line. */
  mainLength: number;
  /** Which `timeline` entry is on the board. */
  viewIndex: number;
  /** Index into `puzzle.steps` of the step currently being solved. */
  stepIndex: number;
  phase: PuzzlePhase;
  /** Wrong moves this sitting. Survives `retryPuzzle`. */
  attempts: number;
  /** What the player played to get here, while `phase === 'wrong'`. */
  wrongMove: PuzzleMove | null;
  /** Why that move fails. Null until `applyRefutation` has run. */
  refutation: PuzzleRefutation | null;
  hintUsed: boolean;
  /**
   * No wrong moves and no hint — the only kind of solve that extends a streak.
   *
   * Maintained as the invariant `clean === (attempts === 0 && !hintUsed)`, so
   * it reads true from the start and can only ever be lost.
   */
  clean: boolean;
}

/**
 * Search depth per game for refuting a wrong move.
 *
 * Different numbers because the three engines cost differently. Checkers and
 * reversi answer at depth 6 in about a millisecond. Chess was the outlier and
 * the reason this was pinned at 3: it used to cost 67 ms on average and 246 ms
 * at worst across the shipped puzzle set, with depth 5 reaching **18 seconds**
 * on the heaviest position.
 *
 * That was the engine wasting work, not the search being deep — see
 * `isSquareUnderAttack` and `ChessEngine.isLegalCandidate`. After that pass the
 * same measurement over all 20 chess puzzles reads:
 *
 *     depth 3    mean   8 ms   worst   26 ms
 *     depth 4    mean  25 ms   worst  103 ms
 *     depth 5    mean 209 ms   worst 1244 ms
 *
 * So chess sits at 4, which now costs less than depth 3 did before, and buys
 * the ply that matters: three plies sees the opponent take the piece you hung,
 * four sees whether you get it back. Depth 5 is still too slow to put in front
 * of someone waiting for an answer. This is a refutation, not an analysis
 * engine, and it must not grow into one.
 */
export const REFUTATION_DEPTH: Record<string, number> = {
  chess: 4,
  checkers: 6,
  reversi: 6,
};

/**
 * How far behind the player has to end up for the move to count as refuted.
 *
 * Absolute, not relative to the solution: every non-solving move loses
 * *something* against a puzzle that has a forced win, so measuring the drop
 * from the solution would flag every miss — including a perfectly safe move
 * that simply isn't the fastest mate. What earns the word "refuted" is ending
 * up worse off than the opponent, full stop. Roughly a pawn in chess and
 * checkers, and rather more than a corner in reversi, whose scale is
 * positional (a corner is worth about 40).
 */
const REFUTED_SCORE = -50;

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
  const state = settle(rules.decode(puzzle.position), rules);
  return {
    puzzle,
    state,
    timeline: [state],
    mainLength: 1,
    viewIndex: 0,
    stepIndex: 0,
    phase: puzzle.steps.length === 0 ? 'solved' : 'playing',
    attempts: 0,
    wrongMove: null,
    refutation: null,
    hintUsed: false,
    clean: true,
  };
}

/** The position currently on the board — main line or refutation branch. */
export function displayState<S>(run: PuzzleRun<S>): S {
  return run.timeline[Math.max(0, Math.min(run.timeline.length - 1, run.viewIndex))];
}

/** True when the board is showing the newest position rather than history. */
export function isAtLive<S>(run: PuzzleRun<S>): boolean {
  return run.viewIndex >= run.timeline.length - 1;
}

/** Step the board through `timeline`. Callers don't need to clamp. */
export function seekPuzzle<S>(run: PuzzleRun<S>, index: number): PuzzleRun<S> {
  const viewIndex = Math.max(0, Math.min(run.timeline.length - 1, index));
  return viewIndex === run.viewIndex ? run : { ...run, viewIndex };
}

/** Advance the main line by one position, dropping any refutation branch. */
function advance<S>(run: PuzzleRun<S>, state: S): Pick<
  PuzzleRun<S>,
  'state' | 'timeline' | 'mainLength' | 'viewIndex'
> {
  const timeline = [...run.timeline.slice(0, run.mainLength), state];
  return { state, timeline, mainLength: timeline.length, viewIndex: timeline.length - 1 };
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
  // Scrolled back through the history with the nav controls: the board is
  // showing a position the player is no longer in, so a move on it means
  // nothing. The UI makes the board inert too — this is the backstop.
  if (!isAtLive(run)) return { run, result: 'ignored' };

  const step = run.puzzle.steps[run.stepIndex];
  const scripted = rules.parseMove(step.move);

  if (!rules.sameMove(move, scripted)) {
    // Nothing reaches an engine here, and the line does not move: `state` is
    // still the position the player has to solve. Working out *why* the move
    // fails is `applyRefutation`'s job, because it costs a search and this has
    // to stay instant.
    return {
      run: {
        ...run,
        phase: 'wrong',
        wrongMove: move,
        refutation: null,
        attempts: run.attempts + 1,
        clean: false,
      },
      result: 'wrong',
    };
  }

  const state = applyScripted(run.state, scripted, rules, 'move');

  if (step.reply !== undefined) {
    return {
      run: { ...run, ...advance(run, state), phase: 'replying', wrongMove: null },
      result: 'correct',
    };
  }

  // No reply. Usually that's the end of the line — but in reversi the opponent
  // can be left with no legal move, which `settle` has already passed for, so
  // the player moves again. "Solved" is therefore running out of STEPS, not
  // running out of replies.
  const stepIndex = run.stepIndex + 1;
  const done = stepIndex >= run.puzzle.steps.length;
  return {
    run: {
      ...run,
      ...advance(run, state),
      stepIndex,
      phase: done ? 'solved' : 'playing',
      wrongMove: null,
    },
    result: done ? 'solved' : 'correct',
  };
}

/**
 * Work out why the player's wrong move fails, and put it on the board.
 *
 * Split out from `applyPlayerMove` for one reason: this runs a search, and the
 * player should see "Not quite" the instant they let go of the piece, not
 * whenever chess finishes thinking. Same separation the scripted reply already
 * uses — the reducer stays pure and synchronous, and the platform decides when
 * to spend the time.
 *
 * A no-op once a refutation is in place, so a re-render cannot search twice.
 */
export function applyRefutation<S>(
  run: PuzzleRun<S>,
  rules: PuzzleRules<S>,
  depth = REFUTATION_DEPTH[rules.game] ?? 3,
): PuzzleRun<S> {
  if (run.phase !== 'wrong' || run.refutation !== null || !run.wrongMove) return run;

  const move = run.wrongMove;
  const played = rules.validateMove(run.state, move);

  // The boards only offer legal moves, so this is the rare path — a promotion
  // that arrived without a piece, say. There is no position to show and no
  // opponent answer to find, and returning a refutation (rather than null)
  // is what stops the caller asking again.
  if (!played.valid || !played.resultingState) {
    return { ...run, refutation: { move, reply: null, refuted: false, score: 0, legal: false } };
  }

  const after = settle(played.resultingState, rules);
  // White-positive everywhere, so one flip puts every game in the player's terms.
  const sign = run.puzzle.playerColor === 'white' ? 1 : -1;
  const { score, bestMove } = rules.analyze(after, depth);
  const playerScore = sign * score;
  const refuted = playerScore <= REFUTED_SCORE;

  const timeline = [...run.timeline.slice(0, run.mainLength), after];
  // Only play the answer out when it is actually an answer. After a missed
  // mate in one the engine still returns *a* move, but it is whatever the
  // losing side does with its remaining pawn — showing that as the refutation
  // would be pure noise.
  if (refuted && bestMove) {
    const punished = rules.validateMove(after, bestMove);
    if (punished.valid && punished.resultingState) {
      timeline.push(settle(punished.resultingState, rules));
    }
  }

  return {
    ...run,
    timeline,
    viewIndex: timeline.length - 1,
    refutation: {
      move,
      reply: refuted ? bestMove : null,
      refuted,
      score: playerScore,
      legal: true,
    },
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

  return { ...run, ...advance(run, state), stepIndex, phase: done ? 'solved' : 'playing' };
}

/**
 * Back to the start position, keeping the score.
 *
 * `attempts` and `hintUsed` survive on purpose — retrying is how you solve a
 * puzzle you got wrong, not how you erase having got it wrong.
 */
export function retryPuzzle<S>(run: PuzzleRun<S>, rules: PuzzleRules<S>): PuzzleRun<S> {
  const state = settle(rules.decode(run.puzzle.position), rules);
  return {
    ...run,
    state,
    // The refutation branch goes with it — the whole point of retrying is that
    // the move that produced it never happened.
    timeline: [state],
    mainLength: 1,
    viewIndex: 0,
    stepIndex: 0,
    phase: 'playing',
    wrongMove: null,
    refutation: null,
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

/** "a1→a8", or just the square for a game whose moves have no origin. */
export function formatPuzzleMove(move: PuzzleMove): string {
  return move.from === move.to ? move.to : `${move.from}→${move.to}`;
}

/** What the puzzle asked for, as a verb phrase: "force mate", "win the game". */
function goalPhrase(goal: Puzzle['goal']): string {
  switch (goal) {
    case 'mate':
      return 'force mate';
    case 'win-material':
      return 'win material';
    case 'promote':
      return 'promote';
    case 'win-game':
      return 'win the game';
    default:
      return 'solve the puzzle';
  }
}

/**
 * One sentence explaining the wrong move, or null before the search has run.
 *
 * Lives here rather than in either app so the two platforms cannot drift into
 * telling the player different things about the same position — and so the
 * distinction the runtime draws between "refuted" and "merely not the answer"
 * survives into the words the player actually reads.
 */
export function describeRefutation<S>(run: PuzzleRun<S>): string | null {
  const r = run.refutation;
  if (!r) return null;
  if (!r.legal) return 'That move is not legal here.';

  const opponent = run.puzzle.playerColor === 'white' ? 'Black' : 'White';
  const played = formatPuzzleMove(r.move);

  if (!r.refuted) {
    return `${played} is playable, but it does not ${goalPhrase(run.puzzle.goal)}.`;
  }
  return r.reply
    ? `After ${played}, ${opponent} answers ${formatPuzzleMove(r.reply)} and you are worse.`
    : `${played} loses on the spot.`;
}

/** Record that the player took a hint — costs them the clean solve. */
export function markHintUsed<S>(run: PuzzleRun<S>): PuzzleRun<S> {
  return run.hintUsed ? run : { ...run, hintUsed: true, clean: false };
}
