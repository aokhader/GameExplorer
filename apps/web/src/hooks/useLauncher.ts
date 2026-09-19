'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  continueItemGame,
  pickTryNew,
  readContinueItems,
  readLauncherHistory,
  readPlayAgain,
  type ContinueItem,
  type LauncherHistory,
  type PlayAgain,
} from '@gameexplorer/client/game/launcher';
import { usePlayerStats } from '@gameexplorer/client/hooks/usePlayerStats';
import { webLocalStore } from '@/lib/localStore';
import { webLiquidateStore } from '@/lib/liquidateStore';
import { webPuzzleProgressStore } from '@/lib/puzzleProgress';

export interface LauncherLocal extends LauncherHistory {
  continueItems: ContinueItem[];
  playAgain: PlayAgain | null;
  /** When this was read — "a month ago" is measured from here, not during render. */
  readAt: number;
  puzzlesSolved: number;
}

async function readLocal(userId: string | null): Promise<LauncherLocal> {
  const [continueItems, history, progress] = await Promise.all([
    readContinueItems(webLocalStore, webLiquidateStore, userId),
    readLauncherHistory(webLocalStore),
    webPuzzleProgressStore.load(),
  ]);
  return {
    ...history,
    continueItems,
    playAgain: history.recent ? await readPlayAgain(webLocalStore, history.recent, !!userId) : null,
    readAt: Date.now(),
    puzzlesSolved: progress.solved.length,
  };
}

/**
 * Everything web's launcher shows — native's `home/useLauncher.ts` over this
 * browser's stores, with the same rules from `@gameexplorer/client/game/launcher`.
 *
 * Read once auth has resolved, so a signed-in player never sees a guest's game
 * flash past, and again when the tab comes back into view: a game finished in
 * another tab should not still be offered as unfinished here.
 */
export function useLauncher(userId: string | null, authReady: boolean) {
  const [local, setLocal] = useState<LauncherLocal | null>(null);
  const stats = usePlayerStats(authReady ? userId : null);
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    readLocal(userId)
      .then((next) => {
        if (active) setLocal(next);
      })
      .catch((err) => console.error('Failed to read the launcher state:', err));
    return () => {
      active = false;
    };
  }, [authReady, userId, generation]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Waits for the stats when signed in, so the suggestion never has to change
  // its mind once the account's history arrives.
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
