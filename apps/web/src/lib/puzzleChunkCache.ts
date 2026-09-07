import type { PuzzleChunkCache } from '@gameexplorer/shared';

/**
 * Device cache for fetched puzzle pages, on `localStorage`.
 *
 * The point is offline play: a page the reader has already been served survives
 * a reload, a flight and a closed laptop. Without it the fetched corpus exists
 * only while the tab is open, and "offline" would mean nothing but the bundled
 * core.
 *
 * **Why `localStorage` and not IndexedDB.** The unit being stored is a ~100KB
 * page, and the whole working set a reader touches in a session is a handful of
 * them. localStorage is synchronous, has no schema, is already how puzzle
 * progress is stored here, and its ~5MB origin budget holds tens of pages —
 * enough that a reader hits eviction only after working through several bands.
 * IndexedDB would buy headroom this does not need at the cost of a schema and
 * an upgrade path.
 *
 * Eviction is least-recently-used, and it exists because the budget is real:
 * six chess bands are 5.1MB whole, so an unbounded cache would fill the origin
 * and start throwing on the *progress* writes, which matter far more than a
 * cached page does.
 */

const PREFIX = 'ge:puzzle-chunk:';
const USED_KEY = 'ge:puzzle-chunk-used';

/** Read the LRU list. Corruption is treated as an empty cache, never a throw. */
function usedOrder(): string[] {
  try {
    const raw = localStorage.getItem(USED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function touch(key: string) {
  try {
    const order = usedOrder().filter((k) => k !== key);
    order.push(key);
    localStorage.setItem(USED_KEY, JSON.stringify(order));
  } catch {
    // The LRU list is an optimisation on an optimisation. Losing it costs a
    // slightly worse eviction choice, nothing more.
  }
}

/** Drop the oldest cached page. Returns false when there was nothing to drop. */
function evictOldest(): boolean {
  const order = usedOrder();
  const oldest = order.shift();
  if (!oldest) return false;
  try {
    localStorage.removeItem(PREFIX + oldest);
    localStorage.setItem(USED_KEY, JSON.stringify(order));
    return true;
  } catch {
    return false;
  }
}

export const webPuzzleChunkCache: PuzzleChunkCache = {
  async read(key) {
    // SSR has no localStorage, and a private window can throw on access rather
    // than merely return null.
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      touch(key);
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  },

  async write(key, value) {
    if (typeof window === 'undefined') return;
    const raw = JSON.stringify(value);
    // Evict and retry rather than give up on the first quota error: the cache
    // is most useful exactly when it is full, and the entry being written is by
    // definition the one wanted right now.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        localStorage.setItem(PREFIX + key, raw);
        touch(key);
        return;
      } catch {
        if (!evictOldest()) return; // nothing left to free — give up quietly
      }
    }
  },
};
