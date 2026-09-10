/**
 * The lesson loop, as a pure synchronous reducer over an opaque game state.
 *
 * Same discipline as `puzzles/runtime.ts` — no timers, no clock, no engine
 * search — and one deliberate difference from it, which is the whole point of
 * the mode:
 *
 * **A miss does not advance and does not leave the wrong move on the board.**
 * A puzzle leaves the wrong move up and runs a depth-4 minimax to punish it,
 * because a puzzle is a test. A lesson snaps back to the position the step
 * started in and says the sentence an author wrote for that mistake, because a
 * lesson is a lesson. That is what makes the copy deterministic and the whole
 * path free of search — which is what makes it cheap on a phone.
 *
 * The other difference is `LessonStep.position`: the puzzle runtime's invariant
 * is that the line never jumps, and a lesson walking six pieces one at a time
 * has to. Board resets are recorded in `segmentStarts` so a scrubber can show
 * that nothing *moved* there.
 */

import type { PuzzleMove, PuzzleRules } from '../puzzles/types';
import { enumerateAccepted, isOneOf, matchesExpectation, matchesMove, normalizeMove } from './matching';
import type { Lesson, LessonMark, LessonStep } from './types';

export type LessonPhase =
  /** A `read` step is open; Continue advances. */
  | 'reading'
  /** Waiting for the learner's move. */
  | 'acting'
  /** The learner was right; the opponent's scripted answer is owed. */
  | 'replying'
  /** The learner missed. The board is back at the step position; they may retry. */
  | 'missed'
  /** Every step is done. */
  | 'done';

/** What the coach's current line *is*, so a UI can style it without parsing it. */
export type LessonSayKind = 'instruction' | 'success' | 'miss' | 'outro';

export interface LessonRun<S> {
  lesson: Lesson;
  /** The live position — the one the learner is acting in. */
  state: S;
  /**
   * Every position the board may show.
   *
   * Unlike the puzzle runtime there is no branch here: a miss is never played
   * out, so the timeline is always the real line. What it *does* contain that a
   * puzzle's never does is reset positions, which are moves nobody made — see
   * `segmentStarts`.
   */
  timeline: S[];
  /**
   * Indices in `timeline` that begin a new segment: index 0, and every position
   * a `step.position` reset produced.
   *
   * Carried so a scrubber can draw a break rather than implying one move turned
   * the position before it into the position after it.
   */
  segmentStarts: number[];
  /** Which `timeline` entry is on the board. */
  viewIndex: number;
  /** Where the current step began, so Retry knows what to restore. */
  stepStart: number;
  /** Index into `lesson.steps`. Equals `steps.length` once done. */
  stepIndex: number;
  phase: LessonPhase;
  /** The coach's live line. Always a sentence. */
  say: string;
  sayKind: LessonSayKind;
  /** Wrong answers this sitting, across the whole lesson. */
  misses: number;
  /** Steps finished. */
  completed: number;
  /** What to draw on the board for this step. */
  marks: LessonMark[];
  /** The learner asked for help on this step. Cleared when the step changes. */
  hintShown: boolean;
}

export type LessonMoveResult = 'accepted' | 'missed' | 'ignored' | 'done';

/** What the coach says when a step has no line for the mistake that was made. */
const DEFAULT_MISS = 'Not quite. Take another look and try again.';

/** What it says when the board refuses the move outright. */
const ILLEGAL_MISS = 'That move is not legal here.';

/**
 * Run the auto-pass rule to a fixed point.
 *
 * Reversi hands the turn back when the side to move has no legal move, and no
 * lesson spells a pass out. Capped at two, because two consecutive passes end
 * the game and a third would mean the engine disagreed with itself. Lifted
 * whole from `puzzles/runtime.ts` — the rule is the game's, not the mode's.
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

/** Apply a move the content says is legal. Throws if it isn't — the gate's job. */
function applyScripted<S>(state: S, move: PuzzleMove, rules: PuzzleRules<S>, what: string): S {
  const result = rules.validateMove(state, move);
  if (!result.valid || !result.resultingState) {
    throw new Error(`Lesson ${what} '${rules.formatMove(move)}' is not legal in this position`);
  }
  return settle(result.resultingState, rules);
}

/** The step the run is on, or null once it is done. */
export function currentStep<S>(run: LessonRun<S>): LessonStep | null {
  return run.lesson.steps[run.stepIndex] ?? null;
}

/** The position currently on the board — live, or a step back through history. */
export function lessonBoard<S>(run: LessonRun<S>): S {
  return run.timeline[Math.max(0, Math.min(run.timeline.length - 1, run.viewIndex))];
}

/** True when the board is showing the newest position rather than history. */
export function isLessonAtLive<S>(run: LessonRun<S>): boolean {
  return run.viewIndex >= run.timeline.length - 1;
}

