'use client';

import React from 'react';
import Link from 'next/link';
// Deep import, not the package barrel — the same reason `PuzzleScreen` does it.
// The barrel re-exports `useSocket`, which pulls `@gameexplorer/db` (a Supabase
// client built at import time) and socket.io onto this route's chunk, neither
// of which a lesson touches.
import { useLesson } from '@gameexplorer/client/hooks/useLesson';
import type { LessonGame } from '@gameexplorer/shared';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { GameSkeleton } from '@/components/game/GameSkeleton';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { webLessonProgressStore } from '@/lib/lessonProgress';
import { CoachCard } from './CoachCard';
import { LessonRail } from './LessonRail';

const GAME_LABEL: Record<LessonGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
};

export interface LessonScreenProps {
  game: LessonGame;
  lessonId: string;
}

/**
 * One coached lesson, on a live board.
 *
 * A client component with an engine binding, which is exactly why lessons are a
 * sibling of the rules article rather than a section inside it: `/{game}/learn`
 * server-renders, carries per-route metadata and works with JS off, and none of
 * that survives dragging four engines into its payload.
 */
export function LessonScreen({ game, lessonId }: LessonScreenProps) {
  const {
    lesson,
    step,
    phase,
    say,
    sayKind,
    loading,
    error,
    board,
    marks,
    stepIndex,
    stepCount,
    misses,
    hint,
    hintText,
    hintShown,
    nextLesson,
    playMove,
    advance,
    retry,
    showHint,
    restart,
  } = useLesson<unknown>({ game, lessonId, progress: webLessonProgressStore });

  if (loading) return <GameSkeleton />;

  if (error || !lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-fg mb-2">Lesson not found</h1>
          <p className="text-sm text-fg-muted mb-6">
            {error ?? 'That lesson has been renamed or removed.'}
          </p>
          <Link
            href={`/${game}/learn`}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-on-accent transition-colors"
          >
            Back to the {GAME_LABEL[game]} guide
          </Link>
        </div>
      </div>
    );
  }

  const done = phase === 'done';
  // Inert during the reply beat and once finished, so a stray click cannot land
  // a move in a position the learner is no longer in. The runtime answers stray
  // input with `'ignored'` anyway; this is what makes the board *look* the way
  // it behaves.
  const interactive = phase === 'acting' || phase === 'missed';

  return (
    <GameScreenLayout
      accent={game}
      backHref={`/${game}/learn`}
      backLabel={GAME_LABEL[game]}
      headerCenter={
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-fg">Lesson</span>
          <span className="text-caption px-2 py-0.5 rounded-full border border-accent/40 bg-accent/15 text-accent font-semibold">
            {lesson.title}
          </span>
        </div>
      }
      headerActions={
        <span className="text-xs text-fg-muted" data-testid="lesson-progress">
          {Math.min(stepIndex + 1, stepCount)} / {stepCount}
        </span>
      }
      board={
        <InteractiveBoard
          game={game}
          state={board}
          playerColor={lesson.learnerColor}
          interactive={interactive}
          onMove={playMove}
          hint={hint}
          marks={marks}
          // A miss never moves the board, so the chess board has to be told
          // to drop the move it drew optimistically. See `rejectedMoves`.
          rejectedMoves={misses}
        />
      }
      sidebar={
        <>
          <LessonRail stepIndex={stepIndex} stepCount={stepCount} title={lesson.title} />

          <CoachCard
            step={step}
            say={say}
            sayKind={sayKind}
            canAdvance={phase === 'reading'}
            canRetry={!done}
            canHint={interactive}
            hintText={hintText}
            hintShown={hintShown}
            onAdvance={advance}
            onRetry={retry}
            onHint={showHint}
          />

          {done && (
            <div
              className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-4"
              data-testid="lesson-done"
            >
              <div className="text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
                What next
              </div>
              <div className="flex flex-col gap-2">
                {nextLesson ? (
                  <Link
                    href={`/${game}/learn/${nextLesson.id}`}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-on-accent text-center transition-colors"
                    data-testid="lesson-next"
                  >
                    Next: {nextLesson.title}
                  </Link>
                ) : (
                  <Link
                    href={`/${game}/puzzles`}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-on-accent text-center transition-colors"
                    data-testid="lesson-next"
                  >
                    Try the {GAME_LABEL[game]} puzzles
                  </Link>
                )}
                <button
                  onClick={restart}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] transition-colors"
                  data-testid="lesson-restart"
                >
                  Play this lesson again
                </button>
                <Link
                  href={`/${game}/learn`}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] text-center transition-colors"
                >
                  All {GAME_LABEL[game]} lessons
                </Link>
              </div>
            </div>
          )}

          <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm text-fg-muted leading-relaxed">{lesson.summary}</p>
            <p className="mt-2 text-caption text-fg-subtle">
              About {lesson.estimatedMinutes} minutes · playing {lesson.learnerColor}
            </p>
          </div>
        </>
      }
    />
  );
}
