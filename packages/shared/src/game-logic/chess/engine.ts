// packages/shared/src/game-logic/chess/engine.ts
// Main chess game engine - validates and executes moves

import type {
  ChessGameState,
  Move,
  Position,
  Board,
  MoveValidationResult,
  Piece,
} from '../../types/chess.types';
import {
  getPieceAt,
  setPieceAt,
  cloneGameState,
  getOpponentColor,
  createInitialGameState,
} from './utils';
import { getPossibleMoves, isKingInCheck } from './moves';

/**
 * Chess Game Engine
 * Handles all game logic, move validation, and state updates
 */
export class ChessEngine {
  /**
   * Validate and execute a move
   */
  static validateMove(
    gameState: ChessGameState,
    from: Position,
    to: Position,
    skipGameEndCheck: boolean = false
  ): MoveValidationResult {
    // 1. Check if there's a piece at the starting position
    const piece = getPieceAt(gameState.board, from);
    if (!piece) {
      return { valid: false, reason: 'No piece at starting position' };
    }

    // 2. Check if it's the correct player's turn
    if (piece.color !== gameState.currentTurn) {
      return { valid: false, reason: 'Not your turn' };
    }

    // 3. Check if the move is in the list of possible moves
    const possibleMoves = getPossibleMoves(gameState.board, from);
    if (!possibleMoves.includes(to)) {
      return { valid: false, reason: 'Illegal move for this piece' };
    }

    // 4. Simulate the move and check if it leaves king in check
    const simulatedState = this.simulateMove(gameState, from, to);
    if (isKingInCheck(simulatedState.board, piece.color)) {
      return { valid: false, reason: 'Move would leave king in check' };
    }

    // 5. Move is valid - return the resulting state
    const resultingState = this.executeMove(gameState, from, to, skipGameEndCheck);
    
    return {
      valid: true,
      resultingState,
    };
  }

  /**
   * Execute a validated move (does not check validity)
   */
  static executeMove(
    gameState: ChessGameState,
    from: Position,
    to: Position,
    skipGameEndCheck: boolean = false
  ): ChessGameState {
    const newState = cloneGameState(gameState);
    const piece = getPieceAt(newState.board, from);
    const capturedPiece = getPieceAt(newState.board, to);

    if (!piece) {
      throw new Error('No piece at starting position');
    }

    // Create move record
    const move: Move = {
      from,
      to,
      piece,
      capturedPiece: capturedPiece || undefined,
    };

    // Move the piece
    let newBoard = setPieceAt(newState.board, from, null);
    newBoard = setPieceAt(newBoard, to, piece);
    newState.board = newBoard;

    // Update move history
    newState.moveHistory.push(move);

    // Update turn
    newState.currentTurn = getOpponentColor(gameState.currentTurn);

    // Update move counters
    if (capturedPiece || piece.type === 'pawn') {
      newState.halfMoveClock = 0; // Reset on capture or pawn move
    } else {
      newState.halfMoveClock++;
    }

    if (gameState.currentTurn === 'black') {
      newState.fullMoveNumber++;
    }

    // Update castling rights (if king or rook moved)
    newState.castlingRights = this.updateCastlingRights(
      newState.castlingRights,
      from,
      piece
    );

    // Only check for game end conditions if not skipped (to prevent recursion)
    if (!skipGameEndCheck) {
      // Check for check/checkmate/stalemate
      const opponentColor = newState.currentTurn;
      newState.isCheck = isKingInCheck(newState.board, opponentColor);
      newState.isCheckmate = this.isCheckmate(newState);
      newState.isStalemate = this.isStalemate(newState);
      newState.isDraw = this.isDraw(newState);
    }

    return newState;
  }

  /**
   * Simulate a move without actually executing it
   */
  private static simulateMove(
    gameState: ChessGameState,
    from: Position,
    to: Position
  ): ChessGameState {
    const simulatedState = cloneGameState(gameState);
    const piece = getPieceAt(simulatedState.board, from);

    if (!piece) {
      return simulatedState;
    }

    // Move the piece
    let newBoard = setPieceAt(simulatedState.board, from, null);
    newBoard = setPieceAt(newBoard, to, piece);
    simulatedState.board = newBoard;

    return simulatedState;
  }

