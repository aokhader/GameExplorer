'use client';

import React from 'react';
import {
  GRADE_INFO,
  SUMMARY_ORDER,
  type AnalysisAdapter,
  type Color,
  type MoveGrade,
  type PositionEval,
} from '@gameexplorer/shared';
import type { GradedMove, ScanProgress } from '@gameexplorer/client/hooks/useGameAnalysis';

/**
 * Grade colour for web. Mobile resolves the same grades through live-view token
 * getters; here they are Tailwind classes over the same CSS custom properties,
 * so both themes follow automatically.
 */
const GRADE_CLASS: Record<MoveGrade, string> = {
  best: 'text-success-hover',
  good: 'text-fg-muted',
  inaccuracy: 'text-warning-hover',
  mistake: 'text-warning',
  blunder: 'text-danger-hover',
};

export interface ReviewPanelProps<S> {
  adapter: AnalysisAdapter<S>;
  /** Moves in the game's own notation, aligned with `grades`. */
  moves: string[];
  /** Board for the position on screen — supplied by the page. */
  board: React.ReactNode;
  viewIndex: number;
  onSeek: (index: number) => void;
  /** Number of positions (`moves.length + 1`). */
  total: number;
  /** Which side the player was; the summary leads with their moves. */
  playerColor: Color;
  /** Pass-and-play has no "you", so the summary shows both sides equally. */
  showBothSides?: boolean;
  evaluation: PositionEval | null;
  grades: (GradedMove | null)[];
  summary: Record<Color, Record<MoveGrade, number>>;
  scanning: boolean;
  progress: ScanProgress;
  complete: boolean;
  liveBusy: boolean;
  error: string | null;
  onScan: () => void;
  onStopScan: () => void;
  onExit: () => void;
}

/**
 * Post-game review for web — the counterpart to mobile's `ReviewScreen`, and a
 * different thing from `/chess/analysis`, which is a position editor that
 * happens to run an engine.
 *
 * Everything except the markup is shared: the grading, the White-positive
 * normalisation and the scan loop all come from `useGameAnalysis` and the shared
 * adapters, so a game reviewed here and the same game reviewed on a phone
 * produce the same verdicts.
 */
export function ReviewPanel<S>({
  adapter,
  moves,
  board,
  viewIndex,
  onSeek,
  total,
  playerColor,
  showBothSides = false,
  evaluation,
  grades,
  summary,
  scanning,
  progress,
  complete,
  liveBusy,
  error,
  onScan,
  onStopScan,
  onExit,
}: ReviewPanelProps<S>) {
  // `viewIndex` is a position; the move that produced it is one lower.
  const currentGrade = viewIndex > 0 ? grades[viewIndex - 1] : null;
  const share = evaluation ? adapter.whiteShare(evaluation) : 0.5;
  const label = evaluation ? adapter.formatScore(evaluation) : '';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-surface/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Game review"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-fg">Review</h2>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm font-semibold text-fg hover:bg-surface-alt"
          >
            Done
          </button>
        </header>

        <EvalBar share={share} label={label} busy={liveBusy} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{board}</div>

          <div className="flex flex-col gap-3">
            {/* What the engine thinks of the position on screen. */}
            <section className="rounded-xl border border-border bg-surface-alt p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {viewIndex === 0 ? 'Starting position' : `After move ${viewIndex}`}
              </h3>
              {currentGrade ? (
                <MoveVerdict grade={currentGrade} />
              ) : (
                <p className="mt-1 text-sm text-fg-muted">
                  {viewIndex === 0
                    ? 'Step forward to walk through the game.'
                    : scanning
                      ? 'Scoring this move…'
                      : 'Run the review to grade every move.'}
                </p>
              )}
              {evaluation?.bestMove && (
                <p className="mt-1 text-sm text-fg-muted">
                  Engine plays{' '}
                  <strong className="font-semibold text-fg">{formatMove(evaluation.bestMove)}</strong>
                </p>
              )}
            </section>

            <MoveList moves={moves} grades={grades} viewIndex={viewIndex} onSeek={onSeek} />

            {/* Scan control + per-side tallies. */}
            <section className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-alt p-3">
              {scanning ? (
                <>
                  <ScanProgressBar progress={progress} />
                  <button
                    type="button"
                    onClick={onStopScan}
                    className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-hover"
                  >
                    Stop
                  </button>
                </>
              ) : complete ? (
                showBothSides ? (
                  <>
                    <SummaryRow heading="White" counts={summary.white} />
                    <SummaryRow heading="Black" counts={summary.black} />
                  </>
                ) : (
                  <>
                    <SummaryRow heading="You" counts={summary[playerColor]} />
                    <SummaryRow
                      heading="Opponent"
                      counts={summary[playerColor === 'white' ? 'black' : 'white']}
                    />
                  </>
                )
              ) : (
                <>
                  <p className="text-sm text-fg-muted">
                    Score every move to find your blunders, mistakes, and best finds.
                  </p>
                  <button
                    type="button"
                    onClick={onScan}
                    className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
                  >
                    Review every move
                  </button>
                </>
              )}

              {error && (
                <p aria-live="polite" className="text-xs text-danger-hover">
                  {error}
                </p>
              )}
            </section>
          </div>
        </div>

        <ReviewBar viewIndex={viewIndex} total={total} onSeek={onSeek} />
      </div>
    </div>
  );
}

