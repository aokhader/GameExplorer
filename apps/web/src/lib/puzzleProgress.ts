import {
  EMPTY_PROGRESS,
  WEB_PUZZLE_PROGRESS_KEY,
  parseProgress,
  serializeProgress,
} from '@gameexplorer/shared';
import type { PuzzleProgress, PuzzleProgressStore } from '@gameexplorer/shared';

/**
 * Puzzle progress in `localStorage`, under `ge:puzzles` alongside the
 * `ge:onboarded` flag in `lib/onboarding.ts`.
 *
 * No auth anywhere, on purpose: a puzzle is the shortest path from landing on
 * the site to playing something, and asking a guest to sign in before their
 * streak counts would waste that.
 *
 * Every method is async even though `localStorage` is synchronous — the store
 * interface is shared with mobile's AsyncStorage and with whatever server-backed
 * store replaces both, and having one of them lie about being async would push
 * the difference into every caller.
 */
export const webPuzzleProgressStore: PuzzleProgressStore = {
  async load(): Promise<PuzzleProgress> {
    // Rendered on the server too, where there is no storage — the caller shows
    // the empty state until the client has mounted and re-read it.
    if (typeof window === 'undefined') return EMPTY_PROGRESS;
    try {
      return parseProgress(window.localStorage.getItem(WEB_PUZZLE_PROGRESS_KEY));
    } catch {
      // Private mode and blocked-storage settings throw on access rather than
      // returning null. Losing a streak beats failing to open the page.
      return EMPTY_PROGRESS;
    }
  },

  async save(next: PuzzleProgress): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WEB_PUZZLE_PROGRESS_KEY, serializeProgress(next));
    } catch {
      // Quota or blocked storage. The run itself is unaffected.
    }
  },
};
