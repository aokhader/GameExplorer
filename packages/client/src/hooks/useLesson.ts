// Drives one coached lesson: load it, own the beat before the opponent's
// scripted answer, and remember how far the learner got.
//
// The twin of `usePuzzle`, and the differences are the whole point of the mode:
//
//   |                | usePuzzle                       | useLesson                    |
//   |----------------|---------------------------------|------------------------------|
//   | acceptance     | one scripted move               | a set, a shape, or nothing   |
//   | non-move steps | none                            | `continue()` on a read step  |
//   | wrong answer   | depth-4 minimax + a refutation  | the authored line, no search |
//   | coach text     | derived from the phase          | state (`run.say`)            |
//   | board resets   | forbidden by the invariant      | `step.position`              |
//   | progress       | streak, clean solve, next fetch | furthest step + completion   |
//
// **There is no engine search anywhere on this path**, which is what makes a
// lesson cheap on a phone and its copy deterministic. Every decision — is this
// move accepted, which miss line answers it, is the lesson over — lives in the
// shared reducer, which is unit-tested; this hook only sequences those calls.
//
// The progress store is injected rather than read from storage directly: the
// import-boundary test forbids DOM globals in this package, and `usePuzzle`'s
// note about NOT importing `@gameexplorer/db` here applies identically.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_ANIM_MS,
  EMPTY_LESSON_PROGRESS,
  LESSONS,
  applyLessonReply,
  continueLesson,
  currentStep,
  isLessonAtLive,
  lessonBoard,
  lessonFraction,
  lessonHint,
  lessonHintText,
  markHintShown,
  offerMove,
  puzzleRulesFor,
  recordLessonCompleted,
  recordLessonSeen,
  recordStep,
  retryStep,
  seekLesson,
  startLesson,
} from '@gameexplorer/shared';
import type {
  Lesson,
  LessonGame,
  LessonMark,
  LessonPhase,
  LessonProgress,
  LessonProgressStore,
  LessonRun,
  LessonSayKind,
  LessonStep,
  PuzzleMove,
} from '@gameexplorer/shared';

/**
 * Beat before the opponent's scripted answer.
 *
 * Derived from the piece animation rather than picked independently, so the
 * reply lands just after the learner's move finishes travelling instead of
 * stepping on it — the same reasoning, and the same number, as `usePuzzle`.
 */
const DEFAULT_REPLY_DELAY_MS = Math.round(BOARD_ANIM_MS * 1.3);

export interface UseLessonOptions {
  game: LessonGame;
  lessonId: string;
  progress: LessonProgressStore;
  replyDelayMs?: number;
}

export interface UseLessonResult<S> {
  lesson: Lesson | null;
  run: LessonRun<S> | null;
  /** The step being worked on, or null once the lesson is done. */
  step: LessonStep | null;
  phase: LessonPhase | null;
  /** The coach's live line, and what kind of line it is. Never null mid-lesson. */
  say: string;
  sayKind: LessonSayKind;
  /** True only before anything is on screen. */
  loading: boolean;
  /** Set when the id names no lesson — a stale bookmark, not a crash. */
  error: string | null;
  /** The position to draw, which may be history rather than the live one. */
  board: S | null;
  /** What to draw on the board for this step. */
  marks: LessonMark[];
  /** Step index, total, and the fraction for a progress bar. */
  stepIndex: number;
  stepCount: number;
  fraction: number;
  /** Wrong answers this sitting. Not scored — it drives the "want a hint?" nudge. */
  misses: number;
  viewIndex: number;
  timelineLength: number;
  /** Timeline indices that begin a new segment, so a scrubber can draw a break. */
  segmentStarts: number[];
  atLive: boolean;
  /** The move to draw as a hint, once asked for. Cleared on every step. */
  hint: PuzzleMove | null;
  /** The authored nudge for this step, if the author wrote one. */
  hintText: string | null;
  hintShown: boolean;
  /** Stored progress, for a "you finished this" badge. */
  progress: LessonProgress;
  /** The next lesson in this game's set, for the end-of-lesson call to action. */
  nextLesson: Lesson | null;
  playMove: (move: PuzzleMove) => void;
  /** Advance a `read` step. A no-op on every other kind. */
  advance: () => void;
  retry: () => void;
  seek: (index: number) => void;
  showHint: () => void;
  /** Start this lesson again from the top. Progress is kept. */
  restart: () => void;
}

