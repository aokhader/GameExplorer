'use client';

import { useEffect } from 'react';
import type { LastSetupMode } from '@gameexplorer/client/game/localSetup';
import type { GameId } from '@gameexplorer/shared';
import { markPlayed } from '@/lib/playHistory';

/**
 * Record a game as played, in this mode, when it starts — the launcher's game
 * row, its Play again, and the game page's "last played" marker read it back.
 * Opening a setup screen and leaving does not count.
 */
export function useMarkPlayed(game: GameId, mode: LastSetupMode, started: boolean): void {
  useEffect(() => {
    if (started) markPlayed(game, mode);
  }, [game, mode, started]);
}
