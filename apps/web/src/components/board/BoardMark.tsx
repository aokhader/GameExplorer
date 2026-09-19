'use client';

import React from 'react';
import type { LessonMark } from '@gameexplorer/shared';

/**
 * One coached annotation, drawn inside a board square.
 *
 * Written once and rendered by all four boards rather than five times in
 * different colours, because the whole value of a mark vocabulary is that
 * `danger` means the same thing on a chess square and a Go intersection. Every
 * board's square is already a positioned container, so this only has to fill it.
 *
 * The five kinds come from `LessonMark`, which extends `DiagramHighlight`'s four
 * with `danger`:
 *
 * - `target` — play here. An emerald ring, the strongest cue on the board.
 * - `origin` — this piece, or where it came from. An amber tint.
 * - `move`   — a possible destination. The same ghost dot the boards already
 *              use for a legal move, so it reads identically.
 * - `capture`— something comes off here. The red ring the boards already use.
 * - `danger` — do NOT play here. A red wash, deliberately unlike `capture`.
 *
 * `text` is one or two characters written over the square — the treatment the
 * static Go diagrams already use for liberty counts and move numbers.
 *
 * **The ring and the label sit in different layers, on purpose.** The boards
 * draw their pieces in a `.piece-layer` above the squares (`z-index: 3`), and a
 * mark has to straddle it: a tint or a ring belongs *under* the piece, because
 * covering the piece would hide the thing the mark is about, while a written
 * label belongs *over* it, because a number on a stone is worth nothing if a
 * stone is drawn on top of it.
 *
 * Pointer events are off throughout: a mark is a drawing, and the square
 * underneath it still has to be clickable.
 */

const RING: Record<LessonMark['kind'], string> = {
  target: 'ring-2 ring-emerald-400/90 bg-emerald-400/15',
  origin: 'ring-2 ring-amber-300/80 bg-amber-300/15',
  danger: 'ring-2 ring-red-500/80 bg-red-500/20',
  capture: 'ring-2 ring-red-400/90',
  move: '',
};

export function BoardMark({ mark, round = false }: { mark: LessonMark; round?: boolean }) {
  const shape = round ? 'rounded-full' : 'rounded-[15%]';

  return (
    <>
      {/* Under the pieces. */}
      <div
        className="absolute inset-0 pointer-events-none z-[2] flex items-center justify-center"
        data-mark={mark.kind}
        data-mark-square={mark.square}
      >
        {mark.kind === 'move' ? (
          // Still, as on the native board: the mark is already the only
          // emerald dot on the square, so a pulse repeated what it said.
          <div className="w-[28%] h-[28%] rounded-full bg-emerald-300/70" />
        ) : (
          <div className={`absolute inset-[6%] ${shape} ${RING[mark.kind]}`} />
        )}
      </div>

      {/* Over them. `.square` sets no z-index of its own, so this competes in
          the board's stacking context and clears the piece layer at 3. */}
      {mark.text && (
        <span
          className="absolute inset-0 pointer-events-none z-[4] flex items-center justify-center text-[max(9px,32%)] font-bold leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
          data-mark-text={mark.square}
        >
          {mark.text}
        </span>
      )}
    </>
  );
}

/**
 * Marks keyed by square, so a board can look one up per cell instead of
 * scanning the list 64 times.
 *
 * Last one wins for a repeated square — an author who marks a square twice gets
 * the mark they wrote last, which is the only defensible reading and is not
 * worth a build failure.
 */
export function markMap(marks: readonly LessonMark[] | undefined): Map<string, LessonMark> {
  const map = new Map<string, LessonMark>();
  for (const mark of marks ?? []) map.set(mark.square, mark);
  return map;
}
