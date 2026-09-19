import { lastModeStorageKey, type LastSetupMode, type SetupGame } from '@gameexplorer/client/game/localSetup';
import { recordFinished, recordPlayed } from '@gameexplorer/client/game/launcher';
import type { GameId } from '@gameexplorer/shared';
import { webLocalStore } from '@/lib/localStore';
import { markReturning } from '@/lib/returning';

/**
 * This browser's play history: the shared launcher model's keys
 * (`@gameexplorer/client/game/launcher`), written through the same store the
 * setup memory uses, so web's launcher and native's read one set of rules.
 */

/** A game of this kind was started or resumed, in this mode. */
export function markPlayed(game: GameId, mode?: LastSetupMode): void {
  markReturning();
  void recordPlayed(webLocalStore, game);
  // The mode a game page's Play panel offers next time — the same key native's
  // one setup screen reopens on.
  if (mode) void webLocalStore.set(lastModeStorageKey(game as SetupGame), mode);
}

/** A game on this browser reached its result. */
export function markFinished(): void {
  markReturning();
  void recordFinished(webLocalStore);
}
