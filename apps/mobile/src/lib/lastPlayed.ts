import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FINISHED_KEY,
  LAST_GAME_KEY,
  PLAYED_AT_KEY,
  isGameId,
  parsePlayedAt,
  recordFinished,
  recordPlayed,
  type PlayedAt,
} from '@gameexplorer/client/game/launcher';
import type { GameId } from '@gameexplorer/shared';
import { nativeLocalStore } from './localStore';

/**
 * This device's play history, through the shared launcher model
 * (`@gameexplorer/client/game/launcher`), which web reads and writes with the
 * same keys and the same rules.
 */

export type GameKey = GameId;
export type { PlayedAt };

export const isGameKey = isGameId;

/** The game the tab bar's Play button jumps into. Defaults to chess. */
export async function getLastPlayed(): Promise<GameKey> {
  try {
    const raw = await AsyncStorage.getItem(LAST_GAME_KEY);
    return isGameKey(raw) ? raw : 'chess';
  } catch {
    return 'chess';
  }
}

/**
 * Record the most recently opened game (fire-and-forget).
 *
 * Kept apart from the start times: the tab bar's Play reopens the last game
 * *opened*, and a setup screen visited without playing is still where the
 * player was.
 */
export function setLastPlayed(game: GameKey): void {
  AsyncStorage.setItem(LAST_GAME_KEY, game).catch(() => {});
}

/** Per-game start times, for the launcher's game row and its suggestion. */
export async function getPlayedAt(): Promise<PlayedAt> {
  try {
    return parsePlayedAt(await AsyncStorage.getItem(PLAYED_AT_KEY));
  } catch {
    return {};
  }
}

/**
 * Whether this device has ever seen a game to its end. The launcher tells a guest
 * that a practice level needs an account only after that — before a first game the line
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
  void recordFinished(nativeLocalStore);
}

/** Record that a game of this kind was started or resumed now (fire-and-forget). */
export function markPlayed(game: GameKey, now: number = Date.now()): void {
  void recordPlayed(nativeLocalStore, game, now);
}
