'use client';

import {
  isResumableSave,
  useLiquidateGame as useLiquidateGameCore,
  type LiquidateSaveStore,
  type SavedLiquidateGame,
} from '@gameexplorer/client/liquidate/useLiquidateGame';
import type { LiquidateBotLevel } from '@gameexplorer/shared';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Web's Liquidate game hook: the shared loop plus localStorage.
 *
 * The state machine, bot loop and walk clock live in `@gameexplorer/client`,
 * identical to native's. What is genuinely web is below — a synchronous store
 * behind the shared async interface, and this app's key prefix.
 */

/** `ge:` — web's long-standing prefix; native uses its own `gx:`. */
const STORAGE_PREFIX = 'ge:liquidate:';

const webStore: LiquidateSaveStore = {
  read: async (slot) => {
    // Guarded for the server render, where there is no storage to read.
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + slot);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isResumableSave(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  write: (slot, save) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + slot, JSON.stringify(save));
    } catch {
      // A full or unavailable quota must not break play.
    }
  },
  clear: (slot) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + slot);
    } catch {
      /* nothing to clean up */
    }
  },
};

export interface UseLiquidateGameOptions {
  /** Distinguishes the saved slot for each mode. */
  storageKey: 'bot' | 'local';
  botLevel?: LiquidateBotLevel;
}

export function useLiquidateGame({ storageKey, botLevel }: UseLiquidateGameOptions) {
  const { reducedMotion } = useSettings();
  return useLiquidateGameCore({ storageKey, botLevel, store: webStore, reducedMotion });
}

export type { SavedLiquidateGame };