/**
 * Open step `index`, applying its board reset if it has one.
 *
 * The one place `phase`, `marks`, `stepStart` and `hintShown` are decided, so
 * every transition below ends here and none of them can forget one.
 */
function enterStep<S>(
  run: LessonRun<S>,
  rules: PuzzleRules<S>,
  index: number,
  say: string,
  sayKind: LessonSayKind,
): LessonRun<S> {
  const step = run.lesson.steps[index];
  if (!step) {
    return {
      ...run,
      stepIndex: run.lesson.steps.length,
      phase: 'done',
      say: run.lesson.outro,
      sayKind: 'outro',
      marks: [],
      hintShown: false,
      viewIndex: run.timeline.length - 1,
    };
  }

  let { state, timeline, segmentStarts } = run;

  // A reset that lands on the position already showing is not a jump — most
  // often the first step restating the lesson's own opener. Appending it would
  // put a duplicate entry in the scrubber and a break where nothing broke.
  if (step.position !== undefined && rules.encode(state) !== step.position) {
    state = settle(rules.decode(step.position), rules);
    timeline = [...timeline, state];
    segmentStarts = [...segmentStarts, timeline.length - 1];
  }

  return {
    ...run,
    state,
    timeline,
    segmentStarts,
    viewIndex: timeline.length - 1,
    stepStart: timeline.length - 1,
    stepIndex: index,
    phase: step.expect.kind === 'read' ? 'reading' : 'acting',
    say,
    sayKind,
    marks: step.marks ?? [],
    hintShown: false,
  };
}

export function startLesson<S>(lesson: Lesson, rules: PuzzleRules<S>): LessonRun<S> {
  const state = settle(rules.decode(lesson.position), rules);
  const base: LessonRun<S> = {
    lesson,
    state,
    timeline: [state],
    segmentStarts: [0],
    viewIndex: 0,
    stepStart: 0,
    stepIndex: 0,
    phase: 'done',
    say: lesson.summary,
    sayKind: 'instruction',
    misses: 0,
    completed: 0,
    marks: [],
    hintShown: false,
  };
  if (lesson.steps.length === 0) return { ...base, say: lesson.outro, sayKind: 'outro' };
  return enterStep(base, rules, 0, lesson.steps[0].instruction, 'instruction');
}

/**
 * Advance past a `read` step.
 *
 * A no-op in every other phase, so a double-tapped Continue cannot skip a step
 * the learner still has to play.
 */
export function continueLesson<S>(run: LessonRun<S>, rules: PuzzleRules<S>): LessonRun<S> {
  if (run.phase !== 'reading') return run;
  const step = run.lesson.steps[run.stepIndex];
  const next = run.stepIndex + 1;
  const nextStep = run.lesson.steps[next];
  return enterStep(
    { ...run, completed: run.completed + 1 },
    rules,
    next,
    // A read step may still carry a line for having read it; most just hand
    // straight over to the next instruction.
    step?.success ?? nextStep?.instruction ?? run.lesson.outro,
    step?.success ? 'success' : 'instruction',
  );
}

/**
 * Which authored line answers this mistake.
 *
 * Checked in order, so the specific entries win and the catch-all — the one
 * with neither key — is last. Falls back to a generic sentence when the step
 * named no misses at all, which is most of them.
 */
function missCopy<S>(
  run: LessonRun<S>,
  rules: PuzzleRules<S>,
  step: LessonStep,
  move: PuzzleMove,
  legal: boolean,
): string {
  for (const miss of step.misses ?? []) {
    if (miss.when) {
      if (isOneOf(rules, move, miss.when)) return miss.say;
      continue;
    }
    if (miss.match) {
      if (legal && matchesMove(rules, run.state, move, miss.match)) return miss.say;
      continue;
    }
    return miss.say; // the catch-all
  }
  return legal ? DEFAULT_MISS : ILLEGAL_MISS;
}

/**
 * Offer the learner's move.
 *
 * Returns `'ignored'` with the run untouched whenever it is not their turn to
 * act — on a `read` step, during the reply beat, once done, or while they are
 * scrolled back through the line. That is what makes every board safe without a
 * single board edit: stray input lands here and stops.
 *
 * A miss is accepted as input and rejected as an answer: `misses` goes up, the
 * coach's line changes, and the board does not move.
 */
