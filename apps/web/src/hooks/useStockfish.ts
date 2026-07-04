import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChessGameState, PieceType } from '@gameexplorer/shared';
import {
  getStockfishEnginePath,
  getStockfishThreads,
  isMultiThreadSupported,
} from '../lib/stockfishEngine';

/**
 * ELO threshold above which we hand off to Stockfish.
 * Stockfish's minimum UCI_Elo is ~1320; we start using it at 1400 as
 * requested. Below that, callers must use the chess engine worker's
 * getBotMove (useChessEngine) so the weak engine's minimax never runs on
 * the main thread.
 */
export const STOCKFISH_MIN_ELO = 1400;

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

const UCI_PROMOTION_MAP: Record<string, PieceType> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
};

export interface StockfishMove {
  from: string;
  to: string;
  promotion?: PieceType;
}

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

      if (message.startsWith('bestmove')) {
        const moveStr = message.split(' ')[1];
        if (moveStr && moveResolverRef.current) {
          const from = moveStr.substring(0, 2);
          const to   = moveStr.substring(2, 4);
          const promotionChar = moveStr.length === 5 ? moveStr[4] : undefined;
          const promotion = promotionChar ? UCI_PROMOTION_MAP[promotionChar] : undefined;
          moveResolverRef.current({ from, to, promotion });
          moveResolverRef.current = null;
        }
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

        const clampedElo = Math.max(1320, Math.min(3190, targetElo));
        // Give Stockfish more time as strength increases so it actually reaches
        // the configured ELO (higher ELO → needs deeper search).
        const moveTime = Math.round(500 + ((targetElo - STOCKFISH_MIN_ELO) / 1600) * 1000);

        // No ucinewgame here: the worker lives for exactly one game (it is
        // created when the game starts), so keeping the hash between moves
        // makes each successive search faster.
        workerRef.current.postMessage('setoption name UCI_LimitStrength value true');
        workerRef.current.postMessage(`setoption name UCI_Elo value ${clampedElo}`);
        workerRef.current.postMessage('setoption name Skill Level value 20');

        if (gameState.moveHistory.length > 0) {
          const uciMoves = gameState.moveHistory
            .map(m => `${m.from}${m.to}${m.promotion ? m.promotion[0] : ''}`)
            .join(' ');
          workerRef.current.postMessage(`position startpos moves ${uciMoves}`);
        } else {
          workerRef.current.postMessage('position startpos');
        }

        workerRef.current.postMessage(`go movetime ${moveTime}`);
      });
    },
    [isReady],
  );

  return { isReady, getBestMove };
}
