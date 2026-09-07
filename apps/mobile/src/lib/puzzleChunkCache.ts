import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PuzzleChunkCache } from '@gameexplorer/shared';

/**
 * Device cache for fetched puzzle pages, on AsyncStorage.
 *
 * This is the piece that makes the fetched corpus real on a phone: a band the
 * player has worked through once is then available on a plane, on the subway,
 * and after the app is killed. Bundling more content could never do the same
 * job — it would cost megabytes on the cold-boot path to ship puzzles most
 * players never reach.
 *
 * **Why pages and not whole bands.** AsyncStorage is SQLite-backed and has a
 * practical per-item ceiling; a whole chess band is ~850KB, which is asking for
 * trouble (the Liquidate port already trims its action log for this reason).
 * The publisher therefore emits 200-puzzle pages of ~100KB, which store
 * comfortably — the paging exists as much for this cache as for the download.
 *
 * Eviction is least-recently-used against a page budget rather than a byte
 * budget: pages are near enough a fixed size that counting them is honest, and
 * it avoids measuring every entry on every write.
 */

const PREFIX = 'gx:puzzle-chunk:';
const USED_KEY = 'gx:puzzle-chunk-used';

/**
 * Pages kept. Roughly 3MB at ~100KB each — a couple of bands' worth, which is
 * far more than an offline session gets through, and small enough to sit
 * politely inside an app's storage.
 */
const MAX_PAGES = 30;

async function usedOrder(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(USED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

async function setOrder(order: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(USED_KEY, JSON.stringify(order));
  } catch {
    // Losing the LRU list costs a worse eviction choice, nothing more.
  }
}

export const mobilePuzzleChunkCache: PuzzleChunkCache = {
  async read(key) {
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      const order = (await usedOrder()).filter((k) => k !== key);
      order.push(key);
      await setOrder(order);
      return JSON.parse(raw) as unknown;
    } catch {
      // A miss and a failure are the same thing to the caller: fetch it.
      return null;
    }
  },

  async write(key, value) {
    try {
      await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
      const order = (await usedOrder()).filter((k) => k !== key);
      order.push(key);

      // Trim from the front — the least recently read.
      const overflow = order.length - MAX_PAGES;
      if (overflow > 0) {
        const drop = order.splice(0, overflow);
        await AsyncStorage.multiRemove(drop.map((k) => PREFIX + k)).catch(() => {});
      }
      await setOrder(order);
    } catch {
      // A full disk must degrade to "fetch it again", never to "no puzzles".
    }
  },
};
