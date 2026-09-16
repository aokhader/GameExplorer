import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Default edge cap in px. Generous on purpose: the board is the page, and the
 * layout's own height budget (`GameScreenLayout`'s `--gx-board-cap`) is what
 * binds on an ordinary desktop. At 680 the frame stopped a tablet's board 88px
 * short of the width chess.com and lichess fill.
 */
export const BOARD_MAX_PX = 880;

/** Default edge cap as a fraction of the small viewport height. */
export const BOARD_VH_CAP = 80;

export interface BoardFrameProps {
  children: React.ReactNode;
  /** Upper bound on the board's edge length, in px. */
  maxPx?: number;
  /** Upper bound on the board's edge length, as a fraction of the small viewport height. */
  vhCap?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The single sizing contract every board obeys.
 *
 * Width = min(vhCap·svh, maxPx, 100%) with a square aspect ratio. The three
 * terms guarantee the board never overflows on EITHER axis:
 *   - `100%`        → never wider than its (padded) container → no horizontal scroll
 *   - `vhCap·svh`   → never taller than the viewport → no clipping in a stacked
 *                     mobile layout or short landscape (svh = small viewport
 *                     height, stable across mobile browser-chrome show/hide)
 *   - `maxPx`       → never larger than is comfortable on a wide desktop
 *                     (`BOARD_MAX_PX`: the board is the page, so this is
 *                     deliberately generous — the layout's own height budget is
 *                     what usually binds first)
 *
 * The square `aspect-ratio` reserves space so the layout doesn't shift while a
 * board is empty/loading. `mx-auto` keeps it centered in any parent.
 *
 * Boards render their 8×8 grid as a `w-full h-full` child of this frame.
 */
export const BoardFrame = React.forwardRef<HTMLDivElement, BoardFrameProps>(function BoardFrame(
  { children, maxPx = BOARD_MAX_PX, vhCap = BOARD_VH_CAP, className, style },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('relative mx-auto', className)}
      style={{
        width: `min(${vhCap}svh, ${maxPx}px, 100%)`,
        aspectRatio: '1 / 1',
        ...style,
      }}
    >
      {children}
    </div>
  );
});
