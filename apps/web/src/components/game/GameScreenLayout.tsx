'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useWideLayout } from '@/hooks/useWideLayout';
import { BOARD_MAX_PX } from '@/components/board/BoardFrame';
import { ShellNav } from '@/components/game/ShellNav';

export type GameAccent = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

export interface GameScreenLayoutProps {
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
  /** The right-hand panel contents (info, move list). */
  sidebar: React.ReactNode;
  /**
   * The in-game action row (`GameActions`). At the foot of the sidebar from `lg`
   * up; directly under the bottom card on a phone, where it used to sit below
   * the whole move list (`ux-fix-ideas.md` §8.2).
   */
  actions?: React.ReactNode;
  /** The move list as one scrolling line — phones only (`MoveStrip`). */
  moveStrip?: React.ReactNode;
  /**
   * Width of the board column. The board is the page, so the default takes as
   * much of the shell as it can while leaving the sidebar usable; boards with
   * more cells per side (Liquidate's 12-per-side ring) ask for more still.
   *
   * This is an upper bound: on a short screen the column is additionally capped
   * by `--gx-board-budget` below, so it always fits without clipping.
   */
  boardColumnClassName?: string;
  /**
   * The board's own `maxPx`, when it is not the default — Liquidate's ring caps
   * at 760. The column never grows past the board it holds, so the sidebar gets
   * the difference instead of a strip of empty column.
   */
  boardMaxPx?: number;
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

/** The action row (40px buttons) plus its `gap-3` — under the board on a phone. */
const ACTIONS_PX = 52;

/** The move strip (44px) plus its `gap-3`. */
const MOVE_STRIP_PX = 56;

/**
 * A phone's board never shrinks below this to make room for the rows under it:
 * on a landscape phone the rows would leave it a postage stamp, and scrolling a
 * little is the better trade there.
 */
const PHONE_BOARD_FLOOR_PX = 280;

/** The sidebar's id — where a phone's move strip sends *All moves*. */
export const GAME_SIDEBAR_ID = 'game-sidebar';

/**
 * The single-player in-game shell (bot / training / analysis). Mirrors the
 * multiplayer `GameLayout` in-game view: a fixed board column with player cards
 * above and below the board, and a flexible sidebar. A slim header carries the
 * back link and page-specific actions (New Game, Analyze/Edit, …).
 */
export function GameScreenLayout({
  backHref,
  backLabel = 'Back',
  headerCenter,
  headerActions,
  topCard,
  topExtras,
  bottomCard,
  board,
  sidebar,
  actions,
  moveStrip,
  // Grow into whatever width the sidebar leaves, up to `--gx-board-budget` below.
  // The fixed breakpoint widths this replaced gave every 1280–1535px-wide
  // screen a 600px board regardless of the height it had to spare.
  boardColumnClassName = 'lg:grow-[1000] lg:basis-0 lg:min-w-0',
  boardMaxPx = BOARD_MAX_PX,
  className,
}: GameScreenLayoutProps) {
  // The desktop shell is `lg:h-svh lg:overflow-hidden`, so a board column
  // taller than the viewport doesn't scroll — it gets silently cut off (which
  // is what used to hide the "You" player card on ~720px-tall laptop screens).
  // Cap the column by the height actually available and the square board
  // shrinks to fit instead, cards and all.
  const reservedPx =
    SHELL_CHROME_PX +
    (topCard ? PLAYER_CARD_PX : 0) +
    (topExtras ? TOP_EXTRAS_PX : 0) +
    (bottomCard ? PLAYER_CARD_PX : 0);

  // One column below `lg`: opponent, board, you, then the actions and the move
  // strip — lila's phone layout. The board is sized so all of it fits in the
  // viewport with the URL bar showing (`svh`), which is what keeps Resign on
  // screen at move twenty without scrolling the board away.
  const wide = useWideLayout();
  const phoneReservedPx =
    reservedPx + (actions ? ACTIONS_PX : 0) + (moveStrip ? MOVE_STRIP_PX : 0);

  return (
    <div
      className={cn(
        'min-h-svh lg:h-svh flex flex-col lg:overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-2 border-b border-border bg-surface-alt">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <ShellNav backHref={backHref} backLabel={backLabel} />
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
                // shell is `lg:h-svh lg:overflow-hidden`, where a too-tall
                // column is silently CUT OFF. Below `lg` the page scrolls
                // instead, so nothing is lost by overflowing — and applying the
                // cap there just shrinks every board for no benefit.
                // `gx-board-column` is what publishes the budget below to the
                // board frame inside it, and globals.css does that from `lg`
                // up only — see the comment there.
                'gx-board-column flex flex-col gap-3 w-full lg:shrink-0 lg:max-w-[var(--gx-board-budget)]',
                boardColumnClassName,
              )}
              // The height budget: what is left of the viewport once this
              // shell's own chrome and the column's cards are paid for. It caps
              // the column (a column wider than the board it holds would
              // stretch the player cards past the board's edges) and, through
              // `gx-board-column`, the board frame itself.
              //
              // No flat `svh` term here. This number already IS the height the
              // board may have; adding `80svh` next to it only made a screen
              // with no player cards — puzzles, analysis, a lesson — settle for
              // 80% of the viewport while this budget offered ~91%.
              style={{
                '--gx-board-budget': `min(calc(100svh - ${reservedPx}px), ${boardMaxPx}px)`,
                // Read below `lg` only, and only on a screen with rows under the
                // board (`data-phone-fit`; see globals.css).
                '--gx-board-budget-phone': `max(calc(100svh - ${phoneReservedPx}px), ${PHONE_BOARD_FLOOR_PX}px)`,
              } as React.CSSProperties}
              data-phone-fit={actions || moveStrip ? '' : undefined}
            >
              {topCard}
              {topExtras}
              {board}
              {bottomCard}
              {!wide && actions}
              {!wide && moveStrip}
            </div>
            {/* The sidebar takes what the board leaves: at least 280px, at most
                460px. The board column's much larger grow factor means it fills
                first, up to its cap, and the sidebar absorbs the rest. */}
            <div
              id={GAME_SIDEBAR_ID}
              className="w-full lg:grow lg:basis-[280px] lg:min-w-[280px] lg:max-w-[460px] flex flex-col gap-3 lg:min-h-0 lg:h-full scroll-mt-4"
            >
              {sidebar}
              {wide && actions}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
