import AsyncStorage from '@react-native-async-storage/async-storage';

export type GameKey = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

const STORAGE_KEY = 'gx:lastGame';

export const isGameKey = (v: unknown): v is GameKey =>
  v === 'chess' || v === 'checkers' || v === 'reversi' || v === 'go' || v === 'liquidate';

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

const PLAYED_AT_KEY = 'gx:playedAt';

/** When each game last had a game *started* — opening its setup screen does not count. */
export type PlayedAt = Partial<Record<GameKey, number>>;

/**
 * Per-game start times, for the launcher: its game row lists the most recently
 * played first, and "Try something new" suggests one not played in a while.
 *
 * Kept apart from `gx:lastGame`, which records the last game *opened* — the
 * tab bar's Play reopens that one, and a setup screen visited without playing
 * is still where the player was.
 */
export async function getPlayedAt(): Promise<PlayedAt> {
  try {
    const raw = await AsyncStorage.getItem(PLAYED_AT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: PlayedAt = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isGameKey(key) && typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const FINISHED_KEY = 'gx:finishedGame';

/**
 * Whether this device has ever seen a game to its end. The launcher tells a guest
 * that a rating needs an account only after that — before a first game the line
 * answers a question nobody has asked yet (`ux-fix-ideas.md` §4.3).
 */
export async function hasFinishedGame(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FINISHED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Record that a game reached its result (fire-and-forget). */
export function markFinished(): void {
  AsyncStorage.setItem(FINISHED_KEY, '1').catch(() => {});
}

/** Record that a game of this kind was started or resumed now (fire-and-forget). */
export function markPlayed(game: GameKey, now: number = Date.now()): void {
  getPlayedAt()
    .then((playedAt) => AsyncStorage.setItem(PLAYED_AT_KEY, JSON.stringify({ ...playedAt, [game]: now })))
    .catch(() => {});
}
