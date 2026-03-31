// Move generation for each chess piece type

import type { Board, Position, Coordinates, Piece, Color } from '../../types/chess.types';
import {
  positionToCoordinates,
  coordinatesToPosition,
  isValidCoordinates,
  getPieceAt,
} from './utils';

/**
 * Get all possible moves for a piece at a given position
 * Does NOT check for check/checkmate - just raw legal moves
 */
export function getPossibleMoves(
  board: Board,
  position: Position,
  includeCaptures: boolean = true
): Position[] {
  const piece = getPieceAt(board, position);
  if (!piece) return [];

  switch (piece.type) {
    case 'pawn':
      return getPawnMoves(board, position, piece.color);
    case 'knight':
      return getKnightMoves(board, position, piece.color);
    case 'bishop':
      return getBishopMoves(board, position, piece.color);
    case 'rook':
      return getRookMoves(board, position, piece.color);
    case 'queen':
      return getQueenMoves(board, position, piece.color);
    case 'king':
      return getKingMoves(board, position, piece.color);
    default:
      return [];
  }
}

/**
 * Pawn moves (most complex piece!)
 */
function getPawnMoves(board: Board, position: Position, color: Color): Position[] {
  const moves: Position[] = [];
  const coords = positionToCoordinates(position);
  const direction = color === 'white' ? 1 : -1; // White moves up, black moves down
  const startRank = color === 'white' ? 1 : 6;

  // Forward move (1 square)
  const forwardOne = { row: coords.row + direction, col: coords.col };
  if (isValidCoordinates(forwardOne)) {
    const forwardPos = coordinatesToPosition(forwardOne);
    const pieceAhead = getPieceAt(board, forwardPos);
    if (!pieceAhead) {
      moves.push(forwardPos);

      // Forward move (2 squares from starting position)
      if (coords.row === startRank) {
        const forwardTwo = { row: coords.row + direction * 2, col: coords.col };
        const forwardTwoPos = coordinatesToPosition(forwardTwo);
        const pieceTwoAhead = getPieceAt(board, forwardTwoPos);
        if (!pieceTwoAhead) {
          moves.push(forwardTwoPos);
        }
      }
    }
  }

  // Diagonal captures
  const captureDirections = [
    { row: coords.row + direction, col: coords.col - 1 }, // Left diagonal
    { row: coords.row + direction, col: coords.col + 1 }, // Right diagonal
  ];

  for (const captureCoords of captureDirections) {
    if (isValidCoordinates(captureCoords)) {
      const capturePos = coordinatesToPosition(captureCoords);
      const targetPiece = getPieceAt(board, capturePos);
      if (targetPiece && targetPiece.color !== color) {
        moves.push(capturePos);
      }
    }
  }

  // TODO: En passant (requires game state, will implement later)

  return moves;
}

/**
 * Knight moves (L-shape)
 */
function getKnightMoves(board: Board, position: Position, color: Color): Position[] {
  const moves: Position[] = [];
  const coords = positionToCoordinates(position);

  // All 8 possible L-shaped moves
  const knightOffsets = [
    { row: 2, col: 1 },
    { row: 2, col: -1 },
    { row: -2, col: 1 },
    { row: -2, col: -1 },
    { row: 1, col: 2 },
    { row: 1, col: -2 },
    { row: -1, col: 2 },
    { row: -1, col: -2 },
  ];

  for (const offset of knightOffsets) {
    const targetCoords = {
      row: coords.row + offset.row,
      col: coords.col + offset.col,
    };

    if (isValidCoordinates(targetCoords)) {
      const targetPos = coordinatesToPosition(targetCoords);
      const targetPiece = getPieceAt(board, targetPos);

      // Empty square or opponent's piece
      if (!targetPiece || targetPiece.color !== color) {
        moves.push(targetPos);
      }
    }
  }

  return moves;
}

/**
 * Bishop moves (diagonals)
 */
function getBishopMoves(board: Board, position: Position, color: Color): Position[] {
  return getSlidingMoves(board, position, color, [
    { row: 1, col: 1 },   // Up-right
    { row: 1, col: -1 },  // Up-left
    { row: -1, col: 1 },  // Down-right
    { row: -1, col: -1 }, // Down-left
  ]);
}

