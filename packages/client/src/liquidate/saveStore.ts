import type { LiquidateGameState } from '@gameexplorer/shared';

/**
 * A Liquidate snapshot and where it is kept — split out of `useLiquidateGame`
 * so a screen that only lists saved games (the launcher) can read them without
 * pulling in the game loop.
 */

export interface SavedLiquidateGame {
  state: LiquidateGameState;
  savedAt: number;
}

/**
 * Where a resumable snapshot lives.
 *
 * `read` is async because one platform's storage is; the others are
 * fire-and-forget because a full or unavailable store must never break play.
 * Implementations own their own key prefix and any size limits — native trims
 * the log because AsyncStorage's SQLite backing has a practical per-item
 * ceiling, which is a fact about that store and belongs with it.
 */
export interface LiquidateSaveStore {
  read(slot: 'bot' | 'local'): Promise<SavedLiquidateGame | null>;
  write(slot: 'bot' | 'local', save: SavedLiquidateGame): void;
  clear(slot: 'bot' | 'local'): void;
}

/**
 * Validate a parsed snapshot before resuming into it.
 *
 * A snapshot from an older board or schema would desync the engine, so every
 * field the engine relies on is checked and anything short of complete is
 * discarded rather than resumed into undefined behaviour. Exported because each
 * platform's store parses its own raw string.
 */
export function isResumableSave(parsed: unknown): parsed is SavedLiquidateGame {
  const s = (parsed as SavedLiquidateGame | null)?.state;
  if (!s?.players?.length || !s.config || !s.decks || !s.rng) return false;
  return typeof s.tradesProposedThisTurn === 'number';
}
