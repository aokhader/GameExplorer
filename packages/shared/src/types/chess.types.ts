// Core chess type definitions used across frontend and backend

/**
 * Chess piece types
 */
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

/**
 * Player colors
 */
export type Color = 'white' | 'black';

/**
 * Chess piece representation
 */
export interface Piece {
  type: PieceType;
  color: Color;
}

/**
 * Board position using algebraic notation
 * Examples: 'a1', 'e4', 'h8'
 */
export type Position = string;

/**
 * Square coordinates (0-indexed)
 */
export interface Coordinates {
  row: number; // 0-7 (0 = rank 1, 7 = rank 8)
  col: number; // 0-7 (0 = file a, 7 = file h)
}

/**
 * Chess move representation
 */
export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  capturedPiece?: Piece;
  promotion?: PieceType; // For pawn promotion
  isEnPassant?: boolean;
  isCastling?: boolean;
  castlingSide?: 'kingside' | 'queenside';
  isCheck?: boolean;
  isCheckmate?: boolean;
}

/**
 * Castling rights
 */
export interface CastlingRights {
  whiteKingSide: boolean;
  whiteQueenSide: boolean;
  blackKingSide: boolean;
  blackQueenSide: boolean;
}

/**
 * Complete chess board state
 * 8x8 array where null = empty square
 */
export type Board = (Piece | null)[][];

/**
 * Full game state
 */
export interface ChessGameState {
  board: Board;
  currentTurn: Color;
  moveHistory: Move[];
  castlingRights: CastlingRights;
  enPassantTarget: Position | null; // Square where en passant is possible
  halfMoveClock: number; // Moves since last capture or pawn move (for 50-move rule)
  fullMoveNumber: number; // Increments after black's move
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
}

/**
 * Move validation result
 */
export interface MoveValidationResult {
  valid: boolean;
  reason?: string;
  resultingState?: ChessGameState;
}

/**
 * FEN (Forsyth-Edwards Notation) string
 * Standard notation for describing chess positions
 */
export type FEN = string;