'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { parseLastMode, lastModeStorageKey } from '@gameexplorer/client/game/localSetup';
import { readContinueItems, readLauncherHistory } from '@gameexplorer/client/game/launcher';
import { useAuth } from '@/hooks/useAuth';
import { webLocalStore } from '@/lib/localStore';
import { webLiquidateStore } from '@/lib/liquidateStore';
import { continueHref, modeHref } from '@/lib/gameRoutes';

/** Where Play goes before anything has been read — and for a first visit. */
const DEFAULT_PLAY_HREF = '/chess/bot';

async function resolvePlayHref(userId: string | null): Promise<string> {
  const [next] = await readContinueItems(webLocalStore, webLiquidateStore, userId);
  if (next) return continueHref(next);
  const { recent } = await readLauncherHistory(webLocalStore);
  if (!recent) return DEFAULT_PLAY_HREF;
  const mode = parseLastMode(await webLocalStore.get(lastModeStorageKey(recent)));
  return mode ? modeHref(recent, mode) : `/${recent}`;
}

/**
 * Where the navigation's Play goes (`project-docs/ux-fix-ideas.md` §2.5, §3.1)
 * — native's tab-bar Play, on web: the game left unfinished, else the last
 * game's setup screen, already filled in with what was chosen last time.
 *
 * A real link rather than a button that works it out on click, so it can be
 * opened in a new tab and read by a screen reader. It is worked out again on
 * every navigation: finishing a game changes the answer.
 */
export function usePlayHref(): string {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [href, setHref] = useState(DEFAULT_PLAY_HREF);

  useEffect(() => {
    // Before auth resolves the account is unknown, and a guest's game must not
    // stand in for it.
    if (loading) return;
    let active = true;
    resolvePlayHref(userId)
      .then((next) => {
        if (active) setHref(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [loading, userId, pathname]);

  return href;
}
