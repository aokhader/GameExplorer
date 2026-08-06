'use client';

import { useRef, useState, type RefObject } from 'react';

/**
 * Pointer-driven piece dragging for a square board.
 *
 * Pointer events rather than the HTML5 drag-and-drop API, which the checkers
 * board used to use and which is wrong here on two counts: it imposes its own
 * activation delay before a drag starts, and **it does not fire on touch at
 * all**, so a phone browser got a click-only board. Pointer events cover mouse,
 * touch and pen with the same code and start moving on the first pixel.
 *
 * The hook owns the mechanics — pointer capture, hit-testing, and moving the
 * floating ghost imperatively so React never re-renders the board mid-drag.
 * What a drop *means* is the board's business, and comes back through `onDrop`.
 */
export interface BoardDragOptions {
  /** The element the pointer is captured on and hit-tested against. */
  boardRef: RefObject<HTMLDivElement | null>;
  /** The floating copy under the cursor. Positioned imperatively. */
  ghostRef: RefObject<HTMLDivElement | null>;
  /** Screen point → square, or null when off-board. */
  squareAt: (clientX: number, clientY: number) => string | null;
  /**
   * How much of a square the piece occupies, so the ghost matches what was
   * picked up instead of jumping to full square size.
   */
  pieceRatio?: number;
  /** Called once the drag is committed to. */
  onPickUp?: (from: string) => void;
  /** `to` is null when the pointer was released off the board. */
  onDrop: (from: string, to: string | null) => void;
}

export interface BoardDrag {
  /** The square a piece is currently lifted from, if any. */
  from: string | null;
  /** Attach to a square's `onPointerDown`. Pass the square it represents. */
  start: (from: string) => (e: React.PointerEvent) => void;
  /** Spread onto the board element. */
  boardHandlers: {
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: () => void;
  };
}

export function useBoardDrag({
  boardRef,
  ghostRef,
  squareAt,
  pieceRatio = 1,
  onPickUp,
  onDrop,
}: BoardDragOptions): BoardDrag {
  const [from, setFrom] = useState<string | null>(null);
  // Mirrored synchronously: a pointerup can arrive before React has flushed the
  // setState from the pointerdown that started the drag, and reading render
  // state there would see null and drop the move on the floor.
  const fromRef = useRef<string | null>(null);
  const halfRef = useRef(0);

  const place = (clientX: number, clientY: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.left = `${clientX - halfRef.current}px`;
    ghost.style.top = `${clientY - halfRef.current}px`;
  };

  const end = () => {
    fromRef.current = null;
    setFrom(null);
  };

  return {
    from,
    start: (square: string) => (e: React.PointerEvent) => {
      if (e.button !== 0) return; // left button / primary touch only
      e.preventDefault();

      // Route the rest of the gesture to the board even once the pointer
      // leaves it, so a drop off the edge still resolves.
      boardRef.current?.setPointerCapture(e.pointerId);

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const size = rect.width * pieceRatio;
      halfRef.current = size / 2;

      const ghost = ghostRef.current;
      if (ghost) {
        ghost.style.width = `${size}px`;
        ghost.style.height = `${size}px`;
      }
      place(e.clientX, e.clientY);

      fromRef.current = square;
      setFrom(square);
      onPickUp?.(square);
    },
    boardHandlers: {
      onPointerMove: (e) => {
        if (!fromRef.current) return;
        e.preventDefault();
        place(e.clientX, e.clientY);
      },
      onPointerUp: (e) => {
        const origin = fromRef.current;
        if (!origin) return;
        e.preventDefault();
        end();
        onDrop(origin, squareAt(e.clientX, e.clientY));
      },
      onPointerCancel: () => {
        // The OS took the gesture — an incoming call, a system sheet.
        if (fromRef.current) end();
      },
    },
  };
}
