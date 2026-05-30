import type { ReversiBoard, ReversiDisc, ReversiGameState, ReversiColor } from './types';

export interface Coordinates { row: number; col: number }

export function positionToCoordinates(position: string): Coordinates {
  const col = position.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(position[1]) - 1;
  return { row, col };
}

export function coordinatesToPosition(coords: Coordinates): string {
  return String.fromCharCode('a'.charCodeAt(0) + coords.col) + (coords.row + 1);
}

export function isValidCoordinates(coords: Coordinates): boolean {
  return coords.row >= 0 && coords.row < 8 && coords.col >= 0 && coords.col < 8;
}

export function getDiscAt(board: ReversiBoard, position: string): ReversiDisc | null {
  const { row, col } = positionToCoordinates(position);
  return board[row]?.[col] ?? null;
}

export function setDiscAt(
  board: ReversiBoard,
  position: string,
  disc: ReversiDisc | null,
): ReversiBoard {
  const { row, col } = positionToCoordinates(position);
  const newBoard = board.map(r => [...r]);
  newBoard[row][col] = disc;
  return newBoard;
}

export function cloneGameState(state: ReversiGameState): ReversiGameState {
  return {
    ...state,
    board: state.board.map(row => [...row]),
    moveHistory: [...state.moveHistory],
  };
}

export function getOpponentColor(color: ReversiColor): ReversiColor {
  return color === 'black' ? 'white' : 'black';
}

/**
 * Standard Reversi starting position:
 *   d4 = white, e4 = black
 *   d5 = black, e5 = white
 */
export function createInitialBoard(): ReversiBoard {
  const board: ReversiBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[3][3] = { color: 'white' };
  board[3][4] = { color: 'black' };
  board[4][3] = { color: 'black' };
  board[4][4] = { color: 'white' };
  return board;
}

export function createInitialGameState(): ReversiGameState {
  return {
    board: createInitialBoard(),
    currentTurn: 'black', // black always moves first in Reversi
    moveHistory: [],
    isGameOver: false,
    winner: null,
    consecutivePasses: 0,
  };
}
