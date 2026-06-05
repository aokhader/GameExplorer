import { describe, it, expect } from 'vitest';
import { ReversiEngine } from './engine';
import { createInitialGameState, setDiscAt } from './utils';
import type { ReversiBoard, ReversiColor, ReversiGameState } from './types';

function emptyBoard(): ReversiBoard {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function stateWith(
  discs: Array<[string, ReversiColor]>,
  currentTurn: ReversiColor,
  overrides: Partial<ReversiGameState> = {},
): ReversiGameState {
  let board = emptyBoard();
  for (const [pos, color] of discs) board = setDiscAt(board, pos, { color });
  return { ...createInitialGameState(), board, currentTurn, ...overrides };
}

describe('ReversiEngine.newGame', () => {
  it('starts with black to move and the 2x2 center', () => {
    const state = ReversiEngine.newGame();
    expect(state.currentTurn).toBe('black');
    expect(ReversiEngine.getDiscCounts(state)).toEqual({ black: 2, white: 2 });
  });

  it('offers the four standard opening moves to black', () => {
    const state = ReversiEngine.newGame();
    expect(ReversiEngine.getAllLegalMoves(state).sort()).toEqual(['c4', 'd3', 'e6', 'f5']);
  });
});

describe('ReversiEngine.validateMove', () => {
  it('places a disc, flips the flanked disc, and switches turn', () => {
    const state = ReversiEngine.newGame(); // black to move
    const result = ReversiEngine.validateMove(state, 'd3');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.currentTurn).toBe('white');
    // d4 (white) is flipped to black; placed disc on d3.
    expect(ReversiEngine.getDiscCounts(next)).toEqual({ black: 4, white: 1 });
  });

  it('rejects an occupied square', () => {
    const state = ReversiEngine.newGame();
    const result = ReversiEngine.validateMove(state, 'd4');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Square is already occupied');
  });

  it('rejects a move that flips nothing', () => {
    const state = ReversiEngine.newGame();
    const result = ReversiEngine.validateMove(state, 'a1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Move does not flip any discs');
  });

  it('rejects any move once the game is over', () => {
    const state = stateWith([['d4', 'black']], 'black', { isGameOver: true });
    const result = ReversiEngine.validateMove(state, 'c4');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Game is already over');
  });
});

describe('ReversiEngine — passing', () => {
  it('reports mustPass when the current player has no flips available', () => {
    // Only black discs exist: black has nothing to flank, so it must pass.
    const state = stateWith([['d4', 'black'], ['e5', 'black']], 'black');
    expect(ReversiEngine.mustPass(state)).toBe(true);
    expect(ReversiEngine.getAllLegalMoves(state)).toEqual([]);
  });

  it('increments the pass counter and switches turn on a single pass', () => {
    const state = stateWith([['d4', 'black']], 'black');
    const next = ReversiEngine.executePass(state);
    expect(next.consecutivePasses).toBe(1);
    expect(next.currentTurn).toBe('white');
    expect(next.isGameOver).toBe(false);
  });

  it('ends the game on two consecutive passes and awards the disc majority', () => {
    const state = stateWith(
      [['a1', 'black'], ['b1', 'black'], ['c1', 'black'], ['h8', 'white']],
      'white',
      { consecutivePasses: 1 },
    );
    const next = ReversiEngine.executePass(state); // second pass
    expect(next.consecutivePasses).toBe(2);
    expect(next.isGameOver).toBe(true);
    expect(next.winner).toBe('black'); // 3 black vs 1 white
  });
});
