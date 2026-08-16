'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChessAnalysis,
  stateToFen,
  type AnalysisAdapter,
  type ChessGameState,
} from '@gameexplorer/shared';
import { createChessEvaluator, type ChessEvaluator } from '@/lib/analysis/stockfishEvaluator';

/**
 * Engine time per position. Both are longer than mobile's (250/600), because
 * this is Stockfish WASM rather than native Arasan and the same milliseconds buy
 * a shallower search — and a grade derived from too shallow a search is worse
 * than no grade, since it is shown to the player as a verdict on their move.
 *
 * The scan budget is still the one that has to stay on a leash: a 60-move game
 * is 60 sequential searches, so every extra 100ms is six seconds of waiting.
 */
const SCAN_BUDGET_MS = 300;
const LIVE_BUDGET_MS = 1500;

/**
 * The chess review adapter for web. Owns the Stockfish worker's lifetime: it is
 * created the first time review is opened (never on a page that only plays) and
 * terminated on unmount.
 */
export function useChessReviewAdapter(enabled: boolean): {
  adapter: AnalysisAdapter<ChessGameState>;
  /** The engine has finished its UCI handshake and will accept a search. */
  ready: boolean;
} {
  const evaluatorRef = useRef<ChessEvaluator | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled || evaluatorRef.current) return;
    if (typeof window === 'undefined') return;

    const evaluator = createChessEvaluator();
    evaluatorRef.current = evaluator;

    let cancelled = false;
    evaluator.ready.then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      evaluator.dispose();
      evaluatorRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  /**
   * Always a real adapter, never null. Only `evaluate` needs the worker — the
   * rest (last move, side to move, score formatting, the grade bands) is pure,
   * and the analysis loop reads those on every render regardless of whether
   * review is open. Handing it a null would crash the page that merely *has* a
   * review button.
   */
  const adapter = useMemo(
    () =>
      createChessAnalysis(
        // `createChessAnalysis` short-circuits finished positions before this
        // runs, so the engine is never asked to score a mate it cannot report on.
        (state, budgetMs) => {
          const evaluator = evaluatorRef.current;
          if (!evaluator) return Promise.reject(new Error('Engine not ready'));
          return evaluator.evaluate(stateToFen(state), budgetMs);
        },
        { scanBudgetMs: SCAN_BUDGET_MS, liveBudgetMs: LIVE_BUDGET_MS },
      ),
    [],
  );

  return { adapter, ready };
}
