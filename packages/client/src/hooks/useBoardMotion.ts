// Turns two consecutive positions into per-square offsets a board can animate.
//
// The half of board animation that is genuinely shared: `diffBoards` says what
// moved, this decides whether animating is appropriate at all and converts the
// answer into screen-space deltas. What remains after this is a `withTiming` on
// mobile and a CSS transition on web, which is as far as the two platforms can
// usefully agree.
//
// Deliberately free of both DOM and React Native — it returns numbers.

import { useRef } from 'react';
import { type BoardFade, type BoardTransition, diffBoards } from '@gameexplorer/shared';
import type { DiffOptions } from '@gameexplorer/shared';

/** Where a piece should START, relative to where it now sits, in squares. */
export interface PieceOffset {
  dx: number;
  dy: number;
}

export interface BoardMotion<P> {
  /** Keyed by the piece's CURRENT square. Absent means "do not animate me". */
  offsets: ReadonlyMap<number, PieceOffset>;
  /** Pieces that left. Draw them at `at` and fade them out. */
  fades: readonly BoardFade<P>[];
  /** Squares whose occupant was replaced in place — reversi flips. */
  changed: ReadonlySet<number>;
  /** Bumped once per animated transition, so a renderer can key effects on it. */
  epoch: number;
}

/** Square key shared with the values in `offsets` and `changed`. */
export function motionKey(row: number, col: number): number {
  return row * 100 + col;
}

const STILL: BoardMotion<never> = {
  offsets: new Map(),
  fades: [],
  changed: new Set(),
  epoch: 0,
};

export interface BoardMotionOptions<P> extends DiffOptions<P> {
  /**
   * How many moves have been played into this position. Animating is only
   * honest between consecutive positions, and this is what tells them apart: a
   * step forward is exactly one more move than the last board we saw. Anything
   * else — loading a new puzzle, seeking back through history, a retry, a fresh
   * game — is a jump, and every piece would swim to its new square.
   */
  historyLength: number;
  /** Board is drawn from the opponent's side, so screen deltas invert. */
  isFlipped?: boolean;
  /** False snaps everything. Pass the user's reduced-motion preference. */
  enabled?: boolean;
  /** Squares per side. All three games are 8. */
  size?: number;
}

/**
 * Compute the animation offsets for the position currently being rendered.
 *
 * Returns stable objects: the work happens only when the board identity
 * actually changes, and calling this twice for the same board — which React
 * does under StrictMode — produces the same result rather than eating the
 * transition.
 */
export function useBoardMotion<P>(
  board: readonly (readonly (P | null)[])[] | null | undefined,
  { historyLength, isFlipped = false, enabled = true, size = 8, ...diff }: BoardMotionOptions<P>,
): BoardMotion<P> {
  const seen = useRef<{
    board: readonly (readonly (P | null)[])[] | null | undefined;
    historyLength: number;
    isFlipped: boolean;
    motion: BoardMotion<P>;
  } | null>(null);

  const last = seen.current;

  // Same board object as last render: nothing new happened, and recomputing
  // would only risk replaying an animation that has already run.
  if (last && last.board === board && last.isFlipped === isFlipped) return last.motion;

  const isStep =
    !!last && last.board != null && board != null && historyLength === last.historyLength + 1;

  // A flip re-draws every piece at a new screen position without a move having
  // been played. Sliding them there would be a lie, and a busy one.
  const flipped = !!last && last.isFlipped !== isFlipped;

  let motion = STILL as BoardMotion<P>;

  if (enabled && isStep && !flipped) {
    const transition = diffBoards(last!.board, board, diff);
    motion = toMotion(transition, isFlipped, size, (last?.motion.epoch ?? 0) + 1);
  }

  seen.current = { board, historyLength, isFlipped, motion };
  return motion;
}

function toMotion<P>(
  t: BoardTransition<P>,
  isFlipped: boolean,
  size: number,
  epoch: number,
): BoardMotion<P> {
  const offsets = new Map<number, PieceOffset>();
  const edge = size - 1;

  for (const move of t.moves) {
    // Screen space, not board space: on a flipped board a piece travelling up
    // the ranks travels down the screen.
    const fromCol = isFlipped ? edge - move.from.col : move.from.col;
    const toCol = isFlipped ? edge - move.to.col : move.to.col;
    const fromRow = isFlipped ? move.from.row : edge - move.from.row;
    const toRow = isFlipped ? move.to.row : edge - move.to.row;

    offsets.set(motionKey(move.to.row, move.to.col), {
      dx: fromCol - toCol,
      dy: fromRow - toRow,
    });
  }

  return {
    offsets,
    fades: t.fades,
    changed: new Set(t.changes.map((c) => motionKey(c.row, c.col))),
    epoch,
  };
}
