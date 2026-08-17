import type { GoBoard, GoColor, GoGameState } from './types';
import { DEFAULT_KOMI, GO_BOARD_SIZE } from './types';

export interface Coordinates { row: number; col: number }

/**
 * `'a1'` → `{ row: 0, col: 0 }`. The rank is parsed off the whole tail rather
 * than a single character so the same helper keeps working at 13×13 and 19×19,
 * where ranks reach two digits.
 */
export function positionToCoordinates(position: string): Coordinates {
  const col = position.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(position.slice(1), 10) - 1;
  return { row, col };
}

export function coordinatesToPosition(coords: Coordinates): string {
  return String.fromCharCode('a'.charCodeAt(0) + coords.col) + (coords.row + 1);
}

export function isValidCoordinates(coords: Coordinates, size: number): boolean {
  return coords.row >= 0 && coords.row < size && coords.col >= 0 && coords.col < size;
}

export function isValidPosition(position: string, size: number): boolean {
  if (!/^[a-z]\d+$/.test(position)) return false;
  return isValidCoordinates(positionToCoordinates(position), size);
}

export function getStoneAt(board: GoBoard, position: string): GoColor | null {
  const { row, col } = positionToCoordinates(position);
  return board[row]?.[col] ?? null;
}

export function getOpponentColor(color: GoColor): GoColor {
  return color === 'black' ? 'white' : 'black';
}

export function cloneGameState(state: GoGameState): GoGameState {
  return {
    ...state,
    board: state.board.map(row => [...row]),
    moveHistory: [...state.moveHistory],
    captured: { ...state.captured },
    positionKeys: [...state.positionKeys],
  };
}

/**
 * A whole board position as one string — `.` empty, `b` black, `w` white, read
 * row by row. This is the superko key: two positions are the same position
 * exactly when their keys match.
 *
 * Deliberately not a numeric hash. A hash would need collision handling to stay
 * correct, and at 9×9 the string is 81 characters — cheap to build, cheap to
 * compare, and trivially inspectable in a failing test.
 */
export function boardKey(board: GoBoard): string {
  let key = '';
  for (const row of board) {
    for (const cell of row) {
      key += cell === null ? '.' : cell === 'black' ? 'b' : 'w';
    }
  }
  return key;
}

export function createEmptyBoard(size: number = GO_BOARD_SIZE): GoBoard {
  return Array.from({ length: size }, () => Array<GoColor | null>(size).fill(null));
}

export interface NewGoGameOptions {
  size?: number;
  komi?: number;
}

export function createInitialGameState(options: NewGoGameOptions = {}): GoGameState {
  const size = options.size ?? GO_BOARD_SIZE;
  const board = createEmptyBoard(size);
  return {
    size,
    komi: options.komi ?? DEFAULT_KOMI,
    board,
    currentTurn: 'black', // Black plays first in Go
    moveHistory: [],
    captured: { black: 0, white: 0 },
    // The empty board is itself a position that has occurred, so the superko
    // rule is complete from move one rather than from move two.
    positionKeys: [boardKey(board)],
    consecutivePasses: 0,
    isGameOver: false,
    winner: null,
  };
}
