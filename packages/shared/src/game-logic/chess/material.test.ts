import { describe, it, expect } from 'vitest';
import { summarizeMaterial } from './material';
import { ChessEngine } from './engine';
import type { Board, ChessGameState, PieceType } from '../../types/chess.types';

/** Play a sequence of moves from the start, asserting each one is legal. */
function play(...moves: string[]): ChessGameState {
  let state = ChessEngine.newGame();
  for (const move of moves) {
    const result = ChessEngine.validateMove(state, move.slice(0, 2), move.slice(2, 4));
    expect(result.valid, `${move} should be legal`).toBe(true);
    state = result.resultingState!;
  }
  return state;
}

describe('summarizeMaterial', () => {
  it('reports empty trays and a level balance for a new game', () => {
    expect(summarizeMaterial(ChessEngine.newGame())).toEqual({
      white: [],
      black: [],
      advantage: 0,
    });
  });

  it('credits a capture to the capturing side', () => {
    // 1. e4 d5 2. exd5 — White wins a pawn.
    const summary = summarizeMaterial(play('e2e4', 'd7d5', 'e4d5'));
    expect(summary.white).toEqual(['pawn']);
    expect(summary.black).toEqual([]);
    expect(summary.advantage).toBe(1);
  });

  it('nets out an even trade', () => {
    // 1. e4 d5 2. exd5 Qxd5 — a pawn each, back to level.
    const summary = summarizeMaterial(play('e2e4', 'd7d5', 'e4d5', 'd8d5'));
    expect(summary.white).toEqual(['pawn']);
    expect(summary.black).toEqual(['pawn']);
    expect(summary.advantage).toBe(0);
  });

  it('counts an en passant capture, whose victim never sat on the target square', () => {
    // 1. e4 a6 2. e5 d5 3. exd6 e.p.
    const state = play('e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
    const summary = summarizeMaterial(state);
    expect(summary.white).toEqual(['pawn']);
    expect(summary.advantage).toBe(1);
    expect(state.board[4][3]).toBeNull(); // the d5 pawn really left the board
  });

  it('sorts each tray cheapest first, whatever order the captures came in', () => {
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      moveHistory: [
        capture('rook', 'black'),
        capture('pawn', 'black'),
        capture('queen', 'black'),
        capture('knight', 'black'),
        capture('bishop', 'white'),
        capture('pawn', 'white'),
      ],
    };
    const summary = summarizeMaterial(state);
    expect(summary.white).toEqual(['pawn', 'knight', 'rook', 'queen']);
    expect(summary.black).toEqual(['pawn', 'bishop']);
  });

  it('counts a promotion in the balance even though nothing was captured', () => {
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      board: sparseBoard({ e1: ['king', 'white'], e8: ['king', 'black'], a7: ['pawn', 'white'] }),
      moveHistory: [],
    };
    expect(summarizeMaterial(state).advantage).toBe(1); // just the pawn

    const promoted = ChessEngine.validateMove(state, 'a7', 'a8', false, 'queen');
    expect(promoted.valid).toBe(true);
    const summary = summarizeMaterial(promoted.resultingState!);
    expect(summary.white).toEqual([]); // nothing was captured…
    expect(summary.advantage).toBe(9); // …but White is a queen up
  });
});

/** A move whose only interesting property is the piece it took off the board. */
function capture(type: PieceType, color: 'white' | 'black') {
  return {
    from: 'a1',
    to: 'a2',
    piece: { type: 'rook' as PieceType, color },
    capturedPiece: { type, color },
  };
}

/** Board holding only the given squares, e.g. `{ e1: ['king', 'white'] }`. */
function sparseBoard(squares: Record<string, [PieceType, 'white' | 'black']>): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [square, [type, color]] of Object.entries(squares)) {
    board[Number(square[1]) - 1][square.charCodeAt(0) - 97] = { type, color };
  }
  return board;
}
