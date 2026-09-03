import { useEffect, useRef, useCallback } from 'react';
import type { ChessGameState, Position, PieceType } from '@finesse/shared';

export type ReplayableMove = { from: Position; to: Position; promotion?: PieceType };

interface ComputeResponse {
  type: 'LEGAL_MOVES' | 'REPLAY_RESULT';
  requestId: number;
  legalMoves?: [Position, Position[]][];
  timeline?: ChessGameState[];
}

/**
 * Stateless chess computation off the main thread.
 *
 * Wraps the chessEngine worker's request/response messages (GET_LEGAL_MOVES,
 * REPLAY_MOVES) for pages that own their timeline in React state — unlike
 * useChessEngine, this never makes the worker the source of truth.
 * Responses for superseded requests are simply dropped by callers; pending
 * promises are abandoned (never rejected) if the worker is torn down.
 */
export function useChessCompute() {
  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(1);
  const pendingRef = useRef(new Map<number, (msg: ComputeResponse) => void>());

  useEffect(() => {
    // Next.js / webpack 5: new URL(..., import.meta.url) bundles the worker
    // automatically with all its imports from @finesse/shared.
    const worker = new Worker(
      new URL('../workers/chessEngine.worker.ts', import.meta.url),
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as ComputeResponse;
      if ((msg.type === 'LEGAL_MOVES' || msg.type === 'REPLAY_RESULT') && msg.requestId != null) {
        const resolve = pendingRef.current.get(msg.requestId);
        if (resolve) {
          pendingRef.current.delete(msg.requestId);
          resolve(msg);
        }
      }
    };

    const pending = pendingRef.current;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.clear();
    };
  }, []);

  const request = useCallback((payload: Record<string, unknown>): Promise<ComputeResponse> => {
    return new Promise((resolve) => {
      const requestId = nextIdRef.current++;
      pendingRef.current.set(requestId, resolve);
      workerRef.current?.postMessage({ ...payload, requestId });
    });
  }, []);

  /** All legal moves for the side to move in `state`, keyed by from-square. */
  const getLegalMoves = useCallback(async (state: ChessGameState): Promise<Map<Position, Position[]>> => {
    const msg = await request({ type: 'GET_LEGAL_MOVES', state });
    return new Map(msg.legalMoves ?? []);
  }, [request]);

  /** Timeline of states from the starting position through `moves` (stops at the first invalid move). */
  const replayMoves = useCallback(async (moves: ReplayableMove[]): Promise<ChessGameState[]> => {
    const msg = await request({ type: 'REPLAY_MOVES', moves });
    return msg.timeline ?? [];
  }, [request]);

  return { getLegalMoves, replayMoves };
}
