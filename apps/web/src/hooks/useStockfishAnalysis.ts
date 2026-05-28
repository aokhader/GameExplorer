import { useEffect, useRef, useState, useCallback } from 'react';
import type { PieceType } from '@gameexplorer/shared';

const UCI_PROMOTION_MAP: Record<string, PieceType> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
};

export interface AnalysisResult {
  /** Centipawns from the perspective of the side to move (positive = side to move is winning) */
  cp: number | null;
  /** Mate in N from the perspective of the side to move (positive = side to move wins) */
  mate: number | null;
  bestMove: { from: string; to: string; promotion?: PieceType } | null;
  /** Principal variation as UCI move strings */
  pv: string[];
  depth: number;
}

export function useStockfishAnalysis() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [result, setResult] = useState<AnalysisResult>({
    cp: null, mate: null, bestMove: null, pv: [], depth: 0,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Generation counter: incremented each time analyze() sends a new `go infinite`.
  // The bestmove handler uses it to distinguish "stop-to-restart" (ignore) from
  // "analysis truly finished" (clear isAnalyzing).
  const generationRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const worker = new Worker('/stockfish/stockfish.js');
    workerRef.current = worker;
    worker.postMessage('uci');

    worker.onmessage = (e) => {
      const message = typeof e.data === 'string' ? e.data : (e.data as { data?: string })?.data;
      if (typeof message !== 'string') return;

      if (message === 'uciok') {
        worker.postMessage('isready');
      }
      if (message === 'readyok') {
        setIsReady(true);
      }

      if (message.startsWith('info') && message.includes('score')) {
        const depthMatch = message.match(/\bdepth (\d+)/);
        const cpMatch = message.match(/score cp (-?\d+)/);
        const mateMatch = message.match(/score mate (-?\d+)/);
        const pvMatch = message.match(/ pv (.+)/);

        const depth = depthMatch ? parseInt(depthMatch[1]) : 0;
        const cp = cpMatch ? parseInt(cpMatch[1]) : null;
        const mate = mateMatch ? parseInt(mateMatch[1]) : null;
        const pvMoves = pvMatch ? pvMatch[1].trim().split(' ').filter(Boolean) : [];

        let bestMove: AnalysisResult['bestMove'] = null;
        const moveStr = pvMoves[0];
        if (moveStr && moveStr.length >= 4) {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotionChar = moveStr.length === 5 ? moveStr[4] : undefined;
          bestMove = { from, to, promotion: promotionChar ? UCI_PROMOTION_MAP[promotionChar] : undefined };
        }

        setResult({ cp, mate, bestMove, pv: pvMoves, depth });
      }

      if (message.startsWith('bestmove')) {
        // Only mark analysis as done if this bestmove belongs to the current generation
        // (i.e., was not sent by a stop-to-restart in analyze()).
        const gen = generationRef.current;
        if (gen === 0) {
          // Stopped intentionally via stop() — clear state
          setIsAnalyzing(false);
        }
        // If gen > 0, this bestmove is the echo from our most recent stop-before-restart;
        // decrement and let the running go-infinite keep isAnalyzing = true.
        if (gen > 0) {
          generationRef.current = gen - 1;
        }
      }
    };

    return () => worker.terminate();
  }, []);

  const analyze = useCallback((fen: string) => {
    if (!workerRef.current || !isReady) return;
    // Increment generation so the upcoming bestmove (echo of stop) is ignored
    generationRef.current += 1;
    setIsAnalyzing(true);
    setResult({ cp: null, mate: null, bestMove: null, pv: [], depth: 0 });
    workerRef.current.postMessage('stop');
    workerRef.current.postMessage('ucinewgame');
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage('go infinite');
  }, [isReady]);

  const stop = useCallback(() => {
    // generation stays at 0 so the bestmove echo clears isAnalyzing
    workerRef.current?.postMessage('stop');
    setIsAnalyzing(false);
  }, []);

  return { isReady, result, isAnalyzing, analyze, stop };
}
