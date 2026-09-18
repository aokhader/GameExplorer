import {
  UNFINISHED_GAME_TYPES,
  parseUnfinishedGame,
  unfinishedGameKey,
  type UnfinishedGame,
} from '@gameexplorer/client/game/unfinishedGame';
import type { SavedLiquidateGame } from '@gameexplorer/client/liquidate/useLiquidateGame';
import { nativeLiquidateStore } from '@/liquidate/useLiquidateGame';
import { nativeLocalStore } from './localStore';

/**
 * The most recent game this device was in the middle of, whichever kind it is.
 *
 * Two stores feed it: the board games' `gx:inprogress` slots, one per game and
 * account, and Liquidate's own snapshots, one per mode. Liquidate is casual only
 * and keeps no account, so its saves belong to whoever holds the device.
 */
export type ContinueItem =
  | { kind: 'board'; savedAt: number; saved: UnfinishedGame }
  | { kind: 'liquidate'; savedAt: number; slot: 'bot' | 'local'; save: SavedLiquidateGame };

export async function readContinueItems(userId: string | null): Promise<ContinueItem[]> {
  const boards = await Promise.all(
    UNFINISHED_GAME_TYPES.map(async (game) =>
      parseUnfinishedGame(
        await nativeLocalStore.get(unfinishedGameKey(game, userId)).catch(() => null),
        { game, userId },
      ),
    ),
  );
  const liquidate = await Promise.all(
    (['bot', 'local'] as const).map(async (slot) => ({
      slot,
      save: await nativeLiquidateStore.read(slot).catch(() => null),
    })),
  );

  const items: ContinueItem[] = [];
  for (const saved of boards) {
    if (saved) items.push({ kind: 'board', savedAt: saved.savedAt, saved });
  }
  for (const { slot, save } of liquidate) {
    if (save && !save.state.isGameOver) items.push({ kind: 'liquidate', savedAt: save.savedAt, slot, save });
  }
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Where Continue goes. A board game whose result is still owed opens its setup
 * screen, where the Continue card offers to save it; everything else resumes.
 */
export function continueRoute(item: ContinueItem): { pathname: '/play/[game]'; params: Record<string, string> } {
  if (item.kind === 'liquidate') {
    return { pathname: '/play/[game]', params: { game: 'liquidate', resume: item.slot } };
  }
  return {
    pathname: '/play/[game]',
    params: item.saved.end ? { game: item.saved.game } : { game: item.saved.game, resume: '1' },
  };
}
