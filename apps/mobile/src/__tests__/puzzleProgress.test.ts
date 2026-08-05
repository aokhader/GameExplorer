import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_PROGRESS, MOBILE_PUZZLE_PROGRESS_KEY, recordSolved } from '@gameexplorer/shared';
import { mobilePuzzleProgressStore } from '@/lib/puzzleProgress';

describe('mobilePuzzleProgressStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('starts empty', async () => {
    await expect(mobilePuzzleProgressStore.load()).resolves.toEqual(EMPTY_PROGRESS);
  });

  it('round-trips a solve through storage', async () => {
    const solved = recordSolved(EMPTY_PROGRESS, 'chess-001', true);
    await mobilePuzzleProgressStore.save(solved);

    await expect(mobilePuzzleProgressStore.load()).resolves.toEqual(solved);
    // Under the mobile key, not web's `ge:puzzles` — the two never share storage.
    expect(await AsyncStorage.getItem(MOBILE_PUZZLE_PROGRESS_KEY)).toContain('chess-001');
    expect(MOBILE_PUZZLE_PROGRESS_KEY).toBe('gx:puzzles');
  });

  it('treats unreadable stored data as no progress', async () => {
    await AsyncStorage.setItem(MOBILE_PUZZLE_PROGRESS_KEY, 'not json');
    await expect(mobilePuzzleProgressStore.load()).resolves.toEqual(EMPTY_PROGRESS);
  });

  // A phone can genuinely fail to read or write: full disk, or a keystore that
  // has not unlocked yet. Losing a streak is acceptable; failing to open the
  // puzzle screen is not.
  it('survives a storage failure on both sides', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(mobilePuzzleProgressStore.load()).resolves.toEqual(EMPTY_PROGRESS);

    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(mobilePuzzleProgressStore.save(EMPTY_PROGRESS)).resolves.toBeUndefined();
  });
});
