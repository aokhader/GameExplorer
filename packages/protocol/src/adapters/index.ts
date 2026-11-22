// The online game registry: one adapter per game a room can host.
//
// Reached through the `./adapters` subpath. It carries zod and the three
// engines, so the package root never imports it. `conformance.ts` is not
// re-exported: it is test support, and stays out of every runtime bundle.
import type { GameType } from '../sharedTypes';
import { chessAdapter } from './chess';
import { checkersAdapter } from './checkers';
import { reversiAdapter } from './reversi';
import type { OnlineGameAdapter } from './types';

export type { ApplyResult, GameOver, OnlineGameAdapter } from './types';
export { chessAdapter, checkersAdapter, reversiAdapter };

/** Every game type has an adapter: a missing one is a type error here. */
export const ADAPTERS: Readonly<Record<GameType, OnlineGameAdapter>> = {
  chess:    chessAdapter,
  checkers: checkersAdapter,
  reversi:  reversiAdapter,
};

/**
 * The adapter for `gameType`. Throws on anything else, including names that
 * only exist on `Object.prototype`, rather than picking some other game.
 */
export function getAdapter(gameType: GameType): OnlineGameAdapter {
  if (!Object.hasOwn(ADAPTERS, gameType)) throw new Error(`Unknown game type: ${String(gameType)}`);
  return ADAPTERS[gameType];
}
