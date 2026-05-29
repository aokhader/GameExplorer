import { useEffect, useRef, useState, useCallback } from 'react';
import type { PieceType } from '@gameexplorer/shared';

const UCI_PROMOTION_MAP: Record<string, PieceType> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
};

/** milliseconds the engine searches per position */
const MOVETIME_MS = 2000;

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
  // Ref copy so analyze/stop callbacks never have a stale closure.
  const isReadyRef = useRef(false);

  const [result, setResult] = useState<AnalysisResult>({
    cp: null, mate: null, bestMove: null, pv: [], depth: 0,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // FEN currently running inside the engine worker.
  const currentFenRef = useRef<string | null>(null);
  // FEN most recently requested by the caller.
  // When the engine finishes its current search, it starts this one (if different).
  const pendingFenRef = useRef<string | null>(null);
  // True while a `go movetime` is active in the worker.
  const isRunningRef = useRef(false);
  // Internal helper — created inside useEffect so it can close over `worker`.
  const doAnalyzeRef = useRef<(fen: string) => void>(() => {});

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const worker = new Worker('/stockfish/stockfish.js');
    workerRef.current = worker;

    // ── Why go movetime instead of go infinite ────────────────────────────────
    // This Stockfish WASM build (nmrugg/stockfish.js) runs `go` synchronously
    // because IS_ASYNCIFY is not defined.  While the engine is searching the
    // web-worker thread is blocked, so a queued `stop` command is never processed
    // and `go infinite` runs forever.  `go movetime N` terminates after N ms
    // from inside the C++ search loop, unblocking the thread automatically.
    const doAnalyze = (fen: string) => {
      isRunningRef.current = true;
      currentFenRef.current = fen;
      worker.postMessage('ucinewgame');
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go movetime ${MOVETIME_MS}`);
    };
    doAnalyzeRef.current = doAnalyze;

    worker.postMessage('uci');

    worker.onmessage = (e) => {
      const message = typeof e.data === 'string' ? e.data : (e.data as { data?: string })?.data;
      if (typeof message !== 'string') return;

      if (message === 'uciok') {
        worker.postMessage('isready');
      }

      if (message === 'readyok') {
        isReadyRef.current = true;
        setIsReady(true);
      }

      if (message.startsWith('info') && message.includes('score')) {
        // Drop info that belongs to a stale analysis (a newer FEN was requested).
        if (pendingFenRef.current !== null && currentFenRef.current !== pendingFenRef.current) {
          return;
        }

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
        isRunningRef.current = false;

        // Capture the final best move reported by the engine.
        const moveStr = message.split(' ')[1];
        if (
          moveStr && moveStr !== '(none)' && moveStr.length >= 4 &&
          // Only apply if this bestmove is still for the current analysis.
          (pendingFenRef.current === null || currentFenRef.current === pendingFenRef.current)
        ) {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotionChar = moveStr.length === 5 ? moveStr[4] : undefined;
          setResult(prev => ({
            ...prev,
            bestMove: { from, to, promotion: promotionChar ? UCI_PROMOTION_MAP[promotionChar] : undefined },
          }));
        }

        // Start the next analysis if a newer position was requested while busy.
        const pending = pendingFenRef.current;
        if (pending !== null && pending !== currentFenRef.current) {
          doAnalyze(pending);
        } else {
          setIsAnalyzing(false);
        }
      }
    };

    return () => {
      isRunningRef.current = false;
      isReadyRef.current = false;
      doAnalyzeRef.current = () => {};
      worker.terminate();
    };
  }, []);

  /**
   * Start (or queue) analysis of the given FEN.
   * If the engine is currently busy, the new position is queued and starts
   * automatically once the current `go movetime` finishes (at most MOVETIME_MS ms).
   */
  const analyze = useCallback((fen: string) => {
    if (!workerRef.current || !isReadyRef.current) return;

    pendingFenRef.current = fen;

    if (!isRunningRef.current) {
      // Engine is idle — start immediately.
      setIsAnalyzing(true);
      setResult({ cp: null, mate: null, bestMove: null, pv: [], depth: 0 });
      doAnalyzeRef.current(fen);
    } else if (fen !== currentFenRef.current) {
      // Engine is busy on a different position — clear the display so the
      // user sees "Analyzing…" rather than stale results while they wait.
      setIsAnalyzing(true);
      setResult({ cp: null, mate: null, bestMove: null, pv: [], depth: 0 });
    }
    // If engine is already on this exact FEN, leave the display as-is.
  }, []);

  /**
   * Cancel any pending analysis.
   * The current `go movetime` cannot be interrupted (single-threaded WASM), but
   * no new search will be started after it finishes.
   */
  const stop = useCallback(() => {
    pendingFenRef.current = null;
    setIsAnalyzing(false);
  }, []);

  return { isReady, result, isAnalyzing, analyze, stop };
}
