import { describe, it, expect } from 'vitest';
import { toReversiMove, moveHistoryToReversi, PASS_NOTATION } from './notation';
import { ReversiEngine } from './engine';
import { getDiscAt } from './utils';
import type { ReversiMove } from './types';

const placed = (position: string | null): ReversiMove => ({
  position,
  flipped: [],
  color: 'black',
});

describe('toReversiMove', () => {
  it('is just the square the disc went on', () => {
    expect(toReversiMove(placed('f5'))).toBe('f5');
    expect(toReversiMove(placed('a1'))).toBe('a1');
    expect(toReversiMove(placed('h8'))).toBe('h8');
  });

  it('marks a skipped turn', () => {
    expect(toReversiMove(placed(null))).toBe(PASS_NOTATION);
  });
});

describe('the engine agrees with the book', () => {
  it('opens with black on d5/e4 and white on d4/e5', () => {
    // Rose, ch.1: "The game begins with black discs on d5 and e4, and white
    // discs on d4 and e5." Squares are named with rows running top to bottom,
    // so this pins the whole coordinate convention.
    const { board } = ReversiEngine.newGame();
    expect(getDiscAt(board, 'd5')?.color).toBe('black');
    expect(getDiscAt(board, 'e4')?.color).toBe('black');
    expect(getDiscAt(board, 'd4')?.color).toBe('white');
    expect(getDiscAt(board, 'e5')?.color).toBe('white');
  });

  it('accepts f5 as a black opening move, flipping e5', () => {
    // Rose, Diagram 1-4: black plays f5, sandwiching the white disc on e5.
    const state = ReversiEngine.newGame();
    expect(state.currentTurn).toBe('black');
    const result = ReversiEngine.validateMove(state, 'f5');
    expect(result.valid).toBe(true);
    expect(getDiscAt(result.resultingState!.board, 'e5')?.color).toBe('black');
    expect(moveHistoryToReversi(result.resultingState!.moveHistory)).toEqual(['f5']);
  });
});

describe('moveHistoryToReversi', () => {
  it('renders a played opening in order', () => {
    let state = ReversiEngine.newGame();
    for (const square of ['f5', 'd6', 'c3']) {
      const result = ReversiEngine.validateMove(state, square);
      expect(result.valid, `${square} should be legal`).toBe(true);
      state = result.resultingState!;
    }
    expect(moveHistoryToReversi(state.moveHistory)).toEqual(['f5', 'd6', 'c3']);
  });
});
