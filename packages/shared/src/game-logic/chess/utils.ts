// Utility functions for chess game logic
// Utility functions for chess game logic

import type { Position, Coordinates, Board, Piece, Color, ChessGameState, CastlingRights } from '../../types/chess.types';

/**
 * Convert algebraic notation to coordinates
 * @example positionToCoordinates('e4') => { row: 3, col: 4 }
 */
export function positionToCoordinates(position: Position): Coordinates {
  const file = position.charCodeAt(0) - 'a'.charCodeAt(0); // a=0, b=1, ..., h=7
  const rank = parseInt(position[1]) - 1; // 1=0, 2=1, ..., 8=7
  
  return { row: rank, col: file };
}

/**
 * Convert coordinates to algebraic notation
 * @example coordinatesToPosition({ row: 3, col: 4 }) => 'e4'
 */
export function coordinatesToPosition(coords: Coordinates): Position {
  const file = String.fromCharCode('a'.charCodeAt(0) + coords.col);
  const rank = (coords.row + 1).toString();
  
  return (file + rank) as Position;
}

/**
 * Check if position is valid (on the board)
 */
export function isValidPosition(position: Position): boolean {
  if (position.length !== 2) return false;
  
  const file = position[0];
  const rank = position[1];
  
  return file >= 'a' && file <= 'h' && rank >= '1' && rank <= '8';
}

/**
 * Check if coordinates are valid (on the board)
 */
export function isValidCoordinates(coords: Coordinates): boolean {
  return coords.row >= 0 && coords.row <= 7 && coords.col >= 0 && coords.col <= 7;
}

/**
 * Get piece at position
 */
export function getPieceAt(board: Board, position: Position): Piece | null {
  const coords = positionToCoordinates(position);
  return board[coords.row][coords.col];
}

/**
 * Set piece at position
 */
export function setPieceAt(board: Board, position: Position, piece: Piece | null): Board {
  const newBoard = board.map(row => [...row]); // Deep copy
  const coords = positionToCoordinates(position);
  newBoard[coords.row][coords.col] = piece;
  return newBoard;
}

/**
 * Create initial chess board state
 * FIXED: Each piece is now a unique object to prevent React re-render issues
 */
export function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  // Black pieces (rank 8 and 7)
  board[7] = [
    { type: 'rook', color: 'black' },
    { type: 'knight', color: 'black' },
    { type: 'bishop', color: 'black' },
    { type: 'queen', color: 'black' },
    { type: 'king', color: 'black' },
    { type: 'bishop', color: 'black' },
    { type: 'knight', color: 'black' },
    { type: 'rook', color: 'black' },
  ];
  
  // Array.fill() creates references to the SAME object, causing pieces to disappear
  board[6] = [
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
    { type: 'pawn', color: 'black' },
  ];
  
  // White pieces (rank 1 and 2)
  board[1] = [
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
    { type: 'pawn', color: 'white' },
  ];
  
  board[0] = [
    { type: 'rook', color: 'white' },
    { type: 'knight', color: 'white' },
    { type: 'bishop', color: 'white' },
    { type: 'queen', color: 'white' },
    { type: 'king', color: 'white' },
    { type: 'bishop', color: 'white' },
    { type: 'knight', color: 'white' },
    { type: 'rook', color: 'white' },
  ];
  
  return board;
}

/**
 * Create initial game state
 */
export function createInitialGameState(): ChessGameState {
  return {
    board: createInitialBoard(),
    currentTurn: 'white',
    moveHistory: [],
    castlingRights: {
      whiteKingSide: true,
      whiteQueenSide: true,
      blackKingSide: true,
      blackQueenSide: true,
    },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
  };
}

/**
 * Get opponent color
 */
export function getOpponentColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

/**
 * Find king position on board
 */
export function findKingPosition(board: Board, color: Color): Position | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return coordinatesToPosition({ row, col });
      }
    }
  }
  return null;
}

/**
 * Get all pieces of a specific color
 */
export function getPiecePositions(board: Board, color: Color): Position[] {
  const positions: Position[] = [];
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        positions.push(coordinatesToPosition({ row, col }));
      }
    }
  }
  
  return positions;
}

/**
 * Clone board (deep copy)
 */
export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(piece => piece ? { ...piece } : null));
}

/**
 * Clone game state (deep copy)
 */
export function cloneGameState(state: ChessGameState): ChessGameState {
  return {
    ...state,
    board: cloneBoard(state.board),
    moveHistory: [...state.moveHistory],
    castlingRights: { ...state.castlingRights },
  };
}

/**
 * Convert board to simple string representation (for debugging)
 */
export function boardToString(board: Board): string {
  const pieceSymbols: Record<string, string> = {
    'white-pawn': '♙',
    'white-knight': '♘',
    'white-bishop': '♗',
    'white-rook': '♖',
    'white-queen': '♕',
    'white-king': '♔',
    'black-pawn': '♟',
    'black-knight': '♞',
    'black-bishop': '♝',
    'black-rook': '♜',
    'black-queen': '♛',
    'black-king': '♚',
  };
  
  let result = '  a b c d e f g h\n';
  
  for (let row = 7; row >= 0; row--) {
    result += `${row + 1} `;
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        const key = `${piece.color}-${piece.type}`;
        result += pieceSymbols[key] + ' ';
      } else {
        result += '. ';
      }
    }
    result += `${row + 1}\n`;
  }
  
  result += '  a b c d e f g h\n';
  return result;
}