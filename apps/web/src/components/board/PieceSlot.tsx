'use client';

import React, { useLayoutEffect, useState } from 'react';
import { BOARD_ANIM_MS } from '@gameexplorer/shared';
import type { PieceOffset } from '@gameexplorer/client/hooks/useBoardMotion';

/**
 * One piece, positioned over a square board and animated between squares.
 *
 * Pieces live in their own absolutely-positioned layer rather than inside the
 * square elements, which is what makes movement possible at all: a piece
 * parented to a grid cell cannot travel out of it, and a captured piece is
 * unmounted before it has a chance to fade. This is how chessground does it too.
 *
 * The travel is FLIP — mount at the origin, then move to the real square on the
 * next frame with a transition attached. The transition is deliberately absent
 * on that first paint: present, every piece would slide in from the board's
 * corner on mount.
 *
 * **Styling is entirely inline on purpose.** `ChessBoard.css` is imported by
 * each *route* rather than by the component, so a checkers page has none of it;
 * a shared slot that depended on a stylesheet would work on some boards and
 * silently collapse on others. Positioning owes nothing to CSS classes, so it
 * doesn't take the risk.
 */
export function PieceSlot({
  square,
  col,
  row,
  offset,
  fading = false,
  reducedMotion = false,
  pieceClassName,
  children,
}: {
  /**
   * The square this piece stands on. Not used for layout — that is the
   * transform — but pieces are no longer children of their squares, so this is
   * the only way anything outside can ask "what is on d7", tests included.
   */
  square: string;
  /** Column and row in SCREEN space, already accounting for board flip. */
  col: number;
  row: number;
  /** Where this piece came from, in squares. Null means it did not travel. */
  offset: PieceOffset | null;
  /** A captured piece, drawn where it stood while it fades out. */
  fading?: boolean;
  reducedMotion?: boolean;
  /** Classes for the inner wrapper — each board's own piece treatment. */
  pieceClassName?: string;
  children: React.ReactNode;
}) {
  // Captured at mount and never read from props again. `offset` describes the
  // arrival that created this instance, and on the chess board it goes null a
  // tick later when the optimistic copy is swapped for the parent's confirmed
  // state — which would otherwise cancel the transition mid-flight and snap the
  // piece to its destination.
  const [from] = useState(() => offset);
  const animates = (!!from || fading) && !reducedMotion;
  const [settled, setSettled] = useState(!animates);

  useLayoutEffect(() => {
    if (!animates) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
    // Mount-only by construction: `from` is frozen at creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const travelling = !!from && !settled;
  const x = travelling ? col + from.dx : col;
  const y = travelling ? row + from.dy : row;

  return (
    <div
      data-square={square}
      data-fading={fading ? '' : undefined}
      data-travelling={from && settled ? '' : undefined}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '12.5%',
        height: '12.5%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        willChange: 'transform',
        // Percentages are of the slot's own size, so 100% is exactly one square.
        transform: `translate(${x * 100}%, ${y * 100}%)`,
        opacity: fading ? (settled ? 0 : 1) : undefined,
        // Only once the piece is on its way. On the first paint there is
        // nothing to transition from.
        transition:
          animates && settled
            ? `transform ${BOARD_ANIM_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${BOARD_ANIM_MS}ms linear`
            : undefined,
      }}
    >
      <div
        className={pieceClassName}
        style={{
          width: '90%',
          height: '90%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
