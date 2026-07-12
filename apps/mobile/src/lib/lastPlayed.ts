import AsyncStorage from '@react-native-async-storage/async-storage';

export type GameKey = 'chess' | 'checkers' | 'reversi';

const STORAGE_KEY = 'gx:lastGame';

const isGameKey = (v: unknown): v is GameKey =>
  v === 'chess' || v === 'checkers' || v === 'reversi';

/** The game the tab bar's Play button jumps into. Defaults to chess. */
export async function getLastPlayed(): Promise<GameKey> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isGameKey(raw) ? raw : 'chess';
  } catch {
    return 'chess';
  }
}

/** Record the most recently opened game (fire-and-forget). */
export function setLastPlayed(game: GameKey): void {
  AsyncStorage.setItem(STORAGE_KEY, game).catch(() => {});
}
