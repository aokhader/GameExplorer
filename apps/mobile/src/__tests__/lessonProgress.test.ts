import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_LESSON_PROGRESS,
  MOBILE_LESSON_PROGRESS_KEY,
  recordLessonCompleted,
  recordStep,
} from '@gameexplorer/shared';
import { mobileLessonProgressStore } from '@/lib/lessonProgress';

describe('mobileLessonProgressStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('starts empty', async () => {
    await expect(mobileLessonProgressStore.load()).resolves.toEqual(EMPTY_LESSON_PROGRESS);
  });

  it('round-trips a finished lesson through storage', async () => {
    let progress = recordStep(EMPTY_LESSON_PROGRESS, 'chess-l01', 4);
    progress = recordLessonCompleted(progress, 'chess-l01');
    await mobileLessonProgressStore.save(progress);

    await expect(mobileLessonProgressStore.load()).resolves.toEqual(progress);
    // Under the mobile key, not web's `ge:lessons` — the two never share storage.
    expect(await AsyncStorage.getItem(MOBILE_LESSON_PROGRESS_KEY)).toContain('chess-l01');
    expect(MOBILE_LESSON_PROGRESS_KEY).toBe('gx:lessons');
  });

  it('treats unreadable stored data as no progress', async () => {
    await AsyncStorage.setItem(MOBILE_LESSON_PROGRESS_KEY, 'not json');
    await expect(mobileLessonProgressStore.load()).resolves.toEqual(EMPTY_LESSON_PROGRESS);
  });

  // A phone can genuinely fail to read or write — a full disk, or a keystore
  // that refuses. Losing a bookmark is survivable; losing the screen is not.
  it('survives a storage read that throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('no'));
    await expect(mobileLessonProgressStore.load()).resolves.toEqual(EMPTY_LESSON_PROGRESS);
  });

  it('survives a storage write that throws', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));
    await expect(
      mobileLessonProgressStore.save(recordStep(EMPTY_LESSON_PROGRESS, 'go-l01', 1)),
    ).resolves.toBeUndefined();
  });
});
