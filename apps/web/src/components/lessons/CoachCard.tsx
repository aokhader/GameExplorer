'use client';

import React from 'react';
import type { LessonSayKind, LessonStep } from '@gameexplorer/shared';

/**
 * The coach: what to do, what just happened, and the two buttons.
 *
 * Lives in `GameScreenLayout`'s **sidebar**, never its `topCard`. That slot is
 * budgeted at a fixed 58px (it is sized for a PlayerCard) and subtracted from
 * the board's height cap, so a card that wraps to three lines would silently
 * push the bottom rank of the board past the fold on a shell that clips rather
 * than scrolls. Coach copy wraps constantly.
 *
 * Two lines rather than one: the instruction stays put for as long as the step
 * is open, and `say` is the coach reacting to the last thing that happened.
 * When nothing has happened yet the two are the same sentence, and only one is
 * drawn.
 */

const TONE: Record<LessonSayKind, { ring: string; label: string; text: string }> = {
  instruction: { ring: 'border-white/10 bg-white/[0.04]', label: '', text: 'text-fg' },
  success: {
    ring: 'border-success/40 bg-success/10',
    label: 'Nice',
    text: 'text-success-hover',
  },
  miss: { ring: 'border-warning/40 bg-warning/10', label: 'Not quite', text: 'text-warning-hover' },
  outro: { ring: 'border-accent/40 bg-accent/10', label: 'Lesson complete', text: 'text-accent' },
};

export interface CoachCardProps {
  step: LessonStep | null;
  say: string;
  sayKind: LessonSayKind;
  /** True on a `read` step — the primary button advances instead of waiting. */
  canAdvance: boolean;
  /** Hidden once the lesson is done. */
  canRetry: boolean;
  canHint: boolean;
  hintText: string | null;
  hintShown: boolean;
  onAdvance: () => void;
  onRetry: () => void;
  onHint: () => void;
}

export function CoachCard({
  step,
  say,
  sayKind,
  canAdvance,
  canRetry,
  canHint,
  hintText,
  hintShown,
  onAdvance,
  onRetry,
  onHint,
}: CoachCardProps) {
  const tone = TONE[sayKind];
  // The instruction and the live line are the same sentence at the start of a
  // step. Drawing it twice reads as a bug.
  const showTask = step !== null && step.instruction !== say;

  return (
    <div
      className={`shrink-0 rounded-xl border p-4 transition-colors ${tone.ring}`}
      data-testid="coach-card"
      data-say-kind={sayKind}
    >
      {tone.label && (
        <div className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${tone.text}`}>
          {tone.label}
        </div>
      )}

      {/* aria-live so a screen reader hears the coach react, rather than only
          finding out by re-reading the card. */}
      <p className="text-sm leading-relaxed text-fg" data-testid="coach-say" aria-live="polite">
        {say}
      </p>

      {showTask && (
        <p className="mt-3 text-sm leading-relaxed text-fg-muted" data-testid="coach-task">
          <span className="font-semibold text-fg-subtle uppercase text-caption tracking-wide mr-1.5">
            Task
          </span>
          {step.instruction}
        </p>
      )}

      {hintShown && hintText && (
        <p className="mt-3 text-sm italic text-accent" data-testid="coach-hint">
          {hintText}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {canAdvance ? (
          <button
            onClick={onAdvance}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-on-accent transition-colors"
            data-testid="coach-continue"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={onHint}
            disabled={!canHint}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            data-testid="coach-hint-button"
          >
            {hintShown ? 'Hint shown' : 'Hint'}
          </button>
        )}
        {canRetry && (
          <button
            onClick={onRetry}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border border-white/10 bg-white/[0.04] text-fg hover:bg-white/[0.08] transition-colors"
            data-testid="coach-retry"
          >
            Reset step
          </button>
        )}
      </div>
    </div>
  );
}
