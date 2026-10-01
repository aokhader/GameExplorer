/**
 * Reversi squares as bit sets, for the bot's search.
 *
 * `moves.ts` answers one question at a time with strings and objects, which is
 * right for the game and far too slow for a search that asks it hundreds of
 * thousands of times a move. Here a set of squares is two 32-bit halves, so a
 * whole side's legal moves come out of a few dozen shifts.
 *
 * Square `row * 8 + col` is bit `row * 8 + col` (a1 = 0, h1 = 7, a8 = 56):
 * `lo` holds ranks 1–4, `hi` ranks 5–8. Counting up through the bits is the
 * order `getAllLegalPositions` scans the board in, which the search relies on
 * to visit moves in the same order as before.
 *
 * Results that are a set come back through an `out` record rather than a fresh
 * object, because the search calls these for every node.
 */

import type { ReversiBoard } from './types';
import { positionToCoordinates } from './utils';

/** A set of squares: bits 0–31 and 32–63. */
export interface SquareSet {
  lo: number;
  hi: number;
}

/** Every square but the a-file / the h-file: what a shift may not wrap into. */
const NOT_A_FILE = 0xfefefefe | 0;
const NOT_H_FILE = 0x7f7f7f7f;
const ALL = -1;
/** Files b–g. An opponent disc on the a- or h-file never sits between two others across a row. */
const INNER = 0x7e7e7e7e;

/**
 * The four step sizes. Stepping by `+k` goes towards h8: +1 east, +7
 * north-west, +8 north, +9 north-east; `-k` is the opposite direction.
 */
const STEPS = [1, 7, 8, 9];
/** Squares a step may land on without having wrapped around the board's edge. */
const UP_MASK = [NOT_A_FILE, NOT_H_FILE, ALL, NOT_A_FILE];
const DOWN_MASK = [NOT_H_FILE, NOT_A_FILE, ALL, NOT_H_FILE];

/** The number of set bits in a 32-bit half. */
export function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/**
 * Every empty square where the side with discs `p` can play against discs `o`:
 * the same squares as `getAllLegalPositions`.
 *
 * For each direction, grow the run of `o` discs that starts next to a `p` disc
 * (at most six can lie between two others), then step once more onto an empty
 * square.
 */
export function legalMoves(pl: number, ph: number, ol: number, oh: number, out: SquareSet): void {
  const el = ~(pl | ol);
  const eh = ~(ph | oh);
  const il = ol & INNER;
  const ih = oh & INNER;
  let ml = 0;
  let mh = 0;

  for (let d = 0; d < 4; d++) {
    const k = STEPS[d];
    const r = 32 - k;
    // Only a vertical step cannot wrap, so only it may run through the edge files.
    const wl = k === 8 ? ol : il;
    const wh = k === 8 ? oh : ih;

    // Towards h8: bit i -> i + k. The high half takes the low half's carry.
    // The five growth steps are written out. Hermes interprets, and under an
    // interpreter (node --jitless) a loop around them cost a sixth of the
    // search's time.
    let tl = (pl << k) & wl;
    let th = ((ph << k) | (pl >>> r)) & wh;
    th |= ((th << k) | (tl >>> r)) & wh; tl |= (tl << k) & wl;
    th |= ((th << k) | (tl >>> r)) & wh; tl |= (tl << k) & wl;
    th |= ((th << k) | (tl >>> r)) & wh; tl |= (tl << k) & wl;
    th |= ((th << k) | (tl >>> r)) & wh; tl |= (tl << k) & wl;
    th |= ((th << k) | (tl >>> r)) & wh; tl |= (tl << k) & wl;
    ml |= (tl << k) & el;
    mh |= ((th << k) | (tl >>> r)) & eh;

    // Towards a1: bit i -> i - k. The low half takes the high half's carry.
    tl = ((pl >>> k) | (ph << r)) & wl;
    th = (ph >>> k) & wh;
    tl |= ((tl >>> k) | (th << r)) & wl; th |= (th >>> k) & wh;
    tl |= ((tl >>> k) | (th << r)) & wl; th |= (th >>> k) & wh;
    tl |= ((tl >>> k) | (th << r)) & wl; th |= (th >>> k) & wh;
    tl |= ((tl >>> k) | (th << r)) & wl; th |= (th >>> k) & wh;
    tl |= ((tl >>> k) | (th << r)) & wl; th |= (th >>> k) & wh;
    ml |= ((tl >>> k) | (th << r)) & el;
    mh |= (th >>> k) & eh;
  }

  out.lo = ml;
  out.hi = mh;
}

/**
 * The discs that turn over when the side with discs `p` plays `square` against
 * discs `o`: the same squares as `getFlips`, for a square that is empty.
 */
export function flips(
  square: number,
  pl: number,
  ph: number,
  ol: number,
  oh: number,
  out: SquareSet,
): void {
  const sl = square < 32 ? 1 << square : 0;
  const sh = square < 32 ? 0 : 1 << (square - 32);
  let fl = 0;
  let fh = 0;

  for (let d = 0; d < 4; d++) {
    const k = STEPS[d];
    const r = 32 - k;

    // Towards h8: walk over the opponent's discs; they flip if ours ends the line.
    let m = UP_MASK[d];
    let xl = (sl << k) & m;
    let xh = ((sh << k) | (sl >>> r)) & m;
    let ll = 0;
    let lh = 0;
    while (((xl & ol) | (xh & oh)) !== 0) {
      ll |= xl;
      lh |= xh;
      const nl = (xl << k) & m;
      xh = ((xh << k) | (xl >>> r)) & m;
      xl = nl;
    }
    if (((xl & pl) | (xh & ph)) !== 0) {
      fl |= ll;
      fh |= lh;
    }

    // Towards a1.
    m = DOWN_MASK[d];
    xl = ((sl >>> k) | (sh << r)) & m;
    xh = (sh >>> k) & m;
    ll = 0;
    lh = 0;
    while (((xl & ol) | (xh & oh)) !== 0) {
      ll |= xl;
      lh |= xh;
      const nl = ((xl >>> k) | (xh << r)) & m;
      xh = (xh >>> k) & m;
      xl = nl;
    }
    if (((xl & pl) | (xh & ph)) !== 0) {
      fl |= ll;
      fh |= lh;
    }
  }

  out.lo = fl;
  out.hi = fh;
}

/** Black's and White's discs on `board`. */
export function boardToBits(board: ReversiBoard): { black: SquareSet; white: SquareSet } {
  const black: SquareSet = { lo: 0, hi: 0 };
  const white: SquareSet = { lo: 0, hi: 0 };
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const disc = board[row][col];
      if (!disc) continue;
      const set = disc.color === 'black' ? black : white;
      const sq = row * 8 + col;
      if (sq < 32) set.lo |= 1 << sq;
      else set.hi |= 1 << (sq - 32);
    }
  }
  return { black, white };
}

/** `'a1'` -> 0 … `'h8'` -> 63. */
export function squareIndex(position: string): number {
  const { row, col } = positionToCoordinates(position);
  return row * 8 + col;
}