export function offerMove<S>(
  run: LessonRun<S>,
  rules: PuzzleRules<S>,
  move: PuzzleMove,
): { run: LessonRun<S>; result: LessonMoveResult } {
  if (run.phase !== 'acting' && run.phase !== 'missed') return { run, result: 'ignored' };
  if (!isLessonAtLive(run)) return { run, result: 'ignored' };

  const step = run.lesson.steps[run.stepIndex];
  if (!step) return { run, result: 'ignored' };

  const legal = normalizeMove(rules, run.state, move);

  if (!legal || !matchesExpectation(rules, run.state, legal, step.expect)) {
    return {
      run: {
        ...run,
        phase: 'missed',
        misses: run.misses + 1,
        say: missCopy(run, rules, step, move, legal !== null),
        sayKind: 'miss',
      },
      result: 'missed',
    };
  }

  // Play the move the learner actually made, not a canonical stand-in. On an
  // `any` step there is no canonical move to substitute, and on a `move` step
  // substituting one would be the app quietly playing something else.
  const state = applyScripted(run.state, legal, rules, 'move');
  const timeline = [...run.timeline, state];
  const played: LessonRun<S> = {
    ...run,
    state,
    timeline,
    viewIndex: timeline.length - 1,
    completed: run.completed + 1,
    say: step.success ?? 'Correct.',
    sayKind: 'success',
  };

  // The success line has to survive the step change — it is the coach reacting
  // to what was just done, and the next step's instruction is carried
  // separately by `currentStep`. So `enterStep` is handed it rather than the
  // new instruction.
  if (step.reply !== undefined) {
    return { run: { ...played, phase: 'replying' }, result: 'accepted' };
  }

  const next = enterStep(played, rules, run.stepIndex + 1, played.say, 'success');
  return { run: next, result: next.phase === 'done' ? 'done' : 'accepted' };
}

/**
 * Play the opponent's scripted answer and hand the turn back.
 *
 * A no-op unless the run is actually waiting on one, so a double-fired timer
 * cannot play the reply twice.
 */
export function applyLessonReply<S>(run: LessonRun<S>, rules: PuzzleRules<S>): LessonRun<S> {
  if (run.phase !== 'replying') return run;
  const step = run.lesson.steps[run.stepIndex];
  if (!step || step.reply === undefined) return run;

  const state = applyScripted(run.state, rules.parseMove(step.reply), rules, 'reply');
  const timeline = [...run.timeline, state];
  return enterStep(
    { ...run, state, timeline, viewIndex: timeline.length - 1 },
    rules,
    run.stepIndex + 1,
    run.say,
    run.sayKind,
  );
}

/**
 * Back to the start of the current step.
 *
 * `misses` survives on purpose — retrying is how you get a step right after
 * getting it wrong, not how you erase having got it wrong. The board is
 * normally already here (a miss is never played out), so this mostly clears the
 * coaching and restores the instruction; it still truncates the timeline,
 * because that is the invariant and not a thing to leave to luck.
 */
export function retryStep<S>(run: LessonRun<S>, rules: PuzzleRules<S>): LessonRun<S> {
  if (run.phase === 'done') return run;
  const step = run.lesson.steps[run.stepIndex];
  if (!step) return run;

  const timeline = run.timeline.slice(0, run.stepStart + 1);
  return {
    ...run,
    state: timeline[timeline.length - 1],
    timeline,
    segmentStarts: run.segmentStarts.filter((i) => i <= run.stepStart),
    viewIndex: timeline.length - 1,
    phase: step.expect.kind === 'read' ? 'reading' : 'acting',
    say: step.instruction,
    sayKind: 'instruction',
    marks: step.marks ?? [],
  };
}

/** Step the board through `timeline`. Callers don't need to clamp. */
export function seekLesson<S>(run: LessonRun<S>, index: number): LessonRun<S> {
  const viewIndex = Math.max(0, Math.min(run.timeline.length - 1, index));
  return viewIndex === run.viewIndex ? run : { ...run, viewIndex };
}

/**
 * The move to draw as a hint, or null when there is nothing to point at.
 *
 * A pure query — taking the hint is a separate decision (`markHintShown`), so a
 * UI can render the arrow and bank the fact in whichever order it likes.
 *
 * The **first** accepted move, not all of them. On an `any` step there can be
 * twenty, and drawing twenty arrows would make the easiest step in the lesson
 * look like the hardest.
 */
export function lessonHint<S>(run: LessonRun<S>, rules: PuzzleRules<S>): PuzzleMove | null {
  if (run.phase !== 'acting' && run.phase !== 'missed') return null;
  const step = run.lesson.steps[run.stepIndex];
  if (!step) return null;
  return enumerateAccepted(rules, run.state, step.expect)[0] ?? null;
}

/** The written nudge for this step, when the author wrote one. */
export function lessonHintText<S>(run: LessonRun<S>): string | null {
  return run.lesson.steps[run.stepIndex]?.hint ?? null;
}

/** Record that the learner asked for help. Nothing is scored on it; it drives the UI. */
export function markHintShown<S>(run: LessonRun<S>): LessonRun<S> {
  return run.hintShown ? run : { ...run, hintShown: true };
}

/** How far through the lesson the learner is, as a fraction for a progress bar. */
export function lessonFraction<S>(run: LessonRun<S>): number {
  const total = run.lesson.steps.length;
  if (total === 0) return 1;
  return Math.min(1, run.completed / total);
}
