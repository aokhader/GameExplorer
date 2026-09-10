import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_LESSON_PROGRESS,
  MOBILE_LESSON_PROGRESS_KEY,
  parseLessonProgress,
  serializeLessonProgress,
} from '@gameexplorer/shared';
import type { LessonProgress, LessonProgressStore } from '@gameexplorer/shared';

/**
 * Lesson progress in AsyncStorage, under `gx:lessons` alongside `gx:puzzles`.
 *
 * The native twin of web's `webLessonProgressStore`. Same shape, same reducers,
 * a different key on purpose: the two devices do not sync, and `ge:` / `gx:` is
 * the prefix split the rest of the app already uses.
 *
 * No auth anywhere. A lesson is what a brand-new install opens first, and on a
 * phone a signed-out cold start is the common case rather than the exception.
 */
export const mobileLessonProgressStore: LessonProgressStore = {
  async load(): Promise<LessonProgress> {
    try {
      return parseLessonProgress(await AsyncStorage.getItem(MOBILE_LESSON_PROGRESS_KEY));
    } catch {
      // A read failure loses a bookmark; throwing here would lose the screen.
      return EMPTY_LESSON_PROGRESS;
    }
  },

  async save(next: LessonProgress): Promise<void> {
    try {
      await AsyncStorage.setItem(MOBILE_LESSON_PROGRESS_KEY, serializeLessonProgress(next));
    } catch {
      // Full disk. The lesson in progress is unaffected.
    }
  },
};
