'use client';

import React from 'react';
import Link from 'next/link';
import { usePuzzle } from '@gameexplorer/client';
import type { PuzzleGame } from '@gameexplorer/shared';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { StatusBanner } from '@/components/game/StatusBanner';
import { GameSkeleton } from '@/components/game/GameSkeleton';
import { staticPuzzleSource } from '@gameexplorer/shared';
import { webPuzzleProgressStore } from '@/lib/puzzleProgress';
import { PuzzleBoard } from './PuzzleBoard';

const GAME_LABEL: Record<PuzzleGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
};

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: 'bg-success/15 text-success-hover border-success/40',
  medium: 'bg-warning/15 text-warning-hover border-warning/40',
  hard: 'bg-error/15 text-error-hover border-error/40',
};

/** Headline + supporting line for each phase of the run. */
function statusFor(phase: string | null): { title: string; description: string } {
  switch (phase) {
    case 'replying':
      return { title: 'Correct', description: 'Watch the reply…' };
    case 'wrong':
      return { title: 'Not quite', description: 'The position is unchanged — try again.' };
    case 'solved':
      return { title: 'Solved', description: 'Read why below, then take the next one.' };
    default:
      return { title: 'Your move', description: 'Find the move the position is asking for.' };
  }
}

export interface PuzzleScreenProps {
  game: PuzzleGame;
}

export function PuzzleScreen({ game }: PuzzleScreenProps) {
  const {
    puzzle,
    run,
    phase,
    loading,
    error,
    exhausted,
    progress,
    solved,
    total,
    hint,
    playMove,
    retry,
    next,
    showHint,
    startOver,
  } = usePuzzle<unknown>({ game, source: staticPuzzleSource, progress: webPuzzleProgressStore });

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
    return (
      <EmptyState
        game={game}
        title={`You've solved every ${GAME_LABEL[game]} puzzle`}
        body={`That's all ${total} of them. More are coming — or start the set again from the beginning.`}
        action={
          <button
            onClick={startOver}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm"
          >
            Start over
          </button>
        }
      />
    );
  }

  const status = statusFor(phase);
  const isSolved = phase === 'solved';

  return (
    <GameScreenLayout
      accent={game}
      backHref={`/${game}`}
      backLabel={GAME_LABEL[game]}
      headerCenter={
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-fg">Puzzle</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold capitalize ${
              DIFFICULTY_STYLE[puzzle.difficulty] ?? DIFFICULTY_STYLE.medium
            }`}
          >
            {puzzle.difficulty}
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
        <PuzzleBoard
          game={game}
          state={run.state}
          playerColor={puzzle.playerColor}
          onMove={playMove}
          hint={hint}
          wrongMove={phase === 'wrong' ? run.wrongMove : null}
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
                    className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-fg-muted"
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
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Hint
            </button>
            <button
              onClick={retry}
              disabled={isSolved}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="puzzle-retry"
            >
              Retry
            </button>
            <button
              onClick={next}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-on-accent transition-colors"
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
                <p className="mt-3 text-[11px] text-fg-subtle italic">{puzzle.source}</p>
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
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-fg mb-2">{title}</h1>
        <p className="text-sm text-fg-muted mb-6">{body}</p>
        <div className="flex items-center justify-center gap-3">
          {action}
          <Link
            href={`/${game}`}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] transition-colors"
          >
            Back to {GAME_LABEL[game]}
          </Link>
        </div>
      </div>
    </div>
  );
}
