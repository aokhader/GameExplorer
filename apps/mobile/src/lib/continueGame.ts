import {
  readContinueItems as readSharedContinueItems,
  type ContinueItem,
} from '@gameexplorer/client/game/launcher';
import { nativeLiquidateStore } from '@/liquidate/useLiquidateGame';
import { nativeLocalStore } from './localStore';

export type { ContinueItem };

/**
 * The games this device was in the middle of, the most recent first — the shared
 * rule in `@gameexplorer/client/game/launcher`, over this app's two stores.
 */
export function readContinueItems(userId: string | null): Promise<ContinueItem[]> {
  return readSharedContinueItems(nativeLocalStore, nativeLiquidateStore, userId);
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