export function useLesson<S>({
  game,
  lessonId,
  progress: store,
  replyDelayMs = DEFAULT_REPLY_DELAY_MS,
}: UseLessonOptions): UseLessonResult<S> {
  const rules = puzzleRulesFor<S>(game);

  const lesson = useMemo(
    () => LESSONS[game]?.lessons.find((entry) => entry.id === lessonId) ?? null,
    [game, lessonId],
  );
  const nextLesson = useMemo(() => {
    const set = LESSONS[game]?.lessons ?? [];
    const index = set.findIndex((entry) => entry.id === lessonId);
    return index >= 0 ? (set[index + 1] ?? null) : null;
  }, [game, lessonId]);

  const [run, setRun] = useState<LessonRun<S> | null>(null);
  const [progress, setProgress] = useState<LessonProgress>(EMPTY_LESSON_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState<PuzzleMove | null>(null);

  // The lesson whose completion has already been written, so a re-render or a
  // double-fired effect cannot bank it twice.
  const bankedRef = useRef<string | null>(null);
  // Furthest step written, so the store is not asked to save on every step of
  // a lesson somebody is repeating.
  const savedStepRef = useRef(0);

  // The newest progress record, which is NOT the same thing as the `progress`
  // state a given render closed over.
  //
  // The last step and the completion are banked by two separate effects that
  // fire in the *same* commit when a lesson ends. Both closing over `progress`
  // meant the second one wrote a record built from the value before the first
  // one's update — so finishing a lesson recorded the completion and silently
  // dropped the final step. Every write goes through `commit` below, which
  // reads this ref.
  const progressRef = useRef<LessonProgress>(EMPTY_LESSON_PROGRESS);

  const commit = useCallback(
    (update: (current: LessonProgress) => LessonProgress) => {
      const next = update(progressRef.current);
      if (next === progressRef.current) return;
      progressRef.current = next;
      setProgress(next);
      void store.save(next);
    },
    [store],
  );

  // -- start ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHint(null);
    bankedRef.current = null;
    savedStepRef.current = 0;

    if (!lesson) {
      setRun(null);
      setLoading(false);
      return;
    }

    setRun(startLesson<S>(lesson, rules));

    void (async () => {
      const stored = await store.load();
      if (cancelled) return;
      progressRef.current = stored;
      setProgress(stored);
      savedStepRef.current = stored.steps[lesson.id] ?? 0;

      commit((current) => recordLessonSeen(current, game, lesson.id));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `rules` is derived from `game`, and `store` is a module-level singleton in
    // practice; keeping them out avoids restarting the lesson on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, game]);

  // -- the opponent's beat ---------------------------------------------------
  useEffect(() => {
    if (run?.phase !== 'replying') return;

    const timer = setTimeout(() => {
      setRun((current) => (current ? applyLessonReply(current, rules) : current));
    }, replyDelayMs);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.phase, run?.stepIndex, replyDelayMs]);

  // -- remember how far they got --------------------------------------------
  useEffect(() => {
    if (!run || !lesson) return;
    if (run.stepIndex <= savedStepRef.current) return;
    savedStepRef.current = run.stepIndex;

    // Through `commit` rather than a `setProgress` updater: an updater must
    // stay pure, and React runs it twice under StrictMode — so a `save()`
    // smuggled inside one would fire twice.
    const step = run.stepIndex;
    commit((current) => recordStep(current, lesson.id, step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.stepIndex, lesson?.id]);

  // -- bank the completion ---------------------------------------------------
  useEffect(() => {
    if (run?.phase !== 'done' || !lesson) return;
    if (bankedRef.current === lesson.id) return;
    bankedRef.current = lesson.id;

    commit((current) => recordLessonCompleted(current, lesson.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.phase, lesson?.id]);

  // -- actions ---------------------------------------------------------------
  const playMove = useCallback(
    (move: PuzzleMove) => {
      setRun((current) => (current ? offerMove(current, rules, move).run : current));
      setHint(null);
    },
    [rules],
  );

  const advance = useCallback(() => {
    setRun((current) => (current ? continueLesson(current, rules) : current));
    setHint(null);
  }, [rules]);

  const retry = useCallback(() => {
    setRun((current) => (current ? retryStep(current, rules) : current));
    setHint(null);
  }, [rules]);

  const seek = useCallback((index: number) => {
    setRun((current) => (current ? seekLesson(current, index) : current));
  }, []);

  const showHint = useCallback(() => {
    if (!run) return;
    setHint(lessonHint(run, rules));
    setRun(markHintShown(run));
  }, [run, rules]);

  const restart = useCallback(() => {
    if (!lesson) return;
    setRun(startLesson<S>(lesson, rules));
    setHint(null);
    bankedRef.current = null;
  }, [lesson, rules]);

  return {
    lesson,
    run,
    step: run ? currentStep(run) : null,
    phase: run?.phase ?? null,
    say: run?.say ?? '',
    sayKind: run?.sayKind ?? 'instruction',
    loading,
    error: !loading && !lesson ? 'That lesson does not exist.' : null,
    board: run ? lessonBoard(run) : null,
    marks: run?.marks ?? [],
    stepIndex: run?.stepIndex ?? 0,
    stepCount: lesson?.steps.length ?? 0,
    fraction: run ? lessonFraction(run) : 0,
    misses: run?.misses ?? 0,
    viewIndex: run?.viewIndex ?? 0,
    timelineLength: run?.timeline.length ?? 0,
    segmentStarts: run?.segmentStarts ?? [0],
    atLive: run ? isLessonAtLive(run) : true,
    hint,
    hintText: run ? lessonHintText(run) : null,
    hintShown: run?.hintShown ?? false,
    progress,
    nextLesson,
    playMove,
    advance,
    retry,
    seek,
    showHint,
    restart,
  };
}
