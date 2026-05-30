import type { CheckersBoard, CheckersPiece, CheckersGameState, CheckersColor } from './types';

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

/** Checkers pieces only occupy dark squares: (row + col) % 2 === 1 */
export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

export function getPieceAt(board: CheckersBoard, position: string): CheckersPiece | null {
  const { row, col } = positionToCoordinates(position);
  return board[row]?.[col] ?? null;
}

export function setPieceAt(
  board: CheckersBoard,
  position: string,
  piece: CheckersPiece | null,
): CheckersBoard {
  const { row, col } = positionToCoordinates(position);
  const newBoard = board.map(r => [...r]);
  newBoard[row][col] = piece;
  return newBoard;
}

export function cloneGameState(state: CheckersGameState): CheckersGameState {
  return {
    ...state,
    board: state.board.map(row => [...row]),
    moveHistory: [...state.moveHistory],
  };
}

export function getOpponentColor(color: CheckersColor): CheckersColor {
  return color === 'white' ? 'black' : 'white';
}

export function createInitialBoard(): CheckersBoard {
  const board: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));

  // White pieces on rows 0–2 (ranks 1–3), dark squares only
  for (let row = 0; row <= 2; row++) {
    for (let col = 0; col < 8; col++) {
      if (isDarkSquare(row, col)) {
        board[row][col] = { type: 'man', color: 'white' };
      }
    }
  }

  // Black pieces on rows 5–7 (ranks 6–8), dark squares only
  for (let row = 5; row <= 7; row++) {
    for (let col = 0; col < 8; col++) {
      if (isDarkSquare(row, col)) {
        board[row][col] = { type: 'man', color: 'black' };
      }
    }
  }

  return board;
}

export function createInitialGameState(): CheckersGameState {
  return {
    board: createInitialBoard(),
    currentTurn: 'white',
    moveHistory: [],
    isGameOver: false,
    winner: null,
    movesSinceCapture: 0,
  };
}
