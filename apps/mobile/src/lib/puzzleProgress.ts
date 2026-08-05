import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_PROGRESS,
  MOBILE_PUZZLE_PROGRESS_KEY,
  parseProgress,
  serializeProgress,
} from '@gameexplorer/shared';
import type { PuzzleProgress, PuzzleProgressStore } from '@gameexplorer/shared';

/**
 * Puzzle progress in AsyncStorage, under `gx:puzzles` alongside `gx:lastGame`
 * (see `lib/lastPlayed.ts`).
 *
 * The native twin of web's `webPuzzleProgressStore`. Same shape, same reducers,
 * a different key on purpose: the two devices don't sync, and `ge:` / `gx:` is
 * the prefix split the rest of the app already uses.
 *
 * No auth anywhere — a puzzle should be playable the moment the app opens, and
 * on a phone that matters more than on the web, because a signed-out cold start
 * is the common case.
 */
export const mobilePuzzleProgressStore: PuzzleProgressStore = {
  async load(): Promise<PuzzleProgress> {
    try {
      return parseProgress(await AsyncStorage.getItem(MOBILE_PUZZLE_PROGRESS_KEY));
    } catch {
      // A read failure loses a streak; throwing here would lose the screen.
      return EMPTY_PROGRESS;
    }
  },

  async save(next: PuzzleProgress): Promise<void> {
    try {
      await AsyncStorage.setItem(MOBILE_PUZZLE_PROGRESS_KEY, serializeProgress(next));
    } catch {
      // Full disk. The run in progress is unaffected.
    }
  },
};