/**
 * Rook moves (straight lines)
 */
function getRookMoves(board: Board, position: Position, color: Color): Position[] {
  return getSlidingMoves(board, position, color, [
    { row: 1, col: 0 },  // Up
    { row: -1, col: 0 }, // Down
    { row: 0, col: 1 },  // Right
    { row: 0, col: -1 }, // Left
  ]);
}

/**
 * Queen moves (combination of bishop + rook)
 */
function getQueenMoves(board: Board, position: Position, color: Color): Position[] {
  return getSlidingMoves(board, position, color, [
    // Diagonals (bishop)
    { row: 1, col: 1 },
    { row: 1, col: -1 },
    { row: -1, col: 1 },
    { row: -1, col: -1 },
    // Straight (rook)
    { row: 1, col: 0 },
    { row: -1, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: -1 },
  ]);
}

/**
 * King moves (one square in any direction)
 */
function getKingMoves(board: Board, position: Position, color: Color): Position[] {
  const moves: Position[] = [];
  const coords = positionToCoordinates(position);

  // All 8 surrounding squares
  const kingOffsets = [
    { row: 1, col: 0 },   // Up
    { row: 1, col: 1 },   // Up-right
    { row: 0, col: 1 },   // Right
    { row: -1, col: 1 },  // Down-right
    { row: -1, col: 0 },  // Down
    { row: -1, col: -1 }, // Down-left
    { row: 0, col: -1 },  // Left
    { row: 1, col: -1 },  // Up-left
  ];

  for (const offset of kingOffsets) {
    const targetCoords = {
      row: coords.row + offset.row,
      col: coords.col + offset.col,
    };

    if (isValidCoordinates(targetCoords)) {
      const targetPos = coordinatesToPosition(targetCoords);
      const targetPiece = getPieceAt(board, targetPos);

      // Empty square or opponent's piece
      if (!targetPiece || targetPiece.color !== color) {
        moves.push(targetPos);
      }
    }
  }

  // TODO: Castling (requires game state, will implement later)

  return moves;
}

/**
 * Generic sliding moves (for bishop, rook, queen)
 * Continues in a direction until hitting edge or piece
 */
function getSlidingMoves(
  board: Board,
  position: Position,
  color: Color,
  directions: Coordinates[]
): Position[] {
  const moves: Position[] = [];
  const coords = positionToCoordinates(position);

  for (const direction of directions) {
    let currentCoords = { ...coords };

    while (true) {
      currentCoords = {
        row: currentCoords.row + direction.row,
        col: currentCoords.col + direction.col,
      };

      if (!isValidCoordinates(currentCoords)) {
        break; // Off the board
      }

      const targetPos = coordinatesToPosition(currentCoords);
      const targetPiece = getPieceAt(board, targetPos);

      if (!targetPiece) {
        // Empty square - can move here and continue
        moves.push(targetPos);
      } else if (targetPiece.color !== color) {
        // Opponent's piece - can capture but can't continue
        moves.push(targetPos);
        break;
      } else {
        // Own piece - blocked
        break;
      }
    }
  }

  return moves;
}

/**
 * Check if a square is under attack by the opponent
 */
export function isSquareUnderAttack(
  board: Board,
  position: Position,
  byColor: Color
): boolean {
  const opponentPieces = [];

  // Find all opponent pieces
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === byColor) {
        opponentPieces.push(coordinatesToPosition({ row, col }));
      }
    }
  }

  // Check if any opponent piece can attack this square
  for (const piecePos of opponentPieces) {
    const possibleMoves = getPossibleMoves(board, piecePos);
    if (possibleMoves.includes(position)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if the king is in check
 */
export function isKingInCheck(board: Board, kingColor: Color): boolean {
  // Find king position
  let kingPos: Position | null = null;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.color === kingColor) {
        kingPos = coordinatesToPosition({ row, col });
        break;
      }
    }
    if (kingPos) break;
  }

  if (!kingPos) return false; // No king found (shouldn't happen)

  const opponentColor = kingColor === 'white' ? 'black' : 'white';
  return isSquareUnderAttack(board, kingPos, opponentColor);
}