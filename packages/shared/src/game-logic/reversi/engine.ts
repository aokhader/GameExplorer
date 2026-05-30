import type { ReversiGameState, ReversiMoveResult, ReversiColor } from './types';
import {
  cloneGameState,
  createInitialGameState,
  getDiscAt,
  setDiscAt,
  getOpponentColor,
} from './utils';
import { getFlips, getAllLegalPositions } from './moves';

export class ReversiEngine {
  static newGame(): ReversiGameState {
    return createInitialGameState();
  }

  /** Validate and execute a placement move. */
  static validateMove(
    state: ReversiGameState,
    position: string,
  ): ReversiMoveResult {
    if (state.isGameOver) {
      return { valid: false, reason: 'Game is already over' };
    }
    if (getDiscAt(state.board, position) !== null) {
      return { valid: false, reason: 'Square is already occupied' };
    }

    const flipped = getFlips(state.board, position, state.currentTurn);
    if (flipped.length === 0) {
      return { valid: false, reason: 'Move does not flip any discs' };
    }

    return { valid: true, resultingState: this.applyPlacement(state, position, flipped) };
  }

  /** Execute a placement without re-validating (use after validateMove). */
  static executeMove(state: ReversiGameState, position: string): ReversiGameState {
    const flipped = getFlips(state.board, position, state.currentTurn);
    return this.applyPlacement(state, position, flipped);
  }

  /** Execute a pass (current player has no legal moves). */
  static executePass(state: ReversiGameState): ReversiGameState {
    const newState = cloneGameState(state);
    newState.moveHistory = [
      ...newState.moveHistory,
      { position: null, flipped: [], color: state.currentTurn },
    ];
    newState.consecutivePasses = state.consecutivePasses + 1;
    newState.currentTurn = getOpponentColor(state.currentTurn);

    if (newState.consecutivePasses >= 2) {
      newState.isGameOver = true;
      newState.winner = this.determineWinner(newState);
    }

    return newState;
  }

  private static applyPlacement(
    state: ReversiGameState,
    position: string,
    flipped: string[],
  ): ReversiGameState {
    const newState = cloneGameState(state);
    const color = state.currentTurn;

    // Place the new disc
    let newBoard = setDiscAt(newState.board, position, { color });

    // Flip captured discs
    for (const pos of flipped) {
      newBoard = setDiscAt(newBoard, pos, { color });
    }
    newState.board = newBoard;

    newState.moveHistory = [
      ...newState.moveHistory,
      { position, flipped, color },
    ];
    newState.consecutivePasses = 0;
    newState.currentTurn = getOpponentColor(color);

    // Check for game over: board full OR both sides must pass
    const boardFull = newState.board.every(row => row.every(cell => cell !== null));
    const nextHasMoves = getAllLegalPositions(newState.board, newState.currentTurn).length > 0;
    const prevHasMoves = getAllLegalPositions(newState.board, color).length > 0;

    if (boardFull || (!nextHasMoves && !prevHasMoves)) {
      newState.isGameOver = true;
      newState.winner = this.determineWinner(newState);
    }

    return newState;
  }

  private static determineWinner(state: ReversiGameState): ReversiColor | null {
    const counts = this.getDiscCounts(state);
    if (counts.black > counts.white) return 'black';
    if (counts.white > counts.black) return 'white';
    return null; // tie
  }

  /** All legal move positions for the current player. */
  static getAllLegalMoves(state: ReversiGameState): string[] {
    if (state.isGameOver) return [];
    return getAllLegalPositions(state.board, state.currentTurn);
  }

  static getDiscCounts(state: ReversiGameState): { black: number; white: number } {
    let black = 0, white = 0;
    for (const row of state.board) {
      for (const cell of row) {
        if (cell?.color === 'black') black++;
        else if (cell?.color === 'white') white++;
      }
    }
    return { black, white };
  }

  /** True when the current player has no legal moves and must pass. */
  static mustPass(state: ReversiGameState): boolean {
    if (state.isGameOver) return false;
    return getAllLegalPositions(state.board, state.currentTurn).length === 0;
  }
}
