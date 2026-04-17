import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChessGameState, PieceType } from '@gameexplorer/shared';
import { getBestMoveWeak } from '@gameexplorer/shared';
import type { Difficulty } from '@gameexplorer/shared';

// Stockfish is hardstuck at 1320 min ELO, so it only handles 'hard'.
// beginner / easy / medium are handled by the local minimax weak engine.
const STOCKFISH_CONFIG = {
  hard: { skill: 20, elo: 2500 },
};

const WEAK_ENGINE_DIFFICULTIES: Record<string, Difficulty> = {
  beginner: 'beginner',
  easy: 'easy',
  medium: 'medium',
};

const UCI_PROMOTION_MAP: Record<string, PieceType> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

export type GameDifficulty = 'beginner' | 'easy' | 'medium' | 'hard';

export interface StockfishMove {
  from: string;
  to: string;
  promotion?: PieceType;
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const moveResolverRef = useRef<((move: StockfishMove) => void) | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      workerRef.current = new Worker('/stockfish/stockfish.js');
      workerRef.current.postMessage('uci');

      workerRef.current.onmessage = (e) => {
        const message = typeof e.data === 'string' ? e.data : e.data.data;

        if (message === 'uciok') {
          setIsReady(true);
          workerRef.current?.postMessage('isready');
        }

        if (typeof message === 'string' && message.startsWith('info depth')) {
          if (message.includes('depth 10') || message.includes('depth 12')) {
            console.log('Bot Thought Process:', message);
          }
        }

        if (typeof message === 'string' && message.startsWith('bestmove')) {
          const moveStr = message.split(' ')[1];

          if (moveStr && moveResolverRef.current) {
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            const promotionChar = moveStr.length === 5 ? moveStr[4] : undefined;
            const promotion = promotionChar
              ? UCI_PROMOTION_MAP[promotionChar]
              : undefined;

            moveResolverRef.current({ from, to, promotion });
            moveResolverRef.current = null;
          }
        }
      };
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const getBestMove = useCallback(
    (
      gameState: ChessGameState,
      difficulty: GameDifficulty,
    ): Promise<StockfishMove> => {
      // -----------------------------------------------------------------------
      // Weak engine path — runs synchronously on the main thread, wrapped in a
      // promise to keep the call-site interface identical to the Stockfish path.
      // -----------------------------------------------------------------------
      const weakDifficulty = WEAK_ENGINE_DIFFICULTIES[difficulty];
      if (weakDifficulty) {
        return new Promise((resolve, reject) => {
          try {
            // Small setTimeout so the UI can render the "thinking" state before
            // the synchronous minimax blocks the thread (depth 1–3 is fast but
            // noticeable at depth 3 on slower devices).
            setTimeout(() => {
              const move = getBestMoveWeak(gameState, weakDifficulty);
              resolve(move);
            }, 0);
          } catch (err) {
            reject(err);
          }
        });
      }

      // -----------------------------------------------------------------------
      // Stockfish path — only for 'hard'
      // -----------------------------------------------------------------------
      return new Promise((resolve, reject) => {
        if (!workerRef.current || !isReady) {
          reject(new Error('Stockfish is not ready yet'));
          return;
        }

        moveResolverRef.current = resolve;

        const config = STOCKFISH_CONFIG[difficulty as keyof typeof STOCKFISH_CONFIG];

        console.log(
          `Configuring Bot for ${difficulty.toUpperCase()} mode (Target ELO: ${config.elo})`,
        );

        workerRef.current.postMessage('ucinewgame');
        workerRef.current.postMessage('setoption name UCI_LimitStrength value true');
        workerRef.current.postMessage(`setoption name UCI_Elo value ${config.elo}`);
        workerRef.current.postMessage(
          `setoption name Skill Level value ${config.skill}`,
        );

        if (gameState.moveHistory && gameState.moveHistory.length > 0) {
          const uciMoves = gameState.moveHistory
            .map((m) => {
              const base = `${m.from}${m.to}`;
              return m.promotion ? base + m.promotion[0] : base;
            })
            .join(' ');
          workerRef.current.postMessage(`position startpos moves ${uciMoves}`);
        } else {
          workerRef.current.postMessage('position startpos');
        }

        workerRef.current.postMessage('go movetime 1000');
      });
    },
    [isReady],
  );

  return { isReady, getBestMove };
}