'use client';

import React from 'react';
import Link from 'next/link';
// Deep import, not the package barrel — the same reason mobile does it. The
// barrel re-exports `useSocket`, which pulls `@gameexplorer/db` (a Supabase
// client built at import time) and socket.io onto this route's chunk, neither
// of which a puzzle touches.
import { usePuzzle } from '@gameexplorer/client/hooks/usePuzzle';
import type { PuzzleGame } from '@gameexplorer/shared';
import { defaultBandFor } from '@gameexplorer/shared';
import { useAuth } from '@/hooks/useAuth';
import { getUserRating } from '@/lib/db';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { StatusBanner } from '@/components/game/StatusBanner';
import { GameSkeleton } from '@/components/game/GameSkeleton';
import {
  createFetchPuzzleSource,
  createLayeredPuzzleSource,
  staticPuzzleSource,
} from '@gameexplorer/shared';
import { webPuzzleProgressStore } from '@/lib/puzzleProgress';
import { webPuzzleChunkCache } from '@/lib/puzzleChunkCache';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { PuzzleBandPicker } from './PuzzleBandPicker';
import { usePuzzleFeedback } from './usePuzzleFeedback';

const GAME_LABEL: Record<PuzzleGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
};

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: 'bg-success/15 text-success-hover border-success/40',
  medium: 'bg-warning/15 text-warning-hover border-warning/40',
  hard: 'bg-error/15 text-error-hover border-error/40',
};

/**
 * Headline + supporting line for each phase of the run.
 *
 * The wrong-move line is the interesting one: it waits on a search, so it says
 * what it is doing rather than sitting on stale text, and the sentence it lands
 * on comes from the shared runtime so both platforms say the same thing.
 *
 * `alternateText` is the other shared sentence, and it takes precedence on a
 * correct move: a player who found one of several winning moves is right, and
 * also needs to be told which one the explanation is about.
 */
function statusFor(
  phase: string | null,
  refutationText: string | null,
  alternateText: string | null,
): { title: string; description: string } {
  switch (phase) {
    case 'replying':
      return { title: 'Correct', description: alternateText ?? 'Watch the reply…' };
    case 'wrong':
      return {
        title: 'Not quite',
        description: refutationText ?? 'Looking at what your opponent does about that…',
      };
    case 'solved':
      return {
        title: 'Solved',
        description: alternateText ?? 'Read why below, then take the next one.',
      };
    default:
      return { title: 'Your move', description: 'Find the move the position is asking for.' };
  }
}

/**
 * The full corpus, with the bundled core behind it.
 *
 * Module scope so the in-flight map and the session cache are shared by every
 * mount — remounting the screen must not refetch the index. The layered source
 * falls back to `staticPuzzleSource` on any failure, so a reader offline on a
 * cold cache still gets the ~100-per-band bundled set rather than an error.
 */
const puzzleSource = createLayeredPuzzleSource(
  createFetchPuzzleSource('/puzzles', fetch, webPuzzleChunkCache),
  staticPuzzleSource,
);

export interface PuzzleScreenProps {
  game: PuzzleGame;
}

