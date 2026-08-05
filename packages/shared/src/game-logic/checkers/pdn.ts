// Portable Draughts Notation — the numbered-square move text used by tournament
// play and .pdn game files ("11-15", "22x15", "18x25x32").

import { positionToCoordinates, coordinatesToPosition, isDarkSquare } from './utils';
import type { CheckersMove } from './types';

/**
 * PDN square number (1–32) for an algebraic position, or null if the square
 * isn't playable.
 *
 * PDN numbers only the dark squares, left to right along each row starting from
 * Black's back rank. Black's home rows are 8/7/6 here, so `a8` is 1 and the
 * invariant holds: Black opens on 1–12 and White on 21–32.
 *
 *     a8 c8 e8 g8  ->   1  2  3  4
 *     b7 d7 f7 h7  ->   5  6  7  8
 *     ...
 *     b1 d1 f1 h1  ->  29 30 31 32
 */
export function toPdnSquare(position: string): number | null {
  const { row, col } = positionToCoordinates(position);
  if (row < 0 || row > 7 || col < 0 || col > 7) return null;
  if (!isDarkSquare(row, col)) return null;
  // `row` counts up from rank 1; PDN counts down from rank 8.
  const rowFromTop = 7 - row;
  // Playable columns alternate parity per row, so every row's four squares land
  // on distinct halves — integer-dividing the file gives 0..3 either way.
  return rowFromTop * 4 + Math.floor(col / 2) + 1;
}

/**
 * Algebraic position for a PDN square number (1–32), or null if the number is
 * out of range. Inverse of `toPdnSquare`.
 *
 * The four playable squares of a row occupy either the odd or the even files
 * depending on the row's parity, so recovering the file means picking the one
 * of `2k` / `2k+1` that lands on a dark square.
 */
export function fromPdnSquare(square: number): string | null {
  if (!Number.isInteger(square) || square < 1 || square > 32) return null;
  const index = square - 1;
  const rowFromTop = Math.floor(index / 4);
  const row = 7 - rowFromTop;
  const col = (index % 4) * 2 + (row % 2 === 0 ? 1 : 0);
  return coordinatesToPosition({ row, col });
}

/**
 * PDN for one move: `-` between the squares of a quiet move, `x` for a jump.
 * Multi-jumps list every landing square in order ("18x25x32"), which is how PDN
 * disambiguates a chain that could have been taken by more than one route.
 *
 * Kinging carries no marker in PDN — the move simply ends on the back rank.
 */
export function toPdn(move: CheckersMove): string {
  const square = (pos: string) => toPdnSquare(pos) ?? pos;
  if (move.captures.length === 0) return `${square(move.from)}-${square(move.to)}`;
  // `path` holds the landing squares in jump order, `from` is not part of it.
  return [move.from, ...move.path].map(square).join('x');
}

/** PDN for a whole game, one string per move played. */
export function moveHistoryToPdn(moves: CheckersMove[]): string[] {
  return moves.map(toPdn);
}