/** "e2→e4", or just the square for a placement game where from === to. */
function formatMove(move: { from: string; to: string }): string {
  return move.from === move.to ? move.to : `${move.from}→${move.to}`;
}

function MoveVerdict({ grade }: { grade: GradedMove }) {
  const info = GRADE_INFO[grade.grade];
  return (
    <div className="mt-1">
      <p className={`text-base font-semibold ${GRADE_CLASS[grade.grade]}`}>
        {info.glyph ? `${info.glyph} ` : ''}
        {info.label}
      </p>
      {grade.better && (
        <p className="text-sm text-fg-muted">
          Better was{' '}
          <strong className="font-semibold text-fg">{formatMove(grade.better)}</strong>
        </p>
      )}
    </div>
  );
}

/**
 * White's share of the bar. Rendered as two stacked blocks rather than a
 * gradient so the boundary — the only part that carries information — stays a
 * hard edge at any size.
 */
function EvalBar({ share, label, busy }: { share: number; label: string; busy: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-3 flex-1 overflow-hidden rounded-full bg-black"
        role="img"
        aria-label={label ? `Evaluation ${label}` : 'Evaluation pending'}
      >
        <div className="h-full bg-white transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="min-w-[5.5rem] text-right text-sm font-semibold tabular-nums text-fg">
        {busy && !label ? '…' : label}
      </span>
    </div>
  );
}

function ScanProgressBar({ progress }: { progress: ScanProgress }) {
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <p aria-live="polite" className="text-sm text-fg-muted">
        Reviewing… {progress.done} of {progress.total} positions
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryRow({ heading, counts }: { heading: string; counts: Record<MoveGrade, number> }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-fg">{heading}</span>
      <div className="flex items-center gap-3">
        {SUMMARY_ORDER.map((grade) => (
          <span key={grade} className={`text-sm tabular-nums ${GRADE_CLASS[grade]}`}>
            <span aria-hidden>{GRADE_INFO[grade].glyph || '·'}</span>{' '}
            <span className="sr-only">{GRADE_INFO[grade].label}: </span>
            {counts[grade]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The move list, each entry tinted by its grade and seekable. */
function MoveList({
  moves,
  grades,
  viewIndex,
  onSeek,
}: {
  moves: string[];
  grades: (GradedMove | null)[];
  viewIndex: number;
  onSeek: (index: number) => void;
}) {
  if (moves.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface-alt p-3 text-sm text-fg-muted">
        No moves to review.
      </section>
    );
  }

  return (
    <section className="max-h-56 overflow-y-auto rounded-xl border border-border bg-surface-alt p-2">
      <ol className="flex flex-wrap gap-1">
        {moves.map((move, i) => {
          const grade = grades[i]?.grade;
          // Move `i` produced position `i + 1`.
          const active = viewIndex === i + 1;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSeek(i + 1)}
                aria-current={active ? 'true' : undefined}
                className={`rounded px-1.5 py-0.5 text-sm tabular-nums hover:bg-surface-muted ${
                  active ? 'bg-accent-muted font-semibold text-fg' : 'text-fg-muted'
                }`}
              >
                <span className="text-fg-subtle">{i + 1}.</span> {move}
                {grade && GRADE_INFO[grade].glyph && (
                  <span className={GRADE_CLASS[grade]}> {GRADE_INFO[grade].glyph}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ReviewBar({
  viewIndex,
  total,
  onSeek,
}: {
  viewIndex: number;
  total: number;
  onSeek: (index: number) => void;
}) {
  const last = Math.max(0, total - 1);
  const step = (delta: number) => onSeek(Math.min(last, Math.max(0, viewIndex + delta)));

  return (
    <div className="flex items-center justify-center gap-2">
      <NavButton label="First" onClick={() => onSeek(0)} disabled={viewIndex === 0}>
        ⏮
      </NavButton>
      <NavButton label="Previous move" onClick={() => step(-1)} disabled={viewIndex === 0}>
        ◀
      </NavButton>
      <span className="min-w-[6rem] text-center text-sm tabular-nums text-fg-muted">
        {viewIndex} / {last}
      </span>
      <NavButton label="Next move" onClick={() => step(1)} disabled={viewIndex >= last}>
        ▶
      </NavButton>
      <NavButton label="Last" onClick={() => onSeek(last)} disabled={viewIndex >= last}>
        ⏭
      </NavButton>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm text-fg hover:bg-surface-alt disabled:opacity-40"
    >
      {children}
    </button>
  );
}
