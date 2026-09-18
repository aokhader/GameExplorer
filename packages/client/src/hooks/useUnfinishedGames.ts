import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalStore } from '../storage';
import { settleUnfinishedGame, type SettleOutcome } from '../game/settleUnfinishedGame';
import {
  parseUnfinishedGame,
  unfinishedGameKey,
  type UnfinishedGame,
  type UnfinishedGameType,
} from '../game/unfinishedGame';

export interface UseUnfinishedGamesOptions {
  store: LocalStore;
  /** Whose games: the signed-in account, or null for this device's guest. */
  userId: string | null;
  /** Which slots to read. A setup screen passes its own game; a launcher passes all four. */
  games: readonly UnfinishedGameType[];
  /**
   * Hold off while auth is still resolving. Reading the guest's slot for a
   * moment and then the account's would flash a guest game at a signed-in player.
   */
  enabled?: boolean;
}

export interface UseUnfinishedGamesResult {
  /** The saved game for each requested type, or null. */
  saved: Partial<Record<UnfinishedGameType, UnfinishedGame | null>>;
  /** False until the slots have been read once for the current account. */
  hydrated: boolean;
  /** Read the slots again — on screen focus, or after a game was played. */
  refresh: () => void;
  /**
   * Close a saved game: a casual one is deleted, a rated one is resigned (or, if
   * it had already ended, recorded). Rejects on a failed rated write and leaves
   * the game in place; the card shows the error and offers the action again.
   */
  settle: (game: UnfinishedGameType, options: { resign: boolean }) => Promise<SettleOutcome>;
  /** The game currently being settled, for a pending state on its card. */
  settling: UnfinishedGameType | null;
}

/**
 * The unfinished games waiting on this device, for Continue cards.
 *
 * Reads only; the loop's `persistence` option is what writes. Kept apart from
 * `useLocalGame` because the cards live where no game is being played — the
 * launcher, and a setup screen before Start.
 */
export function useUnfinishedGames({
  store,
  userId,
  games,
  enabled = true,
}: UseUnfinishedGamesOptions): UseUnfinishedGamesResult {
  const [saved, setSaved] = useState<Partial<Record<UnfinishedGameType, UnfinishedGame | null>>>({});
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [settling, setSettling] = useState<UnfinishedGameType | null>(null);
  const [generation, setGeneration] = useState(0);

  const storeRef = useRef(store);
  storeRef.current = store;
  // The list is usually an inline literal; key the effect on its contents.
  const gamesKey = games.join(',');
  const identity = `${userId ?? 'guest'}|${gamesKey}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const types = gamesKey ? (gamesKey.split(',') as UnfinishedGameType[]) : [];
    Promise.all(
      types.map((game) =>
        storeRef.current
          .get(unfinishedGameKey(game, userId))
          .catch(() => null)
          .then((raw) => [game, parseUnfinishedGame(raw, { game, userId })] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setSaved(Object.fromEntries(entries));
      setHydratedFor(`${userId ?? 'guest'}|${gamesKey}`);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, gamesKey, generation]);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  const settle = useCallback(
    async (game: UnfinishedGameType, options: { resign: boolean }) => {
      setSettling(game);
      try {
        const outcome = await settleUnfinishedGame(storeRef.current, { game, userId }, options);
        if (outcome.kind !== 'busy') setSaved((prev) => ({ ...prev, [game]: null }));
        return outcome;
      } finally {
        setSettling(null);
      }
    },
    [userId],
  );

  const hydrated = enabled && hydratedFor === identity;
  return { saved: hydrated ? saved : {}, hydrated, refresh, settle, settling };
}
