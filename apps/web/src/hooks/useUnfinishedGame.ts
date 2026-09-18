import type { LocalGameMode } from '@gameexplorer/client/hooks/useLocalGame';
import { useAuth } from '@gameexplorer/client/hooks/useAuth';
import { useUnfinishedGames } from '@gameexplorer/client/hooks/useUnfinishedGames';
import type { UnfinishedGame, UnfinishedGameType } from '@gameexplorer/client/game/unfinishedGame';
import { webLocalStore } from '@/lib/localStore';

/** Web gives each mode its own route; this is the route a saved game resumes on. */
export function resumeHref(saved: Pick<UnfinishedGame, 'game' | 'mode'>): string {
  const segment: Record<LocalGameMode, string> = { bot: 'bot', training: 'training', 'pass-and-play': 'local' };
  return `/${saved.game}/${segment[saved.mode]}?resume=1`;
}

/**
 * This browser's unfinished game of one kind, for a setup screen's Continue card
 * and its Start guard. Waits for auth, so a signed-in player never sees a guest's
 * game flash past, and a guest never sees an account's.
 */
export function useUnfinishedGame(game: UnfinishedGameType) {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const slots = useUnfinishedGames({ store: webLocalStore, userId, games: [game], enabled: !loading });
  return {
    userId,
    authReady: !loading,
    saved: slots.saved[game] ?? null,
    hydrated: slots.hydrated,
    refresh: slots.refresh,
    settle: (options: { resign: boolean }) => slots.settle(game, options),
    settling: slots.settling === game,
  };
}

/** `?resume=1` — the link a Continue card on another route sends here with. */
export function wantsResume(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('resume') === '1';
}
