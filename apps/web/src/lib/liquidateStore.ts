import { isResumableSave, type LiquidateSaveStore } from '@gameexplorer/client/liquidate/saveStore';
import { markReturning } from '@/lib/returning';

/**
 * Liquidate's saved games in `localStorage` — the game screen writes them, and
 * the launcher lists them without loading the game.
 */

/** `ge:` — web's long-standing prefix; native uses its own `gx:`. */
const STORAGE_PREFIX = 'ge:liquidate:';

export const webLiquidateStore: LiquidateSaveStore = {
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
      markReturning();
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

