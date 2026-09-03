import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChessGameState, UciBestMove } from '@finesse/shared';
import {
  // The shared helpers are engine-neutral (mobile drives Arasan through them);
  // this hook is web's real Stockfish, so alias them back to Stockfish names.
  ENGINE_MIN_ELO as STOCKFISH_MIN_ELO,
  buildUciPositionCommand,
  clampStockfishElo,
  parseUciBestMove,
  engineMoveTimeMs as stockfishMoveTimeMs,
} from '@finesse/shared';
import {
  getStockfishEnginePath,
  getStockfishThreads,
  isMultiThreadSupported,
} from '../lib/stockfishEngine';

/**
 * ELO threshold above which we hand off to Stockfish (the shared
 * `ENGINE_MIN_ELO`, which mobile's native Arasan service also uses).
 * Below it, callers must use the chess engine worker's getBotMove
 * (useChessEngine) so the weak engine's minimax never runs on the main thread.
 */
export { STOCKFISH_MIN_ELO };

/**
 * Minimum think time (ms) shown in the UI. The engine may compute faster;
 * the bot page Promise.all()s this with the engine call to pad it.
 */
export function thinkTimeForElo(elo: number): number {
  if (elo < 800)  return 400;
  if (elo < 1200) return 650;
  if (elo < 1400) return 900;
  if (elo < 1800) return 1100;
  return 1400;
}

export type StockfishMove = UciBestMove;

export interface UseStockfishOptions {
  /**
   * When false, the Stockfish worker is not created and its ~7 MB WASM is not
   * downloaded. Lets callers defer the heavy engine until the user actually
   * starts a game instead of paying for it on a setup/browse screen.
   * Defaults to true so existing callers keep their eager behaviour.
   */
  enabled?: boolean;
}

export function useStockfish({ enabled = true }: UseStockfishOptions = {}) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const moveResolverRef = useRef<((move: StockfishMove) => void) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return;

    workerRef.current = new Worker(getStockfishEnginePath());
    workerRef.current.postMessage('uci');
    if (isMultiThreadSupported()) {
      // Multi-threaded build (cross-origin isolated page): reach the
      // configured strength in less wall-clock time per move.
      workerRef.current.postMessage(`setoption name Threads value ${getStockfishThreads()}`);
    }
    // One fresh-game signal per worker lifetime (= one game; see getBestMove).
    workerRef.current.postMessage('ucinewgame');

    workerRef.current.onmessage = (e) => {
      const message = typeof e.data === 'string' ? e.data : e.data?.data;
      if (!message) return;

      if (message === 'uciok') {
        setIsReady(true);
        workerRef.current?.postMessage('isready');
      }

      const bestMove = parseUciBestMove(message);
      if (bestMove && moveResolverRef.current) {
        moveResolverRef.current(bestMove);
        moveResolverRef.current = null;
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      moveResolverRef.current = null;
      setIsReady(false);
    };
  }, [enabled]);

  const getBestMove = useCallback(
    (gameState: ChessGameState, targetElo: number): Promise<StockfishMove> => {
      return new Promise((resolve, reject) => {
        if (targetElo < STOCKFISH_MIN_ELO) {
          // Weak strengths belong in the chess engine worker (getBotMove) —
          // running the JS minimax here would block the main thread.
          reject(new Error(`Stockfish handles ELO ${STOCKFISH_MIN_ELO}+; use useChessEngine().getBotMove for weaker bots`));
          return;
        }
        if (!workerRef.current || !isReady) {
          reject(new Error('Stockfish not ready'));
          return;
        }

        moveResolverRef.current = resolve;

        // No ucinewgame here: the worker lives for exactly one game (it is
        // created when the game starts), so keeping the hash between moves
        // makes each successive search faster.
        workerRef.current.postMessage('setoption name UCI_LimitStrength value true');
        workerRef.current.postMessage(`setoption name UCI_Elo value ${clampStockfishElo(targetElo)}`);
        workerRef.current.postMessage('setoption name Skill Level value 20');
        workerRef.current.postMessage(buildUciPositionCommand(gameState.moveHistory));
        workerRef.current.postMessage(`go movetime ${stockfishMoveTimeMs(targetElo)}`);
      });
    },
    [isReady],
  );

  return { isReady, getBestMove };
}
