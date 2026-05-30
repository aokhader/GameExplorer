import type { ReversiBoard, ReversiColor } from './types';
import {
  positionToCoordinates,
  coordinatesToPosition,
  isValidCoordinates,
  getDiscAt,
} from './utils';

/** All 8 directions a flip can propagate */
const DIRECTIONS = [
  { dr:  0, dc:  1 },
  { dr:  0, dc: -1 },
  { dr:  1, dc:  0 },
  { dr: -1, dc:  0 },
  { dr:  1, dc:  1 },
  { dr:  1, dc: -1 },
  { dr: -1, dc:  1 },
  { dr: -1, dc: -1 },
];

/**
 * Returns every position that would be flipped if `color` places at `position`.
 * An empty result means the move is illegal.
 */
export function getFlips(
  board: ReversiBoard,
  position: string,
  color: ReversiColor,
): string[] {
  // The target square must be empty
  if (getDiscAt(board, position) !== null) return [];

  const { row, col } = positionToCoordinates(position);
  const opponent = color === 'black' ? 'white' : 'black';
  const flipped: string[] = [];

  for (const { dr, dc } of DIRECTIONS) {
    const lineFlips: string[] = [];
    let r = row + dr;
    let c = col + dc;

    // Walk along this direction collecting opponent discs
    while (isValidCoordinates({ row: r, col: c })) {
      const pos = coordinatesToPosition({ row: r, col: c });
      const disc = getDiscAt(board, pos);

      if (disc === null) break;          // gap — not a valid line
      if (disc.color === opponent) {
        lineFlips.push(pos);             // opponent disc in the line
      } else {
        // Found our own disc — the line is valid if we captured something
        if (lineFlips.length > 0) flipped.push(...lineFlips);
        break;
      }

      r += dr;
      c += dc;
    }
  }

  return flipped;
}

/** Returns all positions where `color` can legally place a disc. */
export function getAllLegalPositions(board: ReversiBoard, color: ReversiColor): string[] {
  const legal: string[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] !== null) continue;
      const pos = coordinatesToPosition({ row, col });
      if (getFlips(board, pos, color).length > 0) {
        legal.push(pos);
      }
    }
  }
  return legal;
}
