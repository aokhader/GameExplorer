import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isResumableSave,
  useLiquidateGame as useLiquidateGameCore,
  type LiquidateSaveStore,
  type PlacedToken,
  type SavedLiquidateGame,
} from '@gameexplorer/client/liquidate/useLiquidateGame';
import type { LiquidateBotLevel } from '@gameexplorer/shared';
import { useSettings } from '@/providers/SettingsProvider';

/**
 * Native's Liquidate game hook: the shared loop plus AsyncStorage.
 *
 * The state machine, bot loop and walk clock live in `@gameexplorer/client`,
 * identical to web's. What is genuinely native is below — an async store, this
 * app's key prefix, and trimming the log to something SQLite will accept.
 */

/** `gx:` to match the app's other keys; web uses its own `ge:` prefix. */
const STORAGE_PREFIX = 'gx:liquidate:';

/**
 * How much of the log a resumed game carries.
 *
 * The log is append-only and the engine never reads it back — it is written by
 * `log()` and consumed only by the UI — so the tail is all a resume needs. A
 * full 44-tile game to the last solvent baron runs to thousands of lines, and
 * AsyncStorage's SQLite backing has a practical per-item ceiling. Web has no
 * equivalent cap, which is why this lives with the store rather than in the
 * shared hook.
 */
const LOG_KEEP = 200;

const nativeStore: LiquidateSaveStore = {
  read: async (slot) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_PREFIX + slot);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isResumableSave(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  write: (slot, save) => {
    const state = save.state;
    const trimmed =
      state.log.length > LOG_KEEP ? { ...state, log: state.log.slice(-LOG_KEEP) } : state;
    // Fire-and-forget with a swallowed rejection: a full or unavailable store
    // must not break play. Matches `setLastPlayed`.
    AsyncStorage.setItem(
      STORAGE_PREFIX + slot,
      JSON.stringify({ ...save, state: trimmed }),
    ).catch(() => {});
  },
  clear: (slot) => {
    AsyncStorage.removeItem(STORAGE_PREFIX + slot).catch(() => {});
  },
};

export interface UseLiquidateGameOptions {
  /** Distinguishes the saved slot for each mode. */
  storageKey: 'bot' | 'local';
  botLevel?: LiquidateBotLevel;
}

export function useLiquidateGame({ storageKey, botLevel }: UseLiquidateGameOptions) {
  const { reducedMotion } = useSettings();
  return useLiquidateGameCore({ storageKey, botLevel, store: nativeStore, reducedMotion });
}

export type { PlacedToken, SavedLiquidateGame };
