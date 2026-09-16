import { describe, it, expect } from 'vitest';
import { toPdnSquare, toPdn, moveHistoryToPdn } from './pdn';
import { CheckersEngine } from './engine';
import type { CheckersMove } from './types';

function move(over: Partial<CheckersMove> & Pick<CheckersMove, 'from' | 'to'>): CheckersMove {
  return { path: [over.to], captures: [], ...over };
}

describe('toPdnSquare', () => {
  it('numbers the four corners of the numbering scheme', () => {
    // Black's back rank is 1–4, White's is 29–32.
    expect(toPdnSquare('b8')).toBe(1);
    expect(toPdnSquare('h8')).toBe(4);
    expect(toPdnSquare('a1')).toBe(29);
    expect(toPdnSquare('g1')).toBe(32);
  });

  it('walks each row left to right, top to bottom', () => {
    expect(['b8', 'd8', 'f8', 'h8'].map(toPdnSquare)).toEqual([1, 2, 3, 4]);
    expect(['a7', 'c7', 'e7', 'g7'].map(toPdnSquare)).toEqual([5, 6, 7, 8]);
    expect(['b6', 'd6', 'f6', 'h6'].map(toPdnSquare)).toEqual([9, 10, 11, 12]);
    expect(['a5', 'c5', 'e5', 'g5'].map(toPdnSquare)).toEqual([13, 14, 15, 16]);
    expect(['b4', 'd4', 'f4', 'h4'].map(toPdnSquare)).toEqual([17, 18, 19, 20]);
    expect(['a3', 'c3', 'e3', 'g3'].map(toPdnSquare)).toEqual([21, 22, 23, 24]);
    expect(['b2', 'd2', 'f2', 'h2'].map(toPdnSquare)).toEqual([25, 26, 27, 28]);
    expect(['a1', 'c1', 'e1', 'g1'].map(toPdnSquare)).toEqual([29, 30, 31, 32]);
  });

  it('covers every playable square exactly once', () => {
    const seen = new Set<number>();
    for (const file of 'abcdefgh') {
      for (let rank = 1; rank <= 8; rank++) {
        const n = toPdnSquare(`${file}${rank}`);
        if (n !== null) seen.add(n);
      }
    }
    expect(seen.size).toBe(32);
    expect(Math.min(...seen)).toBe(1);
    expect(Math.max(...seen)).toBe(32);
  });

  it('rejects the light squares, which no piece can occupy', () => {
    // The board is laid out a1-dark, h1-light, the same as the chess board, so
    // these two corners are the light ones.
    expect(toPdnSquare('b1')).toBeNull();
    expect(toPdnSquare('a8')).toBeNull();
  });

  it('agrees with the PDN invariant on the opening position', () => {
    // Black starts on 1–12 and White on 21–32 — the property that fixes the
    // whole numbering scheme.
    const board = CheckersEngine.newGame().board;
    const squares = (color: 'black' | 'white') => {
      const out: number[] = [];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (board[row][col]?.color !== color) continue;
          const pos = String.fromCharCode(97 + col) + (row + 1);
          out.push(toPdnSquare(pos)!);
        }
      }
      return out.sort((a, b) => a - b);
    };
    expect(squares('black')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(squares('white')).toEqual([
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
    ]);
  });
});

describe('toPdn', () => {
  it('joins a quiet move with a hyphen', () => {
    // h6 (12) to g5 (16).
    expect(toPdn(move({ from: 'h6', to: 'g5' }))).toBe('12-16');
  });

  it('joins a jump with an x', () => {
    // e3 (23) jumps over f4 to g5 (16).
    expect(toPdn(move({ from: 'e3', to: 'g5', captures: ['f4'] }))).toBe('23x16');
  });

  it('lists every landing square of a multi-jump', () => {
    // e3 (23) -> c5 (14) -> e7 (7), taking two pieces on the way.
    const chain = move({
      from: 'e3',
      to: 'e7',
      path: ['c5', 'e7'],
      captures: ['d4', 'd6'],
    });
    expect(toPdn(chain)).toBe('23x14x7');
  });

  it('adds no marker for kinging', () => {
    // PDN leaves promotion implicit — the move just ends on the back rank.
    expect(toPdn(move({ from: 'g3', to: 'h2', isKingPromotion: true }))).toBe('24-28');
  });
});

describe('moveHistoryToPdn', () => {
  it('renders a played opening in order', () => {
    let state = CheckersEngine.newGame();
    for (const [from, to] of [
      ['g3', 'h4'],
      ['h6', 'g5'],
    ] as const) {
      const result = CheckersEngine.validateMove(state, from, to);
      expect(result.valid, `${from}-${to} should be legal`).toBe(true);
      state = result.resultingState!;
    }
    expect(moveHistoryToPdn(state.moveHistory)).toEqual(['24-20', '12-16']);
  });
});
