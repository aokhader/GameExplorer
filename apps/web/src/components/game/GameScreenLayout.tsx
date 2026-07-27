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
  /** Card below the board — you. */
  bottomCard?: React.ReactNode;
  /** The board element (already sized by its own BoardFrame). */
  board: React.ReactNode;
  /** The right-hand panel contents (info, move list, controls). */
  sidebar: React.ReactNode;
  /**
   * Width of the board column. Defaults to the 460px that suits an 8×8 grid;
   * boards with more cells per side (Liquidate's 12-per-side ring) need more
   * room before their tile labels stop being legible.
   */
  boardColumnClassName?: string;
  className?: string;
}

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
  bottomCard,
  board,
  sidebar,
  boardColumnClassName = 'lg:w-[460px]',
  className,
}: GameScreenLayoutProps) {
  return (
    <div
      className={cn(
        'reveal-up min-h-screen lg:h-screen flex flex-col lg:overflow-hidden pt-16',
        accent && `page-glow-${accent}`,
        className,
      )}
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-surface-alt/50 backdrop-blur-sm">
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
        <div className="container mx-auto lg:h-full px-4 py-4">
          <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 items-start lg:h-full">
            <div className={cn('flex flex-col gap-3 w-full lg:shrink-0', boardColumnClassName)}>
              {topCard}
              {board}
              {bottomCard}
            </div>
            <div className="w-full lg:flex-1 flex flex-col gap-3 lg:min-h-0 lg:h-full">
              {sidebar}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
