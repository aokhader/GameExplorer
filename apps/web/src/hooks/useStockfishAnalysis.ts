import { useEffect, useRef, useState, useCallback } from 'react';
import type { PieceType } from '@gameexplorer/shared';

const UCI_PROMOTION_MAP: Record<string, PieceType> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
};

/**
 * Progressive deepening: each position gets a quick first pass so the eval
 * appears fast, then automatically re-searches deeper while the user stays on
 * the position. Because the search keeps its transposition table between
 * passes (and between positions of the same game), each deeper pass resumes
 * from the previous one rather than starting over.
 */
const DEEPEN_MOVETIMES_MS = [300, 1000, 2500];

/** Coalesce rapid position changes (holding an arrow key) into one search. */
const DEBOUNCE_MS = 150;

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

const EMPTY_RESULT: AnalysisResult = { cp: null, mate: null, bestMove: null, pv: [], depth: 0 };

export function useStockfishAnalysis() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  // Ref copy so analyze/stop callbacks never have a stale closure.
  const isReadyRef = useRef(false);

  const [result, setResult] = useState<AnalysisResult>(EMPTY_RESULT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // FEN currently running inside the engine worker.
  const currentFenRef = useRef<string | null>(null);
  // FEN most recently requested by the caller.
  // When the engine finishes its current search, it starts this one (if different).
  const pendingFenRef = useRef<string | null>(null);
  // Index into DEEPEN_MOVETIMES_MS for the search currently running.
  const passIndexRef = useRef(0);
  // True while a `go movetime` is active in the worker.
  const isRunningRef = useRef(false);
  // Debounce timer between an analyze() call and the search actually starting.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Internal helper — created inside useEffect so it can close over `worker`.
  const doAnalyzeRef = useRef<(fen: string, pass: number) => void>(() => {});

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
    // Short passes + deepening keep the longest uninterruptible window small.
    //
    // No `ucinewgame` here: successive positions of the same game share most of
    // the search tree, so keeping the hash table makes each search much faster.
    // Callers post `ucinewgame` via newGame() when they load a different game.
    const doAnalyze = (fen: string, pass: number) => {
      isRunningRef.current = true;
      currentFenRef.current = fen;
      passIndexRef.current = pass;
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go movetime ${DEEPEN_MOVETIMES_MS[pass]}`);
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

        const pending = pendingFenRef.current;
        if (pending !== null && pending !== currentFenRef.current) {
          // A newer position was requested while busy — start it fresh.
          doAnalyze(pending, 0);
        } else if (pending !== null && passIndexRef.current < DEEPEN_MOVETIMES_MS.length - 1) {
          // User is still on this position — deepen the search.
          // The result is left in place; deeper info lines refine it.
          doAnalyze(currentFenRef.current!, passIndexRef.current + 1);
        } else {
          setIsAnalyzing(false);
        }
      }
    };

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      isRunningRef.current = false;
      isReadyRef.current = false;
      doAnalyzeRef.current = () => {};
      worker.terminate();
    };
  }, []);

  /**
   * Start (or queue) analysis of the given FEN.
   * Rapid calls are debounced; if the engine is busy, the newest position is
   * queued and starts once the current pass finishes (at most the shortest
   * movetime pass away).
   */
  const analyze = useCallback((fen: string) => {
    if (!workerRef.current || !isReadyRef.current) return;

    pendingFenRef.current = fen;

    if (isRunningRef.current) {
      if (fen !== currentFenRef.current) {
        // Engine is busy on a different position — clear the display so the
        // user sees "Analyzing…" rather than stale results while they wait.
        setIsAnalyzing(true);
        setResult(EMPTY_RESULT);
      }
      // The bestmove handler starts the pending FEN when the current pass ends.
      return;
    }

    // Engine idle — debounce so holding an arrow key coalesces into one search.
    setIsAnalyzing(true);
    setResult(EMPTY_RESULT);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const p = pendingFenRef.current;
      if (p !== null && !isRunningRef.current && isReadyRef.current) {
        doAnalyzeRef.current(p, 0);
      }
    }, DEBOUNCE_MS);
  }, []);

  /**
   * Cancel any pending analysis.
   * The current `go movetime` cannot be interrupted (single-threaded WASM), but
   * no new search or deepening pass will be started after it finishes.
   */
  const stop = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingFenRef.current = null;
    setIsAnalyzing(false);
  }, []);

  /**
   * Tell the engine a different game is being analyzed, clearing its hash
   * table so evals from the previous game can't bleed into this one.
   */
  const newGame = useCallback(() => {
    if (isReadyRef.current) workerRef.current?.postMessage('ucinewgame');
  }, []);

  return { isReady, result, isAnalyzing, analyze, stop, newGame };
}
