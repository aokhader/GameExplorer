import type {
  CheckersGameState,
  CheckersMove,
  CheckersMoveResult,
} from './types';
import {
  cloneGameState,
  createInitialGameState,
  getPieceAt,
  setPieceAt,
  getOpponentColor,
  positionToCoordinates,
} from './utils';
import { getAllLegalMoves } from './moves';

export class CheckersEngine {
  static newGame(): CheckersGameState {
    return createInitialGameState();
  }

  /**
   * Validate a move by (from, to) pair. The engine resolves the full move (including
   * all intermediate captures for a multi-jump chain) from the legal move list.
   */
  static validateMove(
    state: CheckersGameState,
    from: string,
    to: string,
  ): CheckersMoveResult {
    if (state.isGameOver) {
      return { valid: false, reason: 'Game is already over' };
    }

    const piece = getPieceAt(state.board, from);
    if (!piece) {
      return { valid: false, reason: 'No piece at starting position' };
    }
    if (piece.color !== state.currentTurn) {
      return { valid: false, reason: 'Not your turn' };
    }

    const legalMoves = getAllLegalMoves(state.board, state.currentTurn);
    const move = legalMoves.find(m => m.from === from && m.to === to);

    if (!move) {
      return { valid: false, reason: 'Illegal move' };
    }

    return { valid: true, resultingState: this.applyMove(state, move) };
  }

  /** Execute a pre-validated move. */
  static executeMove(state: CheckersGameState, move: CheckersMove): CheckersGameState {
    return this.applyMove(state, move);
  }

  private static applyMove(state: CheckersGameState, move: CheckersMove): CheckersGameState {
    const newState = cloneGameState(state);
    const piece = getPieceAt(newState.board, move.from)!;

    // Remove piece from origin
    let newBoard = setPieceAt(newState.board, move.from, null);

    // Remove all captured pieces
    for (const capturedPos of move.captures) {
      newBoard = setPieceAt(newBoard, capturedPos, null);
    }

    // Promote to king if reaching the back rank
    const { row: toRow } = positionToCoordinates(move.to);
    const shouldPromote =
      piece.type === 'man' &&
      ((piece.color === 'white' && toRow === 7) ||
        (piece.color === 'black' && toRow === 0));

    newBoard = setPieceAt(newBoard, move.to, shouldPromote ? { type: 'king', color: piece.color } : piece);
    newState.board = newBoard;

    newState.moveHistory = [
      ...newState.moveHistory,
      { ...move, isKingPromotion: shouldPromote || !!move.isKingPromotion },
    ];

    // Reset capture counter on capture, otherwise increment
    newState.movesSinceCapture =
      move.captures.length > 0 ? 0 : state.movesSinceCapture + 1;

    // Switch turn
    newState.currentTurn = getOpponentColor(state.currentTurn);

    // Check for game-over conditions
    const nextMoves = getAllLegalMoves(newState.board, newState.currentTurn);
    if (nextMoves.length === 0) {
      // No legal moves — the player who just moved wins
      newState.isGameOver = true;
      newState.winner = state.currentTurn;
    } else if (newState.movesSinceCapture >= 40) {
      newState.isGameOver = true;
      newState.winner = null; // draw by 40-move rule
    }

    return newState;
  }

  static getAllLegalMoves(state: CheckersGameState): CheckersMove[] {
    if (state.isGameOver) return [];
    return getAllLegalMoves(state.board, state.currentTurn);
  }

  /** Piece counts by colour. Useful for display and evaluation. */
  static getPieceCounts(state: CheckersGameState): { white: number; black: number } {
    let white = 0;
    let black = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = state.board[row][col];
        if (!p) continue;
        if (p.color === 'white') white++;
        else black++;
      }
    }
    return { white, black };
  }
}
