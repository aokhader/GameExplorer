import { useCallback, useEffect, useState } from 'react';
import type { ChessGameState, UciBestMove } from '@finesse/shared';
import {
  ensureEngineStarted,
  getEngineBestMove,
  isEngineAvailable,
  isEngineReady,
  subscribeEngineReady,
  subscribeEngineFailed,
} from './chessEngineNative';

/**
 * Screen-facing view of the native Arasan service — the mobile counterpart
 * of web's `useStockfish({ enabled })`. Pass `enabled` only when a bot game
 * actually needs the engine so the network install + engine spin-up doesn't
 * happen on the setup screen; once started, the engine stays up for the app
 * session (see chessEngineNative.ts).
 */
export function useEngineNative({ enabled }: { enabled: boolean }) {
  const [isReady, setIsReady] = useState(isEngineReady);
  // Reactive so a mid-session failure (e.g. NNUE load) flips tiers + the bot
  // path to the in-house engine without a manual refresh.
  const [isAvailable, setIsAvailable] = useState(isEngineAvailable);

  useEffect(() => subscribeEngineReady(setIsReady), []);
  useEffect(() => subscribeEngineFailed(() => setIsAvailable(isEngineAvailable())), []);

  useEffect(() => {
    if (enabled) ensureEngineStarted();
  }, [enabled]);

  const getBestMove = useCallback(
    (state: ChessGameState, targetElo: number): Promise<UciBestMove> =>
      getEngineBestMove(state, targetElo),
    [],
  );

  return { isAvailable, isReady, getBestMove };
}
