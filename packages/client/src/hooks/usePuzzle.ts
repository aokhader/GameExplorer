// Drives one puzzle: load it, own the beat before the opponent's scripted
// reply, and write progress exactly once when it is solved.
//
// Deliberately thin. Every *decision* — is this move right, is the line over,
// does this solve count as clean — lives in the shared reducer, which is
// unit-tested; this hook only sequences those calls and holds the result in
// state. That split is what lets web and React Native share it, and it is why
// there is nothing here worth a jsdom test (this package has no DOM harness).
//
// The progress store is injected rather than read from storage directly: the
// import-boundary test forbids DOM globals in this package, and the same
// constraint is what makes a server-backed store a drop-in later.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_PROGRESS,
  applyOpponentReply,
  applyPlayerMove,
  clearGame,
  hintFor,
  markHintUsed,
  puzzleRulesFor,
  recordSeen,
  recordSolved,
  retryPuzzle,
  solvedCount,
  startPuzzle,
} from '@gameexplorer/shared';
import type {
  Puzzle,
  PuzzleGame,
  PuzzleMove,
  PuzzlePhase,
  PuzzleProgress,
  PuzzleProgressStore,
  PuzzleRun,
  PuzzleSource,
} from '@gameexplorer/shared';

/** Long enough to read as a reply, short enough not to feel like waiting. */
const DEFAULT_REPLY_DELAY_MS = 450;

export interface UsePuzzleOptions {
  game: PuzzleGame;
  source: PuzzleSource;
  progress: PuzzleProgressStore;
  /** Pin a specific puzzle instead of taking the next unsolved one. */
  puzzleId?: string;
  replyDelayMs?: number;
}

export interface UsePuzzleResult<S> {
  puzzle: Puzzle | null;
  run: PuzzleRun<S> | null;
  phase: PuzzlePhase | null;
  loading: boolean;
  error: string | null;
  /** True when this game has no unsolved puzzles left. */
  exhausted: boolean;
  progress: PuzzleProgress;
  solved: number;
  total: number;
  /** The hint move, once asked for. Cleared on every step and retry. */
  hint: PuzzleMove | null;
  playMove: (move: PuzzleMove) => void;
  retry: () => void;
  next: () => void;
  showHint: () => void;
  /** Forget this game's solves and start the set again. */
  startOver: () => void;
}

export function usePuzzle<S>({
  game,
  source,
  progress: store,
  puzzleId,
  replyDelayMs = DEFAULT_REPLY_DELAY_MS,
}: UsePuzzleOptions): UsePuzzleResult<S> {
  const rules = puzzleRulesFor<S>(game);

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [run, setRun] = useState<PuzzleRun<S> | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress>(EMPTY_PROGRESS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [hint, setHint] = useState<PuzzleMove | null>(null);

  // Bumped to ask for a fresh puzzle without changing any other input.
  const [loadToken, setLoadToken] = useState(0);

  // Ids solved so far, read by the loader without making it depend on
  // `progress` — otherwise recording a solve would immediately load the next
  // puzzle out from under the player.
  const solvedRef = useRef<string[]>([]);
  // The puzzle whose solve has already been written, so a re-render or a
  // double-fired effect cannot bank it twice.
  const recordedRef = useRef<string | null>(null);

  // -- load ----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setHint(null);

    (async () => {
      try {
        const [stored, count] = await Promise.all([store.load(), source.countPuzzles(game)]);
        if (cancelled) return;

        solvedRef.current = stored.solved;
        setProgress(stored);
        setTotal(count);

        const found = puzzleId
          ? await source.getPuzzle(puzzleId)
          : await source.nextPuzzle(game, { solvedIds: stored.solved });
        if (cancelled) return;

        if (!found) {
          setPuzzle(null);
          setRun(null);
          setExhausted(true);
          return;
        }

        recordedRef.current = null;
        setExhausted(false);
        setPuzzle(found);
        setRun(startPuzzle<S>(found, rules));

        const seen = recordSeen(stored, game, found.id);
        if (seen !== stored) {
          setProgress(seen);
          await store.save(seen);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load a puzzle.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `rules` is derived from `game` and `store`/`source` are module-level
    // singletons in practice; keeping them out avoids a reload per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, puzzleId, loadToken]);

  // -- the opponent's beat ---------------------------------------------------
  useEffect(() => {
    if (run?.phase !== 'replying') return;

    const timer = setTimeout(() => {
      setRun((current) => (current ? applyOpponentReply(current, rules) : current));
    }, replyDelayMs);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.phase, run?.stepIndex, replyDelayMs]);

  // -- bank the solve --------------------------------------------------------
  useEffect(() => {
    if (run?.phase !== 'solved' || !puzzle) return;
    if (recordedRef.current === puzzle.id) return;
    recordedRef.current = puzzle.id;

    const next = recordSolved(progress, puzzle.id, run.clean);
    solvedRef.current = next.solved;
    setProgress(next);
    void store.save(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.phase, puzzle?.id]);

  // -- actions ---------------------------------------------------------------
  const playMove = useCallback(
    (move: PuzzleMove) => {
      setRun((current) => {
        if (!current) return current;
        const { run: next } = applyPlayerMove(current, rules, move);
        return next;
      });
      setHint(null);
    },
    [rules],
  );

  const retry = useCallback(() => {
    setRun((current) => (current ? retryPuzzle(current, rules) : current));
    setHint(null);
  }, [rules]);

  const next = useCallback(() => {
    setLoadToken((n) => n + 1);
  }, []);

  // Both of these read state rather than using an updater callback: a state
  // updater must stay pure, and React runs it twice under StrictMode — so a
  // `save()` or a `setHint()` smuggled inside one would fire twice.
  const showHint = useCallback(() => {
    if (!run) return;
    setHint(hintFor(run, rules));
    setRun(markHintUsed(run));
  }, [run, rules]);

  const startOver = useCallback(() => {
    const cleared = clearGame(progress, game);
    solvedRef.current = cleared.solved;
    setProgress(cleared);
    void store.save(cleared);
    setLoadToken((n) => n + 1);
  }, [progress, game, store]);

  return {
    puzzle,
    run,
    phase: run?.phase ?? null,
    loading,
    error,
    exhausted,
    progress,
    solved: solvedCount(progress, game),
    total,
    hint,
    playMove,
    retry,
    next,
    showHint,
    startOver,
  };
}
