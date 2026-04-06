// Position evaluation for chess bot

import type { ChessGameState, Board, Piece, Color } from '../../../types/chess.types';

/**
 * Evaluate a chess position
 * Positive score = good for white
 * Negative score = good for black
 */
export function evaluatePosition(gameState: ChessGameState): number {
  // Check for game over
  if (gameState.isCheckmate) {
    // Checkmate is worth infinite points for the winner
    return gameState.currentTurn === 'white' ? -100000 : 100000;
  }

  if (gameState.isStalemate || gameState.isDraw) {
    return 0; // Draw
  }

  let score = 0;

  // 1. Material count (most important)
  score += evaluateMaterial(gameState.board);

  // 2. Piece positions (piece-square tables)
  score += evaluatePiecePositions(gameState.board);

  // 3. King safety
  score += evaluateKingSafety(gameState);

  // 4. Mobility (number of legal moves)
  // This is expensive, so only do it occasionally or in endgame
  // score += evaluateMobility(gameState);

  // 5. Pawn structure
  score += evaluatePawnStructure(gameState.board);

  return score;
}

/**
 * Material evaluation - count piece values
 */
function evaluateMaterial(board: Board): number {
  const pieceValues: Record<string, number> = {
    pawn: 100,
    knight: 320,
    bishop: 330,
    rook: 500,
    queen: 900,
    king: 20000, // King is invaluable but needs a score
  };

  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        const value = pieceValues[piece.type] || 0;
        score += piece.color === 'white' ? value : -value;
      }
    }
  }

  return score;
}

/**
 * Piece-square tables - pieces are worth more on certain squares
 */
function evaluatePiecePositions(board: Board): number {
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        const positionValue = getPieceSquareValue(piece, row, col);
        score += piece.color === 'white' ? positionValue : -positionValue;
      }
    }
  }

  return score;
}

/**
 * Get value bonus for piece on a specific square
 */
function getPieceSquareValue(piece: Piece, row: number, col: number): number {
  // Flip row for black pieces (they start at top)
  const effectiveRow = piece.color === 'white' ? row : 7 - row;

  // Pawn table - encourage central pawns and advancement
  const pawnTable = [
    [0,   0,   0,   0,   0,   0,   0,   0],
    [50,  50,  50,  50,  50,  50,  50,  50],
    [10,  10,  20,  30,  30,  20,  10,  10],
    [5,   5,  10,  25,  25,  10,   5,   5],
    [0,   0,   0,  20,  20,   0,   0,   0],
    [5,  -5, -10,   0,   0, -10,  -5,   5],
    [5,  10,  10, -20, -20,  10,  10,   5],
    [0,   0,   0,   0,   0,   0,   0,   0],
  ];

  // Knight table - encourage center control
  const knightTable = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20,   0,   0,   0,   0, -20, -40],
    [-30,   0,  10,  15,  15,  10,   0, -30],
    [-30,   5,  15,  20,  20,  15,   5, -30],
    [-30,   0,  15,  20,  20,  15,   0, -30],
    [-30,   5,  10,  15,  15,  10,   5, -30],
    [-40, -20,   0,   5,   5,   0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ];

  // Bishop table - encourage long diagonals
  const bishopTable = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10,   0,   0,   0,   0,   0,   0, -10],
    [-10,   0,   5,  10,  10,   5,   0, -10],
    [-10,   5,   5,  10,  10,   5,   5, -10],
    [-10,   0,  10,  10,  10,  10,   0, -10],
    [-10,  10,  10,  10,  10,  10,  10, -10],
    [-10,   5,   0,   0,   0,   0,   5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ];

  // Rook table - encourage 7th rank and open files
  const rookTable = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0],
  ];

  // Queen table - encourage center, avoid early development
  const queenTable = [
    [-20, -10, -10,  -5,  -5, -10, -10, -20],
    [-10,   0,   0,   0,   0,   0,   0, -10],
    [-10,   0,   5,   5,   5,   5,   0, -10],
    [-5,    0,   5,   5,   5,   5,   0,  -5],
    [0,     0,   5,   5,   5,   5,   0,  -5],
    [-10,   5,   5,   5,   5,   5,   0, -10],
    [-10,   0,   5,   0,   0,   0,   0, -10],
    [-20, -10, -10,  -5,  -5, -10, -10, -20],
  ];

  // King table - encourage castling and corner safety in middlegame
  const kingMiddleGameTable = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20,  20,   0,   0,   0,   0,  20,  20],
    [20,  30,  10,   0,   0,  10,  30,  20],
  ];

  switch (piece.type) {
    case 'pawn':
      return pawnTable[effectiveRow][col];
    case 'knight':
      return knightTable[effectiveRow][col];
    case 'bishop':
      return bishopTable[effectiveRow][col];
    case 'rook':
      return rookTable[effectiveRow][col];
    case 'queen':
      return queenTable[effectiveRow][col];
    case 'king':
      return kingMiddleGameTable[effectiveRow][col];
    default:
      return 0;
  }
}

/**
 * Evaluate king safety
 */
function evaluateKingSafety(gameState: ChessGameState): number {
  let score = 0;

  // Penalize being in check
  if (gameState.isCheck) {
    score += gameState.currentTurn === 'white' ? -50 : 50;
  }

  // TODO: Add more king safety evaluation
  // - Pawn shield
  // - Open files near king
  // - Attacking pieces near king

  return score;
}

/**
 * Evaluate pawn structure
 */
function evaluatePawnStructure(board: Board): number {
  let score = 0;

  // Find all pawns
  const whitePawns: number[] = Array(8).fill(0);
  const blackPawns: number[] = Array(8).fill(0);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'pawn') {
        if (piece.color === 'white') {
          whitePawns[col]++;
        } else {
          blackPawns[col]++;
        }
      }
    }
  }

  // Penalize doubled pawns
  for (let col = 0; col < 8; col++) {
    if (whitePawns[col] > 1) score -= 10 * (whitePawns[col] - 1);
    if (blackPawns[col] > 1) score += 10 * (blackPawns[col] - 1);
  }

  // Bonus for passed pawns (no enemy pawns in front or adjacent columns)
  // TODO: Implement passed pawn detection

  return score;
}

/**
 * Evaluate mobility (number of legal moves)
 * This is expensive, so use sparingly
 */
export function evaluateMobility(gameState: ChessGameState): number {
  // TODO: Implement if needed for hard difficulty
  // Count legal moves for both sides
  // More moves = better position
  return 0;
}