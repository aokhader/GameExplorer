'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import {
  puzzleRulesFor,
  startPuzzle,
  type ChessGameState,
  type PieceType,
  type Position,
  type Puzzle,
  type PuzzleGame,
  type PuzzleProgressStore,
  type PuzzleSource,
} from '@gameexplorer/shared';
import { usePuzzle } from '@gameexplorer/client/hooks/usePuzzle';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { webPuzzleProgressStore } from '@/lib/puzzleProgress';

/**
 * Today's puzzle, as a board a stranger can solve on the landing page
 * (`project-docs/ux-fix-ideas.md` §4.2) — the product where a feature grid used
 * to describe it.
 *
 * The puzzle is picked on the server, by date, from the hand-written set (each
 * of those explains its answer), and handed down whole, so this page carries
 * one puzzle rather than the bundled corpus. Puzzles need no engine and are
 * proved, so the landing page costs no engine download. The server renders the
 * position, and the board takes moves once it hydrates.
 *
 * A solve counts: it is added to the progress the puzzle screen keeps, and
 * nothing else is written (`dailyProgressStore`).
 */
export function DailyPuzzle({ puzzle }: { puzzle: Puzzle }) {
  const source = useMemo(() => singlePuzzleSource(puzzle), [puzzle]);
  const { run, phase, board, hint, refutation, refutationText, playMove, retry, showHint } =
    usePuzzle<ChessGameState>({
      game: 'chess',
      source,
      progress: dailyProgressStore,
      puzzleId: puzzle.id,
    });

  const onMove = useCallback(
    (from: Position, to: Position, promotion?: PieceType) => playMove({ from, to, promotion }),
    [playMove],
  );

  // The hook loads its run in an effect, which never happens on the server. The
  // start position is worked out here as well, so the server's HTML and the first
  // paint are the real board rather than an empty square.
  const start = useMemo(
    () => startPuzzle(puzzle, puzzleRulesFor<ChessGameState>('chess')).state,
    [puzzle],
  );
  const state = board ?? run?.state ?? start;

  const arrows = [
    ...(refutation?.reply ? [{ from: refutation.reply.from, to: refutation.reply.to, color: REFUTATION_COLOR }] : []),
    ...(hint ? [{ from: hint.from, to: hint.to, color: HINT_COLOR }] : []),
  ];

  const status =
    phase === 'solved'
      ? 'Solved.'
      : phase === 'wrong'
        ? (refutationText ?? 'Not quite — looking at the reply…')
        : phase === 'replying'
          ? 'Right. Watch the reply…'
          : puzzle.prompt;

  return (
    <section
      aria-labelledby="daily-puzzle-heading"
      className="rounded-2xl border border-border bg-surface-alt p-4"
      data-puzzle-id={puzzle.id}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="daily-puzzle-heading" className="text-lg font-semibold text-fg">
          Today’s puzzle
        </h2>
        <span className="text-sm text-fg-muted">
          {puzzle.playerColor === 'white' ? 'White' : 'Black'} to move
        </span>
      </div>

      <div className="mt-3">
        <ChessBoard
          gameState={state}
          playerColor={puzzle.playerColor}
          arrows={arrows}
          interactive={phase === 'playing'}
          onMove={onMove}
          compact
        />
      </div>

      <p role="status" className="mt-3 min-h-11 text-sm text-fg" data-testid="daily-puzzle-status">
        {status}
      </p>
      {phase === 'solved' && puzzle.explanation && (
        <p className="text-sm text-fg-muted">{puzzle.explanation}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {phase === 'wrong' && (
          <button
            type="button"
            onClick={retry}
            className="touch-target min-h-10 rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg motion-control motion-safe:active:scale-[0.98] hover:bg-surface-muted"
          >
            Try again
          </button>
        )}
        {phase === 'playing' && !hint && (
          <button
            type="button"
            onClick={showHint}
            className="touch-target min-h-10 rounded-lg px-3 text-sm font-medium text-fg-muted motion-control motion-safe:active:scale-[0.98] hover:bg-surface-muted hover:text-fg"
          >
            Show a hint
          </button>
        )}
        <Link
          href="/chess/puzzles"
          className="touch-target ml-auto inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-fg-muted motion-control motion-safe:active:scale-[0.98] hover:bg-surface-muted hover:text-fg"
        >
          More puzzles
        </Link>
      </div>
    </section>
  );
}

/** Amber and red, as the puzzle screen draws a hint and a refutation. */
const HINT_COLOR = 'rgba(251, 191, 36, 0.9)';
const REFUTATION_COLOR = 'rgba(248, 113, 113, 0.9)';

/**
 * The puzzle screen's progress, written only when this board adds a solve.
 *
 * The hook also records which puzzle was seen and which band was open, and
 * those belong to the puzzle screen: a daily puzzle recorded as the last one
 * seen would take over where that screen resumes. And merely opening the
 * landing page must not count as having played here, which a write would
 * (`lib/returning.ts`).
 */
const dailyProgressStore: PuzzleProgressStore = {
  load: () => webPuzzleProgressStore.load(),
  save: async (next) => {
    const current = await webPuzzleProgressStore.load();
    const added = next.solved.filter((id) => !current.solved.includes(id));
    if (added.length === 0) return;
    await webPuzzleProgressStore.save({
      ...current,
      solved: [...current.solved, ...added],
      streak: next.streak,
      bestStreak: Math.max(current.bestStreak, next.bestStreak),
    });
  },
};

/** A source holding one puzzle — all the landing page needs, and all it ships. */
function singlePuzzleSource(puzzle: Puzzle): PuzzleSource {
  const mine = (game?: PuzzleGame) => (!game || game === puzzle.game ? [puzzle] : []);
  return {
    getPuzzle: async (id) => (id === puzzle.id ? puzzle : null),
    listPuzzles: async (query) => mine(query?.game),
    nextPuzzle: async (game, opts) =>
      mine(game).find((p) => !(opts?.solvedIds ?? []).includes(p.id) && p.id !== opts?.after) ?? null,
    countPuzzles: async (game) => mine(game).length,
    countByBand: async () => ({}),
    idsByBand: async () => ({}),
  };
}
