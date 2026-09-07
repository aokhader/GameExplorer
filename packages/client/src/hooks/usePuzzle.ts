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
  BOARD_ANIM_MS,
  EMPTY_PROGRESS,
  PUZZLE_BANDS,
  applyOpponentReply,
  applyPlayerMove,
  applyRefutation,
  bandById,
  clearPuzzles,
  describeRefutation,
  displayState,
  hintFor,
  isAtLive,
  markHintUsed,
  puzzleRulesFor,
  recordBand,
  recordSeen,
  recordSolved,
  retryPuzzle,
  seekPuzzle,
  solvedAmong,
  startPuzzle,
} from '@gameexplorer/shared';
import type {
  Puzzle,
  PuzzleBand,
  PuzzleGame,
  PuzzleMove,
  PuzzlePhase,
  PuzzleProgress,
  PuzzleProgressStore,
  PuzzleRefutation,
  PuzzleRun,
  PuzzleSource,
} from '@gameexplorer/shared';

/**
 * Beat before the opponent's scripted reply.
 *
 * Derived from the piece animation rather than picked independently, so the
 * reply lands just after the player's move finishes travelling instead of
 * stepping on it. Lichess times theirs the same way — `animation.duration`
 * times 1 to 1.5 — and lands in the same 200-300ms range.
 */
const DEFAULT_REPLY_DELAY_MS = Math.round(BOARD_ANIM_MS * 1.3);

/**
 * Gap between "Not quite" and the refutation search.
 *
 * One frame, near enough. `applyRefutation` runs a synchronous minimax that
 * blocks the thread — a few milliseconds for checkers and reversi but tens for
 * chess — so the feedback has to be painted before it starts, or the board
 * appears to hang on the player's mistake.
 *
 * It now has cover as well as a head start: the wrong move is animating across
 * the board while the search runs, and worst-case chess (~103ms at depth 4)
 * finishes well inside that window. On mobile the animation runs on the UI
 * thread, so a blocked JS thread underneath it is invisible rather than merely
 * disguised.
 */
const REFUTATION_DELAY_MS = 60;

export interface UsePuzzleOptions {
  game: PuzzleGame;
  source: PuzzleSource;
  progress: PuzzleProgressStore;
  /** Pin a specific puzzle instead of taking the next unsolved one. */
  puzzleId?: string;
  /**
   * Band to open on when the player has no saved choice for this game.
   *
   * Passed in by the platform rather than resolved here, and that is
   * load-bearing: the natural default is the player's own rating, which lives
   * behind `getUserRating` in `@gameexplorer/db` — a module that builds a
   * Supabase client at import time. Both `PuzzleScreen`s deep-import this hook
   * precisely to keep that client (and socket.io behind it) off the puzzle
   * chunk, so reading a rating here would undo the thing the deep import buys.
   */
  defaultBand?: string;
  replyDelayMs?: number;
}

export interface UsePuzzleResult<S> {
  puzzle: Puzzle | null;
  run: PuzzleRun<S> | null;
  phase: PuzzlePhase | null;
  /** True only when there is nothing on screen yet. Never true for a Next. */
  loading: boolean;
  /**
   * True while a *replacement* puzzle is being fetched with one still painted.
   * Consumers should keep drawing the old board and make it inert, not blank it.
   */
  swapping: boolean;
  error: string | null;
  /** True when this game has no unsolved puzzles left **in the current band**. */
  exhausted: boolean;
  progress: PuzzleProgress;
  solved: number;
  /** Puzzles in the current band, not in the whole game. */
  total: number;
  /** The band being served. */
  band: PuzzleBand;
  /** How many puzzles each band holds, for the picker. */
  bandCounts: Record<string, number>;
  /** How many of each band the player has solved, for the picker. */
  bandSolved: Record<string, number>;
  /** Switch band. Persists the choice and loads a puzzle from the new one. */
  setBand: (id: string) => void;
  /** The hint move, once asked for. Cleared on every step and retry. */
  hint: PuzzleMove | null;
  /** The position to draw — history or refutation branch, not always the live one. */
  board: S | null;
  viewIndex: number;
  /** How many positions the board can step through. */
  timelineLength: number;
  /** False while the player is looking back through the line. */
  atLive: boolean;
  /** Why the last move failed, once the search has run. Null while it is running. */
  refutation: PuzzleRefutation | null;
  /** That same finding as one sentence, shared with the other platform. */
  refutationText: string | null;
  playMove: (move: PuzzleMove) => void;
  seek: (index: number) => void;
  retry: () => void;
  next: () => void;
  showHint: () => void;
  /** Forget the current band's solves and start that band again. */
  startOver: () => void;
}

