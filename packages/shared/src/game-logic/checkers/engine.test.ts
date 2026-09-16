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
    expect(getPieceAt(state.board, 'g1')).toEqual(whiteMan); // dark square occupied
    expect(getPieceAt(state.board, 'h1')).toBeNull(); // light square empty
  });
});

describe('CheckersEngine.validateMove — basics', () => {
  it('accepts a legal forward diagonal move and switches turn', () => {
    const state = CheckersEngine.newGame();
    const result = CheckersEngine.validateMove(state, 'g3', 'f4');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.currentTurn).toBe('black');
    expect(getPieceAt(next.board, 'f4')).toEqual(whiteMan);
    expect(getPieceAt(next.board, 'g3')).toBeNull();
  });

  it("rejects moving the opponent's piece", () => {
    const state = CheckersEngine.newGame(); // white to move
    const result = CheckersEngine.validateMove(state, 'h6', 'g5');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Not your turn');
  });

  it('rejects a non-diagonal (illegal) move', () => {
    const state = CheckersEngine.newGame();
    const result = CheckersEngine.validateMove(state, 'g3', 'g4');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Illegal move');
  });
});

describe('CheckersEngine.validateMove — mandatory captures', () => {
  it('forces an available capture and rejects a quiet move', () => {
    // white f2 can jump black e3, landing d4. A spare black man keeps the game alive.
    const state = stateWith([
      ['f2', whiteMan],
      ['e3', blackMan],
      ['b8', blackMan],
    ]);

    // Quiet move is illegal while a capture is available.
    const quiet = CheckersEngine.validateMove(state, 'f2', 'g3');
    expect(quiet.valid).toBe(false);

    // The capture itself is legal.
    const capture = CheckersEngine.validateMove(state, 'f2', 'd4');
    expect(capture.valid).toBe(true);
    const next = capture.resultingState!;
    expect(getPieceAt(next.board, 'd4')).toEqual(whiteMan);
    expect(getPieceAt(next.board, 'e3')).toBeNull(); // captured piece removed
    expect(CheckersEngine.getPieceCounts(next)).toEqual({ white: 1, black: 1 });
  });

  it('resolves a multi-jump chain in a single validated move', () => {
    // white g1 jumps f2 -> e3, then d4 -> c5 (two captures).
    const state = stateWith([
      ['g1', whiteMan],
      ['f2', blackMan],
      ['d4', blackMan],
      ['b8', blackMan],
    ]);

    const result = CheckersEngine.validateMove(state, 'g1', 'c5');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(getPieceAt(next.board, 'c5')).toEqual(whiteMan);
    expect(getPieceAt(next.board, 'f2')).toBeNull();
    expect(getPieceAt(next.board, 'd4')).toBeNull();
    // Both jumped pieces gone; one spare black man remains.
    expect(CheckersEngine.getPieceCounts(next)).toEqual({ white: 1, black: 1 });
  });
});

describe('CheckersEngine — game over', () => {
  it('ends the game with a winner when the opponent has no pieces left', () => {
    const state = stateWith([
      ['g1', whiteMan],
      ['f2', blackMan],
    ]);
    const result = CheckersEngine.validateMove(state, 'g1', 'e3');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.isGameOver).toBe(true);
    expect(next.winner).toBe('white');
    expect(CheckersEngine.getPieceCounts(next)).toEqual({ white: 1, black: 0 });
  });

  it('rejects any move once the game is over', () => {
    const state: CheckersGameState = {
      ...stateWith([['g1', whiteMan]]),
      isGameOver: true,
      winner: 'white',
    };
    const result = CheckersEngine.validateMove(state, 'g1', 'f2');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Game is already over');
  });
});