  /**
   * Update castling rights based on piece movement
   */
  private static updateCastlingRights(
    rights: ChessGameState['castlingRights'],
    from: Position,
    piece: Piece
  ): ChessGameState['castlingRights'] {
    const newRights = { ...rights };

    // King moved - lose all castling rights for that color
    if (piece.type === 'king') {
      if (piece.color === 'white') {
        newRights.whiteKingSide = false;
        newRights.whiteQueenSide = false;
      } else {
        newRights.blackKingSide = false;
        newRights.blackQueenSide = false;
      }
    }

    // Rook moved - lose castling rights for that side
    if (piece.type === 'rook') {
      if (from === 'a1') newRights.whiteQueenSide = false;
      if (from === 'h1') newRights.whiteKingSide = false;
      if (from === 'a8') newRights.blackQueenSide = false;
      if (from === 'h8') newRights.blackKingSide = false;
    }

    return newRights;
  }

  /**
   * Check if current player is in checkmate
   */
  private static isCheckmate(gameState: ChessGameState): boolean {
    const currentColor = gameState.currentTurn;

    // Must be in check to be checkmate
    if (!isKingInCheck(gameState.board, currentColor)) {
      return false;
    }

    // Check if any legal move exists
    return !this.hasLegalMoves(gameState);
  }

  /**
   * Check if current player is in stalemate
   */
  private static isStalemate(gameState: ChessGameState): boolean {
    const currentColor = gameState.currentTurn;

    // Must NOT be in check to be stalemate
    if (isKingInCheck(gameState.board, currentColor)) {
      return false;
    }

    // Check if any legal move exists
    return !this.hasLegalMoves(gameState);
  }

  /**
   * Check if the current player has any legal moves
   */
  private static hasLegalMoves(gameState: ChessGameState): boolean {
    const currentColor = gameState.currentTurn;

    // Try all pieces
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = gameState.board[row][col];
        if (piece && piece.color === currentColor) {
          const from = String.fromCharCode('a'.charCodeAt(0) + col) + (row + 1);
          const possibleMoves = getPossibleMoves(gameState.board, from);

          // Try each possible move
          for (const to of possibleMoves) {
            // IMPORTANT: Skip game end checks to prevent infinite recursion
            const result = this.validateMove(gameState, from, to, true);
            if (result.valid) {
              return true; // Found at least one legal move
            }
          }
        }
      }
    }

    return false; // No legal moves found
  }

  /**
   * Check if game is a draw
   */
  private static isDraw(gameState: ChessGameState): boolean {
    // 50-move rule
    if (gameState.halfMoveClock >= 50) {
      return true;
    }

    // Stalemate
    if (gameState.isStalemate) {
      return true;
    }

    // TODO: Implement these draw conditions:
    // - Insufficient material (K vs K, K+B vs K, K+N vs K, etc.)
    // - Threefold repetition

    return false;
  }

  /**
   * Get all legal moves for the current player
   */
  static getAllLegalMoves(gameState: ChessGameState): { from: Position; to: Position }[] {
    const legalMoves: { from: Position; to: Position }[] = [];
    const currentColor = gameState.currentTurn;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = gameState.board[row][col];
        if (piece && piece.color === currentColor) {
          const from = String.fromCharCode('a'.charCodeAt(0) + col) + (row + 1);
          const possibleMoves = getPossibleMoves(gameState.board, from);

          for (const to of possibleMoves) {
            // Skip game end checks when just listing moves
            const result = this.validateMove(gameState, from, to, true);
            if (result.valid) {
              legalMoves.push({ from, to });
            }
          }
        }
      }
    }

    return legalMoves;
  }

  /**
   * Create a new game with initial position
   */
  static newGame(): ChessGameState {
    return createInitialGameState();
  }
}