export function usePuzzle<S>({
  game,
  source,
  progress: store,
  puzzleId,
  defaultBand,
  replyDelayMs = DEFAULT_REPLY_DELAY_MS,
}: UsePuzzleOptions): UsePuzzleResult<S> {
  const rules = puzzleRulesFor<S>(game);

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [run, setRun] = useState<PuzzleRun<S> | null>(null);
  const [progress, setProgress] = useState<PuzzleProgress>(EMPTY_PROGRESS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [hint, setHint] = useState<PuzzleMove | null>(null);
  const [bandCounts, setBandCounts] = useState<Record<string, number>>({});
  // Ids per band, so "solved" can be scoped to the set the player is working
  // through and "start over" can clear just that set.
  const [bandIds, setBandIds] = useState<Record<string, string[]>>({});

  // Null until the stored choice has been read, so the first load does not
  // fetch from the default band and then immediately refetch from the saved
  // one. `activeBand` resolves it for everything that needs a value now.
  const [band, setBandState] = useState<string | null>(null);
  const activeBand =
    band ?? defaultBand ?? PUZZLE_BANDS[game][Math.floor(PUZZLE_BANDS[game].length / 2) - 1].id;

  // Bumped to ask for a fresh puzzle without changing any other input.
  const [loadToken, setLoadToken] = useState(0);

  // Ids solved so far, read by the loader without making it depend on
  // `progress` — otherwise recording a solve would immediately load the next
  // puzzle out from under the player.
  const solvedRef = useRef<string[]>([]);
  // The puzzle whose solve has already been written, so a re-render or a
  // double-fired effect cannot bank it twice.
  const recordedRef = useRef<string | null>(null);
  // The game the player last picked a band for by hand, so neither the store
  // nor a late-arriving `defaultBand` may move it. Holds the game rather than a
  // boolean so switching games still resolves a fresh band for the new one.
  const bandChosenRef = useRef<PuzzleGame | null>(null);

  // What is currently painted. A `loadToken` bump asks for a different puzzle
  // in the SAME set, which is the Next button; changing game or pinning an id
  // is a different set and has nothing worth keeping on screen.
  // Switching band is a different SET, not a Next within one: the right
  // treatment is to blank and reload, not to keep the old board up and make it
  // inert. Putting the band in the key is what makes that fall out of the
  // existing `replacing` test rather than needing a second branch.
  const paintedKeyRef = useRef<string | null>(null);
  const loadKey = `${game}:${puzzleId ?? ''}:${activeBand}`;

  // -- resolve the band before anything is fetched ---------------------------
  //
  // Its own effect, and it has to be. The band the player last chose lives in
  // the progress store, so it is not known synchronously — and if the main load
  // below ran first it would fetch from the default band, resolve the saved
  // one, and fetch again. Free over an in-memory table and a wasted round trip
  // over a fetched corpus.
  useEffect(() => {
    // Once the player has picked, nothing may move the band under them — not a
    // stored value, and not a `defaultBand` that arrives late.
    if (bandChosenRef.current === game) return;

    let cancelled = false;
    void (async () => {
      const stored = await store.load();
      if (cancelled || bandChosenRef.current === game) return;
      const saved = stored.bands?.[game];
      setBandState(saved && bandById(game, saved) ? saved : activeBand);
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on `defaultBand` as well as `game`, because the platform's default
    // is the player's own rating and that arrives from the database a tick or
    // two after first paint. Without it a signed-in player with no saved band
    // would be given the middle band — the guest default — and the mode would
    // quietly stop answering "what does MY rating look like". A saved band
    // still wins, and `bandChosenRef` keeps a deliberate choice safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, defaultBand]);

  // -- load ----------------------------------------------------------------
  useEffect(() => {
    // Nothing to fetch until the band is known — see above.
    if (band === null) return;

    let cancelled = false;

    // Blank the screen only when there is nothing on it. Puzzle data is an
    // in-memory array; showing a skeleton over a board the player is already
    // looking at, for the time it takes to scan 42 rows, was the single most
    // conspicuous stall in the mode.
    const replacing = paintedKeyRef.current === loadKey;
    if (replacing) setSwapping(true);
    else setLoading(true);
    setError(null);
    setHint(null);

    (async () => {
      try {
        const [stored, counts, ids] = await Promise.all([
          store.load(),
          source.countByBand(game),
          source.idsByBand(game),
        ]);
        if (cancelled) return;

        solvedRef.current = stored.solved;
        setProgress(stored);
        setBandCounts(counts);
        setBandIds(ids);

        // `total` is the band's size, because that is the set the player is
        // working through — "12 of 60" against a whole-game count would be a
        // progress bar that never fills.
        setTotal(counts[band] ?? 0);

        const found = puzzleId
          ? await source.getPuzzle(puzzleId)
          : await source.nextPuzzle(game, { solvedIds: stored.solved, band });
        if (cancelled) return;

        if (!found) {
          paintedKeyRef.current = null;
          setPuzzle(null);
          setRun(null);
          setExhausted(true);
          return;
        }

        recordedRef.current = null;
        paintedKeyRef.current = loadKey;
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
        if (!cancelled) {
          setLoading(false);
          setSwapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `rules` is derived from `game` and `store`/`source` are module-level
    // singletons in practice; keeping them out avoids a reload per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, puzzleId, band, loadToken]);

  // -- the opponent's beat ---------------------------------------------------
  useEffect(() => {
    if (run?.phase !== 'replying') return;

    const timer = setTimeout(() => {
      setRun((current) => (current ? applyOpponentReply(current, rules) : current));
    }, replyDelayMs);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.phase, run?.stepIndex, replyDelayMs]);

  // -- why the wrong move fails ----------------------------------------------
  useEffect(() => {
    if (!run || run.phase !== 'wrong' || run.refutation !== null) return;

    const timer = setTimeout(() => {
      // Computed OUTSIDE the updater on purpose. A state updater must be pure
      // and React runs it twice under StrictMode — which for a search means
      // paying for it twice. The identity check is what makes the late write
      // safe if the player hit Retry while chess was thinking.
      const next = applyRefutation(run, rules);
      setRun((current) => (current === run ? next : current));
    }, REFUTATION_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

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

  const seek = useCallback((index: number) => {
    setRun((current) => (current ? seekPuzzle(current, index) : current));
  }, []);

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
    // Scoped to the band the player is looking at, not the whole game. Someone
    // who has worked through Club and then finishes Beginner would otherwise
    // lose Club too, to restart a set of two.
    const cleared = clearPuzzles(progress, bandIds[activeBand] ?? []);
    solvedRef.current = cleared.solved;
    setProgress(cleared);
    void store.save(cleared);
    setLoadToken((n) => n + 1);
  }, [progress, bandIds, activeBand, store]);

  const setBand = useCallback(
    (id: string) => {
      // Refuse an unknown id rather than serving an empty band. A stale URL or
      // a renamed band would otherwise land the player on "no puzzles here",
      // which reads as a broken mode rather than a bad link.
      if (!bandById(game, id) || id === activeBand) return;
      bandChosenRef.current = game;
      setBandState(id);
      const next = recordBand(progress, game, id);
      if (next !== progress) {
        setProgress(next);
        void store.save(next);
      }
    },
    [game, activeBand, progress, store],
  );

  return {
    puzzle,
    run,
    phase: run?.phase ?? null,
    loading,
    swapping,
    error,
    exhausted,
    progress,
    // Scoped to the band, matching `total`. Counting the whole game against a
    // band's size is what produced "3 / 1" for a player who had solved two
    // puzzles in one band and one in another.
    solved: solvedAmong(progress, bandIds[activeBand] ?? []),
    total,
    band: bandById(game, activeBand) ?? PUZZLE_BANDS[game][0],
    bandCounts,
    bandSolved: Object.fromEntries(
      Object.entries(bandIds).map(([id, ids]) => [id, solvedAmong(progress, ids)]),
    ),
    setBand,
    hint,
    board: run ? displayState(run) : null,
    viewIndex: run?.viewIndex ?? 0,
    timelineLength: run?.timeline.length ?? 0,
    atLive: run ? isAtLive(run) : true,
    refutation: run?.refutation ?? null,
    refutationText: run ? describeRefutation(run) : null,
    playMove,
    seek,
    retry,
    next,
    showHint,
    startOver,
  };
}
