import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLastPlayed, setLastPlayed } from '@/lib/lastPlayed';

describe('lastPlayed', () => {
  beforeEach(() => AsyncStorage.clear());

  it('defaults to chess when nothing is stored', async () => {
    expect(await getLastPlayed()).toBe('chess');
  });

  it('round-trips the stored game', async () => {
    setLastPlayed('reversi');
    // setLastPlayed is fire-and-forget; the mock resolves on the next tick.
    await Promise.resolve();
    expect(await getLastPlayed()).toBe('reversi');
  });

  it('falls back to chess on an unknown stored value', async () => {
    await AsyncStorage.setItem('gx:lastGame', 'poker');
    expect(await getLastPlayed()).toBe('chess');
  });
});
