import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type GameAccent = 'chess' | 'checkers' | 'reversi' | 'liquidate';

export interface GameScreenLayoutProps {
  /** Per-game neon accent — paints the ambient page glow (chess blue, checkers pink, reversi lime). */
  accent?: GameAccent;
  /** Where the header's back link points. */
  backHref: string;
  backLabel?: string;
  /** Optional centered header content (title + mode badge). */
  headerCenter?: React.ReactNode;
  /** Right-aligned header content (New Game, Live, thinking indicator, …). */
  headerActions?: React.ReactNode;
  /** Card above the board — the opponent / bot. Omit for boards with no players (analysis). */
  topCard?: React.ReactNode;
  /**
   * A single strip between the top card and the board (reversi's disc counts),
   * named to match the multiplayer `GameLayout` prop that does the same job.
   * Give it its own slot rather than folding it into `topCard`: the column's
   * height budget below counts slots, and content smuggled into another slot
   * would push the bottom card off a short screen.
   */
  topExtras?: React.ReactNode;
  /** Card below the board — you. */
  bottomCard?: React.ReactNode;
  /** The board element (already sized by its own BoardFrame). */
  board: React.ReactNode;
  /** The right-hand panel contents (info, move list, controls). */
  sidebar: React.ReactNode;
  /**
   * Width of the board column. The board is the page, so the default takes as
   * much of the shell as it can while leaving the sidebar usable; boards with
   * more cells per side (Liquidate's 12-per-side ring) ask for more still.
   *
   * This is an upper bound: on a short screen the column is additionally capped
   * by `--gx-board-cap` below, so it always fits without clipping.
   */
  boardColumnClassName?: string;
  className?: string;
}

/**
 * Vertical space the shell itself eats: the header row (53) + the body's `py-3`
 * (24). Everything left over is the board column's height budget — and since the
 * board is square, its *width* budget too. Every pixel trimmed from the chrome
 * here is a pixel the board grows by, in both directions.
 *
 * No allowance for the global navbar: in-game routes do not render it (see
 * `isImmersiveGameRoute`), which is where the other 64px went.
 */
const SHELL_CHROME_PX = 77;

/** A player card (46px) plus the column's `gap-3` (12px) above or below it. */
const PLAYER_CARD_PX = 58;

/** The disc-count strip (40px) plus its `gap-3`. */
const TOP_EXTRAS_PX = 52;

const BackArrow = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

/**
 * The single-player in-game shell (bot / training / analysis). Mirrors the
 * multiplayer `GameLayout` in-game view: a fixed board column with player cards
 * above and below the board, and a flexible sidebar. A slim header carries the
 * back link and page-specific actions (New Game, Analyze/Edit, …).
 */
export function GameScreenLayout({
  accent,
  backHref,
  backLabel = 'Back',
  headerCenter,
  headerActions,
  topCard,
  topExtras,
  bottomCard,
  board,
  sidebar,
  boardColumnClassName = 'lg:w-[520px] xl:w-[600px] 2xl:w-[680px]',
  className,
}: GameScreenLayoutProps) {
  // The desktop shell is `lg:h-screen lg:overflow-hidden`, so a board column
  // taller than the viewport doesn't scroll — it gets silently cut off (which
  // is what used to hide the "You" player card on ~720px-tall laptop screens).
  // Cap the column by the height actually available and the square board
  // shrinks to fit instead, cards and all.
  const reservedPx =
    SHELL_CHROME_PX +
    (topCard ? PLAYER_CARD_PX : 0) +
    (topExtras ? TOP_EXTRAS_PX : 0) +
    (bottomCard ? PLAYER_CARD_PX : 0);

  return (
    <div
      className={cn(
        'reveal-up min-h-screen lg:h-screen flex flex-col lg:overflow-hidden',
        accent && `page-glow-${accent}`,
        className,
      )}
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-2 border-b border-border bg-surface-alt/50 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg transition-colors text-sm"
          >
            <BackArrow />
            {backLabel}
          </Link>
          {headerCenter}
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      </div>

      {/* Body — board column (fixed) + flexible sidebar, matching the multiplayer layout. */}
      <div className="flex-1 min-h-0 lg:overflow-hidden">
        <div className="container mx-auto lg:h-full px-4 py-3">
          {/* lg:justify-center + a capped sidebar keep the board the widest
              thing on screen even when a short viewport shrinks its column —
              without it the sidebar swallows the leftover width. */}
          <div className="w-full max-w-6xl 2xl:max-w-7xl mx-auto flex flex-col lg:flex-row lg:justify-center gap-4 xl:gap-6 items-start lg:h-full">
            <div
              className={cn(
                // `lg:` only, deliberately. The cap exists because the desktop
                // shell is `lg:h-screen lg:overflow-hidden`, where a too-tall
                // column is silently CUT OFF. Below `lg` the page scrolls
                // instead, so nothing is lost by overflowing — and applying the
                // cap there just shrinks every board for no benefit.
                'flex flex-col gap-3 w-full lg:shrink-0 lg:max-w-[var(--gx-board-cap)]',
                boardColumnClassName,
              )}
              style={{ '--gx-board-cap': `calc(100svh - ${reservedPx}px)` } as React.CSSProperties}
            >
              {topCard}
              {topExtras}
              {board}
              {bottomCard}
            </div>
            <div className="w-full lg:flex-1 lg:max-w-[460px] flex flex-col gap-3 lg:min-h-0 lg:h-full">
              {sidebar}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
