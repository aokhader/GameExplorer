import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  gradeForLoss,
  type AnalysisAdapter,
  type Color,
  type MoveGrade,
  type PositionEval,
} from '@finesse/shared';

export interface UseGameAnalysisOptions<S> {
  adapter: AnalysisAdapter<S>;
  /** Every position of the game, `timeline[0]` being the start. */
  timeline: S[];
  /** Which position the board is showing. */
  viewIndex: number;
  /** Review is open. False keeps the engine idle. */
  enabled: boolean;
}

/** Per-move verdict, indexed by the move number (move `i` produced `timeline[i+1]`). */
export interface GradedMove {
  grade: MoveGrade;
  /** Score the mover gave away, in the game's own units. Never negative. */
  loss: number;
  /** What the engine would have played instead, when the move wasn't the best. */
  better: { from: string; to: string } | null;
}

export interface ScanProgress {
  done: number;
  total: number;
}

/**
 * Game review. Owns the per-position evaluations, the on-demand eval for
 * whatever the board is showing, and the full-game scan that grades every move.
 *
 * Two speeds on purpose: the position you're looking at is worth a slower, more
 * accurate search (`liveBudgetMs`), while a scan of a 60-move game has to stay
 * on a leash or you'd wait a minute for it. Scanned positions are kept, so
 * scrubbing after a scan is instant and never re-searches.
 *
 * DOM-free and RN-free by construction — the engine arrives as an adapter, so
 * the same loop drives native Arasan on mobile and Stockfish WASM on web.
 */
export function useGameAnalysis<S>({
  adapter,
  timeline,
  viewIndex,
  enabled,
}: UseGameAnalysisOptions<S>) {
  const [evals, setEvals] = useState<(PositionEval | null)[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  // Cancels an in-flight scan: bumped on stop, unmount, or a new game.
  const runIdRef = useRef(0);
  const evalsRef = useRef(evals);
  evalsRef.current = evals;
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  // A different game (or a new one) invalidates everything scored so far.
  useEffect(() => {
    runIdRef.current++;
    setEvals(new Array(timeline.length).fill(null));
    setProgress({ done: 0, total: 0 });
    setScanning(false);
    setError(null);
    // Length alone identifies the timeline here: review only ever opens on a
    // finished game, which never grows or rewrites underneath us.
  }, [timeline.length]);

  useEffect(() => {
    const runIds = runIdRef;
    return () => {
      // Nothing may resolve into a screen that's gone. (Captured above because
      // the lint rule can't tell a counter from a DOM node — the whole point is
      // to bump whatever the CURRENT id is at teardown.)
      runIds.current++;
    };
  }, []);

  const write = useCallback((index: number, value: PositionEval) => {
    setEvals((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // ── The position on screen ──────────────────────────────────────────────────
  // Scrubbing fast would otherwise queue a full-budget search per position
  // passed through; only the one you land on is worth searching.
  useEffect(() => {
    if (!enabled) return;
    const state = timeline[viewIndex];
    if (!state || evalsRef.current[viewIndex]) return;

    const runId = runIdRef.current;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLiveBusy(true);
      adapter
        .evaluate(state, adapter.liveBudgetMs)
        .then((result) => {
          if (cancelled || runId !== runIdRef.current) return;
          write(viewIndex, result);
        })
        .catch((err) => {
          if (cancelled || (err as Error)?.name === 'AbortError') return;
          setError((err as Error)?.message ?? 'Analysis failed');
        })
        .finally(() => {
          if (!cancelled) setLiveBusy(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Note the already-scored check reads `evalsRef`, not `evals`: writing a
    // result must not re-run this effect and cancel the search that produced it.
  }, [enabled, viewIndex, timeline, adapter, write]);

  // ── Full-game scan ──────────────────────────────────────────────────────────

  const stopScan = useCallback(() => {
    runIdRef.current++;
    setScanning(false);
  }, []);

  /**
   * Score every position, oldest first, so grades fill in from the opening down.
   * Sequential by necessity — the chess engine is a single UCI channel — and it
   * yields to the event loop between positions so the board stays scrollable
   * while the (synchronous) checkers/reversi searches run.
   */
  const scan = useCallback(async () => {
    const runId = ++runIdRef.current;
    const states = timelineRef.current;
    setScanning(true);
    setError(null);
    setProgress({ done: 0, total: states.length });

    try {
      for (let i = 0; i < states.length; i++) {
        if (runId !== runIdRef.current) return;

        if (!evalsRef.current[i]) {
          const result = await adapter.evaluate(states[i], adapter.scanBudgetMs);
          if (runId !== runIdRef.current) return;
          write(i, result);
        }
        setProgress({ done: i + 1, total: states.length });
        // Breathe, so a long scan doesn't freeze the UI thread.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (err) {
      if (runId !== runIdRef.current || (err as Error)?.name === 'AbortError') return;
      setError((err as Error)?.message ?? 'Analysis failed');
    } finally {
      if (runId === runIdRef.current) setScanning(false);
    }
  }, [adapter, write]);

  // ── Grades ──────────────────────────────────────────────────────────────────

  const grades = useMemo(() => {
    const out: (GradedMove | null)[] = [];
    for (let i = 0; i < timeline.length - 1; i++) {
      const before = evals[i];
      const after = evals[i + 1];
      const played = adapter.lastMove(timeline[i + 1]);
      if (!before || !after || !played) {
        out.push(null);
        continue;
      }

      // Both scores are White-positive, so Black's loss is the mirror of White's.
      const moverIsWhite = adapter.currentTurn(timeline[i]) === 'white';
      const loss = Math.max(0, moverIsWhite ? before.score - after.score : after.score - before.score);
      const best = before.bestMove;
      const matched = !!best && best.from === played.from && best.to === played.to;

      out.push({
        grade: gradeForLoss(loss, adapter.thresholds, matched),
        loss,
        better: matched || !best ? null : { from: best.from, to: best.to },
      });
    }
    return out;
  }, [evals, timeline, adapter]);

  /** Counts per grade for the side the player was on, plus both sides' totals. */
  const summary = useMemo(() => {
    const empty = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    const byColor: Record<Color, typeof empty> = {
      white: { ...empty },
      black: { ...empty },
    };
    grades.forEach((g, i) => {
      if (!g) return;
      byColor[adapter.currentTurn(timeline[i])][g.grade]++;
    });
    return byColor;
  }, [grades, timeline, adapter]);

  const graded = grades.filter(Boolean).length;
  const complete = timeline.length > 1 && graded === timeline.length - 1;

  return {
    evals,
    /** Evaluation of the position on screen, or null until it's been searched. */
    current: evals[viewIndex] ?? null,
    grades,
    summary,
    scan,
    stopScan,
    scanning,
    progress,
    /** Every move has a grade — the scan finished (or was never needed). */
    complete,
    liveBusy,
    error,
  };
}
