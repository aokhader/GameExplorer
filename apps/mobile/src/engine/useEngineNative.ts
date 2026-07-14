import { useCallback, useEffect, useState } from 'react';
import type { ChessGameState, UciBestMove } from '@gameexplorer/shared';
import {
  ensureEngineStarted,
  getEngineBestMove,
  isEngineAvailable,
  isEngineReady,
  subscribeEngineReady,
} from './chessEngineNative';

/**
 * Screen-facing view of the native Arasan service — the mobile counterpart
 * of web's `useStockfish({ enabled })`. Pass `enabled` only when a ≥1400 bot
 * game actually needs the engine so the network install + engine spin-up
 * doesn't happen on the setup screen; once started, the engine stays up for
 * the app session (see chessEngineNative.ts).
 */
export function useEngineNative({ enabled }: { enabled: boolean }) {
  const [isReady, setIsReady] = useState(isEngineReady);

  useEffect(() => subscribeEngineReady(setIsReady), []);

  useEffect(() => {
    if (enabled) ensureEngineStarted();
  }, [enabled]);

  const getBestMove = useCallback(
    (state: ChessGameState, targetElo: number): Promise<UciBestMove> =>
      getEngineBestMove(state, targetElo),
    [],
  );

  return { isAvailable: isEngineAvailable(), isReady, getBestMove };
}