export function PuzzleScreen({ game }: PuzzleScreenProps) {
  const { user } = useAuth();

  // The player's own rating in this game, which decides the band the picker
  // opens on. `null` while it is unknown — a guest never leaves that state, and
  // `defaultBandFor` gives them the middle band.
  const [rating, setRating] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Never null: `getUserRating` falls back to a default for a player with no
    // games yet, which is the right band to open on for a new account.
    void getUserRating(user.id, game).then((r) => {
      if (!cancelled) setRating(r.rating);
    });
    return () => {
      cancelled = true;
    };
  }, [user, game]);

  const {
    puzzle,
    run,
    phase,
    loading,
    swapping,
    error,
    exhausted,
    progress,
    solved,
    total,
    band,
    bandCounts,
    bandSolved,
    setBand,
    hint,
    board,
    refutation,
    refutationText,
    alternateText,
    playMove,
    retry,
    next,
    showHint,
    startOver,
  } = usePuzzle<unknown>({
    game,
    source: puzzleSource,
    progress: webPuzzleProgressStore,
    // Resolved here rather than inside the hook: the rating comes from
    // `@gameexplorer/db`, and this file deep-imports `usePuzzle` precisely to
    // keep that Supabase client off the puzzle chunk.
    defaultBand: rating === null ? undefined : defaultBandFor(game, rating).id,
  });

  usePuzzleFeedback({ phase, attempts: run?.attempts ?? 0, puzzleId: puzzle?.id ?? null });

  // Only when there is nothing to show. A Next press keeps the old board up —
  // see `swapping`, which makes it inert instead of replacing it.
  if (loading) return <GameSkeleton />;

  if (error || (!puzzle && !exhausted)) {
    return (
      <EmptyState
        game={game}
        title="Could not load a puzzle"
        body={error ?? 'Something went wrong reading the puzzle set.'}
      />
    );
  }

  if (exhausted || !puzzle || !run) {
    // Exhaustion is now per band, so the way out is usually another band rather
    // than starting over — offering only "Start over" would throw away a
    // solved set to escape a finished one.
    const empty = total === 0;
    return (
      <EmptyState
        game={game}
        title={
          empty
            ? `No ${band.label} ${GAME_LABEL[game]} puzzles yet`
            : `You've solved every ${band.label} puzzle`
        }
        body={
          empty
            ? `The ${GAME_LABEL[game]} set doesn't reach this strength yet. Pick another band below.`
            : `That's all ${total} at ${band.label}. Try another band, or start this one again.`
        }
        action={
          <div className="flex w-full max-w-sm flex-col gap-3">
            <PuzzleBandPicker
              game={game}
              band={band}
              counts={bandCounts}
              solved={bandSolved}
              onSelect={setBand}
              rating={rating}
            />
            {!empty && (
              <button
                onClick={startOver}
                className="touch-target motion-control motion-safe:active:scale-[0.98] px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg text-sm"
              >
                Start over
              </button>
            )}
          </div>
        }
      />
    );
  }

  const status = statusFor(phase, refutationText, alternateText);
  const isSolved = phase === 'solved';

  return (
    <GameScreenLayout
      backHref={`/${game}`}
      backLabel={GAME_LABEL[game]}
      headerCenter={
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-fg">Puzzle</span>
          {/* The band, not the authoring tier. `difficulty` says how the puzzle
              was written; the band says how hard it measured, and it is the one
              the player chose — so it is the one that belongs beside the
              rating. */}
          <span
            className={`text-caption px-2 py-0.5 rounded-full border font-semibold ${
              DIFFICULTY_STYLE[puzzle.difficulty] ?? DIFFICULTY_STYLE.medium
            }`}
            data-testid="puzzle-band-label"
          >
            {band.label} · {puzzle.rating}
          </span>
        </div>
      }
      headerActions={
        <span className="text-xs text-fg-muted" data-testid="puzzle-progress">
          {solved} / {total} solved
          {progress.streak > 0 && <> · streak {progress.streak}</>}
        </span>
      }
      // No `topCard` on purpose. The shell budgets a fixed 58px for that slot
      // (it is sized for a PlayerCard) and subtracts it from the board's height
      // cap — so a prompt card that wraps to two lines silently pushes the
      // bottom rank of the board past the fold, on a shell that clips rather
      // than scrolls. The prompt lives in the sidebar instead, where it can be
      // any length.
      board={
        <InteractiveBoard
          game={game}
          // `board`, not `run.state`: after a wrong move the board runs on past
          // the line to play out the refutation, while `run.state` stays on the
          // position the player still has to solve.
          state={board}
          playerColor={puzzle.playerColor}
          interactive={phase === 'playing' && !swapping}
          onMove={playMove}
          hint={hint}
          refutation={refutation?.reply ?? null}
        />
      }
      sidebar={
        <>
          <StatusBanner
            accent={game}
            title={status.title}
            description={status.description}
            className="shrink-0"
          />

          <PuzzleBandPicker
            game={game}
            band={band}
            counts={bandCounts}
            solved={bandSolved}
            onSelect={setBand}
            rating={rating}
          />

          <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            {/* The task itself, always on screen — the status line above it
                changes with the phase, but what you are being asked to do
                does not. */}
            <p className="text-sm font-semibold text-fg mb-3" data-testid="puzzle-prompt">
              {puzzle.prompt}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <span className="text-fg-muted">Solved:</span>
                <span className="font-semibold text-fg">
                  {solved} / {total}
                </span>
              </div>
              <div className="flex gap-1.5">
                <span className="text-fg-muted">Streak:</span>
                <span className="font-semibold text-fg">{progress.streak}</span>
              </div>
              <div className="flex gap-1.5 col-span-2">
                <span className="text-fg-muted">Playing:</span>
                <span className="font-semibold text-fg capitalize">{puzzle.playerColor}</span>
              </div>
            </div>
            {puzzle.themes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {puzzle.themes.map((theme) => (
                  <span
                    key={theme}
                    className="text-caption px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-fg-muted"
                  >
                    {theme.replace(/-/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 flex gap-2">
            <button
              onClick={showHint}
              disabled={phase !== 'playing'}
              className="touch-target motion-control motion-safe:active:scale-[0.98] flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Hint
            </button>
            <button
              onClick={retry}
              disabled={isSolved}
              className="touch-target motion-control motion-safe:active:scale-[0.98] flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="puzzle-retry"
            >
              Retry
            </button>
            <button
              onClick={next}
              className="touch-target motion-control motion-safe:active:scale-[0.98] flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-on-accent"
              data-testid="puzzle-next"
            >
              Next
            </button>
          </div>

          {isSolved && (
            <div
              className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.04] p-4"
              data-testid="puzzle-explanation"
            >
              <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
                Why it works
              </div>
              <p className="text-sm text-fg-muted leading-relaxed">{puzzle.explanation}</p>
              {puzzle.source && (
                <p className="mt-3 text-caption text-fg-subtle italic">{puzzle.source}</p>
              )}
            </div>
          )}
        </>
      }
    />
  );
}

function EmptyState({
  game,
  title,
  body,
  action,
}: {
  game: PuzzleGame;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-svh flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-fg mb-2">{title}</h1>
        <p className="text-sm text-fg-muted mb-6">{body}</p>
        <div className="flex items-center justify-center gap-3">
          {action}
          <Link
            href={`/${game}`}
            className="touch-target motion-control motion-safe:active:scale-[0.98] px-4 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08]"
          >
            Back to {GAME_LABEL[game]}
          </Link>
        </div>
      </div>
    </div>
  );
}
