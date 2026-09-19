import {
  EMPTY_LESSON_PROGRESS,
  WEB_LESSON_PROGRESS_KEY,
  parseLessonProgress,
  serializeLessonProgress,
} from '@gameexplorer/shared';
import type { LessonProgress, LessonProgressStore } from '@gameexplorer/shared';
import { markReturning } from '@/lib/returning';

/**
 * Lesson progress in `localStorage`, under `ge:lessons` alongside `ge:puzzles`
 * and the `ge:onboarded` flag.
 *
 * The twin of `webPuzzleProgressStore`, down to the two `try` blocks: private
 * mode and blocked-storage settings throw on access rather than returning null,
 * and losing a bookmark beats failing to open the page.
 *
 * No auth anywhere, on purpose. A lesson is the first thing a brand-new visitor
 * is pointed at, and asking them to sign in before their place is remembered
 * would waste that.
 */
export const webLessonProgressStore: LessonProgressStore = {
  async load(): Promise<LessonProgress> {
    if (typeof window === 'undefined') return EMPTY_LESSON_PROGRESS;
    try {
      return parseLessonProgress(window.localStorage.getItem(WEB_LESSON_PROGRESS_KEY));
    } catch {
      return EMPTY_LESSON_PROGRESS;
    }
  },

  async save(next: LessonProgress): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WEB_LESSON_PROGRESS_KEY, serializeLessonProgress(next));
      markReturning();
    } catch {
      // Quota or blocked storage. The lesson itself is unaffected.
    }
  },
};
