import { describe, it, expect } from 'vitest';
import { CheckersEngine } from './engine';
import { createInitialGameState, setPieceAt, getPieceAt } from './utils';
import type { CheckersBoard, CheckersGameState } from './types';

function emptyBoard(): CheckersBoard {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function stateWith(
  pieces: Array<[string, CheckersBoard[number][number]]>,
  currentTurn: 'white' | 'black' = 'white',
): CheckersGameState {
  let board = emptyBoard();
  for (const [pos, piece] of pieces) board = setPieceAt(board, pos, piece);
  return { ...createInitialGameState(), board, currentTurn };
}

const whiteMan = { type: 'man', color: 'white' } as const;
const blackMan = { type: 'man', color: 'black' } as const;

describe('CheckersEngine.newGame', () => {
  it('starts with 12 men each, white to move, on dark squares', () => {
    const state = CheckersEngine.newGame();
    expect(state.currentTurn).toBe('white');
    expect(CheckersEngine.getPieceCounts(state)).toEqual({ white: 12, black: 12 });
    expect(getPieceAt(state.board, 'b1')).toEqual(whiteMan); // dark square occupied
    expect(getPieceAt(state.board, 'a1')).toBeNull(); // light square empty
  });
});

describe('CheckersEngine.validateMove — basics', () => {
  it('accepts a legal forward diagonal move and switches turn', () => {
    const state = CheckersEngine.newGame();
    const result = CheckersEngine.validateMove(state, 'b3', 'c4');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.currentTurn).toBe('black');
    expect(getPieceAt(next.board, 'c4')).toEqual(whiteMan);
    expect(getPieceAt(next.board, 'b3')).toBeNull();
  });

  it("rejects moving the opponent's piece", () => {
    const state = CheckersEngine.newGame(); // white to move
    const result = CheckersEngine.validateMove(state, 'a6', 'b5');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Not your turn');
  });

  it('rejects a non-diagonal (illegal) move', () => {
    const state = CheckersEngine.newGame();
    const result = CheckersEngine.validateMove(state, 'b3', 'b4');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Illegal move');
  });
});

describe('CheckersEngine.validateMove — mandatory captures', () => {
  it('forces an available capture and rejects a quiet move', () => {
    // white c2 can jump black d3, landing e4. A spare black man keeps the game alive.
    const state = stateWith([
      ['c2', whiteMan],
      ['d3', blackMan],
      ['g8', blackMan],
    ]);

    // Quiet move is illegal while a capture is available.
    const quiet = CheckersEngine.validateMove(state, 'c2', 'b3');
    expect(quiet.valid).toBe(false);

    // The capture itself is legal.
    const capture = CheckersEngine.validateMove(state, 'c2', 'e4');
    expect(capture.valid).toBe(true);
    const next = capture.resultingState!;
    expect(getPieceAt(next.board, 'e4')).toEqual(whiteMan);
    expect(getPieceAt(next.board, 'd3')).toBeNull(); // captured piece removed
    expect(CheckersEngine.getPieceCounts(next)).toEqual({ white: 1, black: 1 });
  });

  it('resolves a multi-jump chain in a single validated move', () => {
    // white b1 jumps c2 -> d3, then e4 -> f5 (two captures).
    const state = stateWith([
      ['b1', whiteMan],
      ['c2', blackMan],
      ['e4', blackMan],
      ['g8', blackMan],
    ]);

    const result = CheckersEngine.validateMove(state, 'b1', 'f5');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(getPieceAt(next.board, 'f5')).toEqual(whiteMan);
    expect(getPieceAt(next.board, 'c2')).toBeNull();
    expect(getPieceAt(next.board, 'e4')).toBeNull();
    // Both jumped pieces gone; one spare black man remains.
    expect(CheckersEngine.getPieceCounts(next)).toEqual({ white: 1, black: 1 });
  });
});

describe('CheckersEngine — game over', () => {
  it('ends the game with a winner when the opponent has no pieces left', () => {
    const state = stateWith([
      ['b1', whiteMan],
      ['c2', blackMan],
    ]);
    const result = CheckersEngine.validateMove(state, 'b1', 'd3');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.isGameOver).toBe(true);
    expect(next.winner).toBe('white');
    expect(CheckersEngine.getPieceCounts(next)).toEqual({ white: 1, black: 0 });
  });

  it('rejects any move once the game is over', () => {
    const state: CheckersGameState = {
      ...stateWith([['b1', whiteMan]]),
      isGameOver: true,
      winner: 'white',
    };
    const result = CheckersEngine.validateMove(state, 'b1', 'c2');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Game is already over');
  });
});
