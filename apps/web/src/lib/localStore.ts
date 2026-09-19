import type { LocalStore } from '@gameexplorer/client/storage';
import { markReturning } from '@/lib/returning';

/**
 * `localStorage` behind the client layer's `LocalStore` — remembered setups and
 * unfinished games.
 *
 * `getSync` is what lets a setup screen paint the player's last choices on its
 * first frame instead of the defaults. Every access is guarded: the server
 * renders these screens with no storage at all, and private browsing and
 * blocked site data throw on access rather than returning null.
 */
function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const webLocalStore: LocalStore = {
  getSync: read,
  get: async (key) => read(key),
  set: async (key, value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
      // Everything written here is history the launcher reads: a remembered
      // setup, a game in progress, what was played (`lib/returning.ts`).
      if (key.startsWith('gx:')) markReturning();
    } catch {
      /* full or blocked — not remembered this time */
    }
  },
  remove: async (key) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* blocked */
    }
  },
};
