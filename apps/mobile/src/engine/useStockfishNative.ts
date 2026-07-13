import { useCallback, useEffect, useState } from 'react';
import type { ChessGameState, UciBestMove } from '@gameexplorer/shared';
import {
  ensureStockfishStarted,
  getStockfishBestMove,
  isStockfishAvailable,
  isStockfishReady,
  subscribeStockfishReady,
} from './stockfishEngine';

/**
 * Screen-facing view of the native Stockfish service — the mobile counterpart
 * of web's `useStockfish({ enabled })`. Pass `enabled` only when a ≥1400 bot
 * game actually needs the engine so the ~75 MB NNUE load doesn't happen on the
 * setup screen; once started, the engine stays up for the app session (see
 * stockfishEngine.ts).
 */
export function useStockfishNative({ enabled }: { enabled: boolean }) {
  const [isReady, setIsReady] = useState(isStockfishReady);

  useEffect(() => subscribeStockfishReady(setIsReady), []);

  useEffect(() => {
    if (enabled) ensureStockfishStarted();
  }, [enabled]);

  const getBestMove = useCallback(
    (state: ChessGameState, targetElo: number): Promise<UciBestMove> =>
      getStockfishBestMove(state, targetElo),
    [],
  );

  return { isAvailable: isStockfishAvailable(), isReady, getBestMove };
}
