// Move generation for each chess piece type
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
  includeCaptures: boolean = true,
  enPassantTarget: Position | null = null
): Position[] {
  const piece = getPieceAt(board, position);
  if (!piece) return [];

  switch (piece.type) {
    case 'pawn':
      return getPawnMoves(board, position, piece.color, enPassantTarget);
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
function getPawnMoves(board: Board, position: Position, color: Color, enPassantTarget: Position | null = null): Position[] {
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

  // En passant
  if (enPassantTarget) {
    const epCoords = positionToCoordinates(enPassantTarget);
    for (const captureDir of captureDirections) {
      if (captureDir.row === epCoords.row && captureDir.col === epCoords.col) {
        moves.push(enPassantTarget);
      }
    }
  }

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
 * King moves (one square in any direction + castling)
 */
function getKingMoves(board: Board, position: Position, color: Color): Position[] {
  const moves: Position[] = [];
  const coords = positionToCoordinates(position);

  // All 8 surrounding squares (normal king moves)
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

  // Add castling destinations if king is on starting square
  const row = coords.row;
  const col = coords.col;
  const startRow = color === 'white' ? 0 : 7;
  
  // King must be on e-file (col 4) and starting rank
  if (row === startRow && col === 4) {
    // Kingside castling - king moves to g-file (col 6)
    const kingsideTarget = coordinatesToPosition({ row: startRow, col: 6 });
    moves.push(kingsideTarget);
    
    // Queenside castling - king moves to c-file (col 2)
    const queensideTarget = coordinatesToPosition({ row: startRow, col: 2 });
    moves.push(queensideTarget);
  }
  
  // Note: The engine will validate if castling is actually legal
  // (checking castling rights, pieces between, check conditions, etc.)

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
const KNIGHT_JUMPS: readonly (readonly [number, number])[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const DIAGONAL_RAYS: readonly (readonly [number, number])[] = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const ORTHOGONAL_RAYS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/**
 * Is `position` attacked by `byColor`?
 *
 * Asked from the attacked square outward — is there a knight on a knight
 * square, a pawn on an attacking diagonal, a slider down an open ray — rather
 * than by generating every enemy piece's moves and searching the results. The
 * old form built a `Position[]` of algebraic strings per enemy piece and ran
 * `.includes()` over each, roughly sixteen move generations and sixteen array
 * allocations per call. This is the hottest function in the engine: every
 * legality test for every candidate move in every search node lands here.
 *
 * One deliberate difference, and it is why this is a safe swap: the old version
 * asked what a pawn could *move* to, which is not what a pawn *attacks* — it
 * missed the diagonals when the target square was empty and counted the push
 * square when it wasn't. Neither case was reachable, because the only caller is
 * `isKingInCheck` and the target square always has a king standing on it. This
 * version answers the attack question directly, so it is also correct for the
 * empty squares the old one got wrong.
 */
export function isSquareUnderAttack(
  board: Board,
  position: Position,
  byColor: Color
): boolean {
  const { row, col } = positionToCoordinates(position);
  return isSquareAttackedAt(board, row, col, byColor);
}

/** `isSquareUnderAttack` by coordinates, so hot callers skip the algebraic round trip. */
function isSquareAttackedAt(
  board: Board,
  row: number,
  col: number,
  byColor: Color,
): boolean {
  // A white pawn captures toward rank 8, so one attacking this square stands a
  // rank below it; a black pawn stands a rank above.
  const pawnRow = byColor === 'white' ? row - 1 : row + 1;
  if (pawnRow >= 0 && pawnRow < 8) {
    for (const c of [col - 1, col + 1]) {
      if (c < 0 || c > 7) continue;
      const p = board[pawnRow][c];
      if (p && p.color === byColor && p.type === 'pawn') return true;
    }
  }

  for (const [dr, dc] of KNIGHT_JUMPS) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const p = board[r][c];
    if (p && p.color === byColor && p.type === 'knight') return true;
  }

  for (const [dr, dc] of [...DIAGONAL_RAYS, ...ORTHOGONAL_RAYS]) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const p = board[r][c];
    if (p && p.color === byColor && p.type === 'king') return true;
  }

  for (const rays of [DIAGONAL_RAYS, ORTHOGONAL_RAYS]) {
    const slider = rays === DIAGONAL_RAYS ? 'bishop' : 'rook';
    for (const [dr, dc] of rays) {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = board[r][c];
        if (p) {
          // The first piece on the ray is the only one that can attack along
          // it; anything behind it is blocked.
          if (p.color === byColor && (p.type === slider || p.type === 'queen')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  return false;
}

/**
 * Check if the king is in check
 */
export function isKingInCheck(board: Board, kingColor: Color): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.color === kingColor) {
        const opponentColor = kingColor === 'white' ? 'black' : 'white';
        return isSquareAttackedAt(board, row, col, opponentColor);
      }
    }
  }
  return false; // No king found (shouldn't happen)
}