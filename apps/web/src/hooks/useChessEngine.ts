import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChessGameState, Position, PieceType } from '@gameexplorer/shared';
import { ChessEngine } from '@gameexplorer/shared'; // only for ChessEngine.newGame()

export type LegalMovesMap = Map<Position, Position[]>;

interface EngineState {
  gameState:     ChessGameState;
  legalMoves:    LegalMovesMap;
  isReady:       boolean;
}

export type BotMoveResult = { from: Position; to: Position; promotion?: PieceType };

interface UseChessEngineReturn extends EngineState {
  makeMove:      (from: Position, to: Position, promotion?: PieceType) => void;
  getBotMove:    (elo: number) => Promise<BotMoveResult>;
  reset:         () => void;
  onBotMove:     (cb: (move: BotMoveResult) => void) => () => void;
}

type BotMoveCallback = (move: BotMoveResult) => void;

export function useChessEngine(initialState?: ChessGameState): UseChessEngineReturn {
  const workerRef     = useRef<Worker | null>(null);
  const botListeners  = useRef<Set<BotMoveCallback>>(new Set());

  const [engineState, setEngineState] = useState<EngineState>({
    gameState:  initialState ?? ChessEngine.newGame(),
    legalMoves: new Map(),
    isReady:    false,
  });

  useEffect(() => {
    // Next.js / webpack 5: new URL(..., import.meta.url) bundles the worker
    // automatically with all its imports from @gameexplorer/shared.
    const worker = new Worker(
      new URL('../workers/chessEngine.worker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;

      if (msg.type === 'STATE_UPDATE') {
        setEngineState({
          gameState:  msg.state,
          legalMoves: new Map(msg.legalMoves), // deserialise entries back into Map
          isReady:    true,
        });
      }

      if (msg.type === 'BOT_MOVE') {
        botListeners.current.forEach(cb => cb(msg));
      }
    };

    // Initialise the worker with the starting position.
    worker.postMessage({ type: 'INIT', state: initialState ?? null });

    return () => { worker.terminate(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once

  const makeMove = useCallback((from: Position, to: Position, promotion?: PieceType) => {
    workerRef.current?.postMessage({ type: 'MAKE_MOVE', from, to, promotion });
  }, []);

  const onBotMove = useCallback((cb: BotMoveCallback) => {
    botListeners.current.add(cb);
    return () => botListeners.current.delete(cb);
  }, []);

  // Returns a Promise that resolves when the worker sends back the bot move.
  const getBotMove = useCallback((elo: number): Promise<BotMoveResult> => {
    return new Promise((resolve, reject) => {
      let unsub: (() => void) | undefined;
      const timer = setTimeout(() => {
        unsub?.();
        reject(new Error('Bot move timeout'));
      }, 15000);
      unsub = onBotMove((move) => {
        clearTimeout(timer);
        resolve(move);
      });
      workerRef.current?.postMessage({ type: 'GET_BOT_MOVE', elo });
    });
  }, [onBotMove]);

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'INIT', state: null });
  }, []);

  return { ...engineState, makeMove, getBotMove, reset, onBotMove };
}