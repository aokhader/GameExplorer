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
  positionToCoordinates,
  coordinatesToPosition,
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

    // 3. Check if this is a castling move
    const isCastling = this.isCastlingMove(gameState, from, to);
    
    if (isCastling) {
      // Validate castling with all the special rules
      const castlingValidation = this.validateCastling(gameState, from, to);
      if (!castlingValidation.valid) {
        return castlingValidation;
      }
    } else {
      // 4. Check if the move is in the list of possible moves
      const possibleMoves = getPossibleMoves(gameState.board, from);
      if (!possibleMoves.includes(to)) {
        return { valid: false, reason: 'Illegal move for this piece' };
      }

      // 5. Simulate the move and check if it leaves king in check
      const simulatedState = this.simulateMove(gameState, from, to);
      if (isKingInCheck(simulatedState.board, piece.color)) {
        return { valid: false, reason: 'Move would leave king in check' };
      }
    }

    // 6. Move is valid - return the resulting state
    const resultingState = this.executeMove(gameState, from, to, skipGameEndCheck);
    
    return {
      valid: true,
      resultingState,
    };
  }

  /**
   * Check if a move is a castling move
   * Castling is detected when the king moves 2 squares horizontally
   */
  private static isCastlingMove(gameState: ChessGameState, from: Position, to: Position): boolean {
    const piece = getPieceAt(gameState.board, from);
    if (!piece || piece.type !== 'king') return false;
    
    const fromCoords = positionToCoordinates(from);
    const toCoords = positionToCoordinates(to);
    
    // King moving 2 squares horizontally = castling
    const horizontalDistance = Math.abs(toCoords.col - fromCoords.col);
    const verticalDistance = Math.abs(toCoords.row - fromCoords.row);
    
    return horizontalDistance === 2 && verticalDistance === 0;
  }

  /**
   * Validate castling move according to chess rules
   */
  private static validateCastling(
    gameState: ChessGameState,
    from: Position,
    to: Position
  ): MoveValidationResult {
    const piece = getPieceAt(gameState.board, from);
    if (!piece || piece.type !== 'king') {
      return { valid: false, reason: 'Not a king' };
    }

    const color = piece.color;
    const fromCoords = positionToCoordinates(from);
    const toCoords = positionToCoordinates(to);
    const row = fromCoords.row;
    
    // Determine if kingside or queenside
    const isKingside = toCoords.col > fromCoords.col;
    
    // Rule 1: Check castling rights
    if (isKingside) {
      if (color === 'white' && !gameState.castlingRights.whiteKingSide) {
        return { valid: false, reason: 'White has lost kingside castling rights' };
      }
      if (color === 'black' && !gameState.castlingRights.blackKingSide) {
        return { valid: false, reason: 'Black has lost kingside castling rights' };
      }
    } else {
      if (color === 'white' && !gameState.castlingRights.whiteQueenSide) {
        return { valid: false, reason: 'White has lost queenside castling rights' };
      }
      if (color === 'black' && !gameState.castlingRights.blackQueenSide) {
        return { valid: false, reason: 'Black has lost queenside castling rights' };
      }
    }
    
    // Rule 2: King must be on starting square (e1 for white, e8 for black)
    const expectedRow = color === 'white' ? 0 : 7;
    if (fromCoords.row !== expectedRow || fromCoords.col !== 4) {
      return { valid: false, reason: 'King not on starting square' };
    }
    
    // Rule 3: King cannot be in check
    if (isKingInCheck(gameState.board, color)) {
      return { valid: false, reason: 'Cannot castle while in check' };
    }
    
    // Rule 4: Squares between king and rook must be empty
    // Rule 5: King cannot pass through or land in check
    const rookCol = isKingside ? 7 : 0;
    const step = isKingside ? 1 : -1;
    const kingDestCol = isKingside ? 6 : 2; // g-file or c-file
    
    // Check all squares between king and rook are empty
    for (let col = fromCoords.col + step; col !== rookCol; col += step) {
      const checkPos = coordinatesToPosition({ row, col });
      const pieceOnSquare = getPieceAt(gameState.board, checkPos);
      if (pieceOnSquare) {
        return { valid: false, reason: 'Pieces between king and rook' };
      }
    }
    
    // Rule 6: Rook must exist at the corner
    const rookPos = coordinatesToPosition({ row, col: rookCol });
    const rook = getPieceAt(gameState.board, rookPos);
    if (!rook || rook.type !== 'rook' || rook.color !== color) {
      return { valid: false, reason: 'No rook at expected position' };
    }
    
    // Check that king doesn't pass through check
    // King passes through: starting square, one square over, destination square
    for (let col = fromCoords.col; col !== kingDestCol + step; col += step) {
      const testPos = coordinatesToPosition({ row, col });
      
      // Create a test board with king at this position
      const testBoard = setPieceAt(
        setPieceAt(gameState.board, from, null),
        testPos,
        { type: 'king', color }
      );
      
      if (isKingInCheck(testBoard, color)) {
        return { valid: false, reason: 'King would pass through or land in check' };
      }
    }
    
    return { valid: true };
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

    // Check if this is castling
    const isCastling = this.isCastlingMove(gameState, from, to);
    
    if (isCastling && piece.type === 'king') {
      // Execute castling move
      const fromCoords = positionToCoordinates(from);
      const toCoords = positionToCoordinates(to);
      const row = fromCoords.row;
      const isKingside = toCoords.col > fromCoords.col;
      
      // Move king
      let newBoard = setPieceAt(newState.board, from, null);
      newBoard = setPieceAt(newBoard, to, piece);
      
      // Move rook
      if (isKingside) {
        // Kingside: Rook from h-file to f-file
        const rookFrom = coordinatesToPosition({ row, col: 7 });
        const rookTo = coordinatesToPosition({ row, col: 5 });
        const rook = getPieceAt(newBoard, rookFrom);
        if (rook) {
          newBoard = setPieceAt(newBoard, rookFrom, null);
          newBoard = setPieceAt(newBoard, rookTo, rook);
        }
      } else {
        // Queenside: Rook from a-file to d-file
        const rookFrom = coordinatesToPosition({ row, col: 0 });
        const rookTo = coordinatesToPosition({ row, col: 3 });
        const rook = getPieceAt(newBoard, rookFrom);
        if (rook) {
          newBoard = setPieceAt(newBoard, rookFrom, null);
          newBoard = setPieceAt(newBoard, rookTo, rook);
        }
      }
      
      newState.board = newBoard;
      
      // Record castling move
      const move: Move = {
        from,
        to,
        piece,
        isCastling: true,
        castlingSide: isKingside ? 'kingside' : 'queenside',
      };
      newState.moveHistory.push(move);
    } else {
      // Normal move
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
    }

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