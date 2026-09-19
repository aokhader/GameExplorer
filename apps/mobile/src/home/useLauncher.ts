import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  continueItemGame,
  pickTryNew,
  readLauncherHistory,
  readPlayAgain,
  type LauncherHistory,
  type PlayAgain,
  type TryNew,
} from '@gameexplorer/client/game/launcher';
import { usePlayerStats } from '@gameexplorer/client/hooks/usePlayerStats';
import { nativeLocalStore } from '@/lib/localStore';
import { readContinueItems, type ContinueItem } from '@/lib/continueGame';
import { mobilePuzzleProgressStore } from '@/lib/puzzleProgress';

export type { PlayAgain, TryNew };

export interface LauncherLocal extends LauncherHistory {
  continueItems: ContinueItem[];
  playAgain: PlayAgain | null;
  /** When this was read — "a month ago" is measured from here, not during render. */
  readAt: number;
  puzzlesSolved: number;
}

async function readLocal(userId: string | null): Promise<LauncherLocal> {
  const [continueItems, history, progress] = await Promise.all([
    readContinueItems(userId),
    readLauncherHistory(nativeLocalStore),
    mobilePuzzleProgressStore.load(),
  ]);
  return {
    ...history,
    continueItems,
    playAgain: history.recent ? await readPlayAgain(nativeLocalStore, history.recent, !!userId) : null,
    readAt: Date.now(),
    puzzlesSolved: progress.solved.length,
  };
}

/**
 * Everything the launcher shows, re-read each time Home comes back into focus —
 * Home stays mounted under a pushed game, so a mount-only read would still show
 * the game the player just finished as unfinished.
 *
 * The rules — what to offer again, what to suggest — are the shared ones in
 * `@gameexplorer/client/game/launcher`, which web's launcher reads too.
 */
export function useLauncher(userId: string | null, authReady: boolean) {
  const [local, setLocal] = useState<LauncherLocal | null>(null);
  const stats = usePlayerStats(authReady ? userId : null);
  const refreshStats = stats.refresh;

  const reload = useCallback(() => {
    if (!authReady) return () => {};
    let active = true;
    readLocal(userId)
      .then((next) => {
        if (active) setLocal(next);
      })
      .catch((err) => console.error('Failed to read the launcher state:', err));
    return () => {
      active = false;
    };
  }, [authReady, userId]);

  // The stats load on mount by themselves; only a return to Home re-reads them.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) refreshStats();
      focusedBefore.current = true;
      return reload();
    }, [reload, refreshStats]),
  );

  // Waits for the stats when signed in, so the suggestion never has to change its
  // mind once the account's history arrives.
  const statsSettled = !userId || !!stats.stats || !stats.loading;
  const tryNew = useMemo(
    () =>
      local?.recent && statsSettled
        ? pickTryNew(local, local.continueItems.map(continueItemGame), stats.stats, local.readAt)
        : null,
    [local, stats.stats, statsSettled],
  );

  return { local, stats, reload, tryNew };
}

/** Where a suggestion's first step lives in this app. */
export function tryNewRoute(tryNew: TryNew): string {
  return tryNew.step.kind === 'lesson' ? `/lesson/${tryNew.game}/${tryNew.step.id}` : `/learn/${tryNew.game}`;
}
