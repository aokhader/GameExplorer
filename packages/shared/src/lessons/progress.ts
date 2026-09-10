/**
 * Lesson progress — the shape, and pure reducers over it. No I/O.
 *
 * Twin of `puzzles/progress.ts`, down to the tolerant parse and the injected
 * store, and different from it in the one way the two modes differ: there is no
 * streak and no clean-solve. A lesson is not scored. What is worth remembering
 * is how far through each one the learner got, so "Resume" lands on the step
 * they stopped at rather than the top.
 *
 * There is no auth read anywhere in this file, so **guests work by
 * construction** — which matters more here than for puzzles, because a lesson
 * is the first thing a brand-new player is pointed at.
 */

import type { LessonGame } from './types';

export interface LessonProgress {
  /** Schema version. A record that doesn't say `1` is discarded, not migrated. */
  v: 1;
  /**
   * Furthest step index reached per lesson id.
   *
   * Furthest, not current: a learner who scrolls back through a finished lesson
   * has not un-learned it, and a Resume that walks backwards every time you
   * review something would be worse than none.
   */
  steps: Record<string, number>;
  /** Ids finished, in no particular order. */
  completed: string[];
  /** Last lesson opened per game, so a hub can offer "Continue". */
  lastSeen: Partial<Record<LessonGame, string>>;
  updatedAt: string;
}

export interface LessonProgressStore {
  load(): Promise<LessonProgress>;
  save(next: LessonProgress): Promise<void>;
}

export const EMPTY_LESSON_PROGRESS: LessonProgress = {
  v: 1,
  steps: {},
  completed: [],
  lastSeen: {},
  updatedAt: '',
};

/**
 * Storage keys, matching the documented prefix split: web prefixes `ge:`
 * (alongside `ge:puzzles`, `ge:onboarded`), mobile prefixes `gx:`.
 */
export const WEB_LESSON_PROGRESS_KEY = 'ge:lessons';
export const MOBILE_LESSON_PROGRESS_KEY = 'gx:lessons';

export function isLessonCompleted(progress: LessonProgress, id: string): boolean {
  return progress.completed.includes(id);
}

/** Furthest step reached in this lesson; 0 for one never opened. */
export function furthestStep(progress: LessonProgress, id: string): number {
  return progress.steps[id] ?? 0;
}

/** How many of `ids` are finished — the count a "3 / 8" line on a card wants. */
export function completedAmong(progress: LessonProgress, ids: readonly string[]): number {
  const done = new Set(progress.completed);
  return ids.reduce((n, id) => (done.has(id) ? n + 1 : n), 0);
}

/**
 * Record how far a learner got.
 *
 * Returns the record unchanged when nothing moved forward, matching
 * `recordSeen` in the puzzle module — a new `updatedAt` on every render would
 * make the store write on every paint.
 */
export function recordStep(progress: LessonProgress, id: string, step: number): LessonProgress {
  if (furthestStep(progress, id) >= step) return progress;
  return {
    ...progress,
    steps: { ...progress.steps, [id]: step },
    updatedAt: new Date().toISOString(),
  };
}

export function recordLessonCompleted(progress: LessonProgress, id: string): LessonProgress {
  if (isLessonCompleted(progress, id)) return progress;
  return {
    ...progress,
    completed: [...progress.completed, id],
    updatedAt: new Date().toISOString(),
  };
}

export function recordLessonSeen(
  progress: LessonProgress,
  game: LessonGame,
  id: string,
): LessonProgress {
  if (progress.lastSeen[game] === id) return progress;
  return {
    ...progress,
    lastSeen: { ...progress.lastSeen, [game]: id },
    updatedAt: new Date().toISOString(),
  };
}

/** Forget one lesson — the "start this again" button on a finished one. */
export function clearLesson(progress: LessonProgress, id: string): LessonProgress {
  if (!(id in progress.steps) && !isLessonCompleted(progress, id)) return progress;
  const steps = { ...progress.steps };
  delete steps[id];
  return {
    ...progress,
    steps,
    completed: progress.completed.filter((c) => c !== id),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Read a stored record.
 *
 * Anything unparseable, wrong-shaped, or from a future schema comes back as
 * `EMPTY_LESSON_PROGRESS` rather than throwing. Losing a bookmark is a far
 * better outcome than a crash on a screen a guest just opened, and there is
 * nothing here worth a migration path.
 */
export function parseLessonProgress(raw: string | null | undefined): LessonProgress {
  if (!raw) return EMPTY_LESSON_PROGRESS;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_LESSON_PROGRESS;

    const record = parsed as Partial<LessonProgress>;
    if (record.v !== 1) return EMPTY_LESSON_PROGRESS;

    const steps: Record<string, number> = {};
    if (typeof record.steps === 'object' && record.steps !== null) {
      for (const [id, value] of Object.entries(record.steps)) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          steps[id] = Math.floor(value);
        }
      }
    }

    return {
      v: 1,
      steps,
      completed: Array.isArray(record.completed)
        ? record.completed.filter((id): id is string => typeof id === 'string')
        : [],
      lastSeen:
        typeof record.lastSeen === 'object' && record.lastSeen !== null ? record.lastSeen : {},
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    };
  } catch {
    return EMPTY_LESSON_PROGRESS;
  }
}

export function serializeLessonProgress(progress: LessonProgress): string {
  return JSON.stringify(progress);
}
