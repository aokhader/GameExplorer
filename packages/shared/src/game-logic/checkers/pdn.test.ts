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
    expect(toPdnSquare('a8')).toBe(1);
    expect(toPdnSquare('g8')).toBe(4);
    expect(toPdnSquare('b1')).toBe(29);
    expect(toPdnSquare('h1')).toBe(32);
  });

  it('walks each row left to right, top to bottom', () => {
    expect(['a8', 'c8', 'e8', 'g8'].map(toPdnSquare)).toEqual([1, 2, 3, 4]);
    expect(['b7', 'd7', 'f7', 'h7'].map(toPdnSquare)).toEqual([5, 6, 7, 8]);
    expect(['a6', 'c6', 'e6', 'g6'].map(toPdnSquare)).toEqual([9, 10, 11, 12]);
    expect(['b5', 'd5', 'f5', 'h5'].map(toPdnSquare)).toEqual([13, 14, 15, 16]);
    expect(['a4', 'c4', 'e4', 'g4'].map(toPdnSquare)).toEqual([17, 18, 19, 20]);
    expect(['b3', 'd3', 'f3', 'h3'].map(toPdnSquare)).toEqual([21, 22, 23, 24]);
    expect(['a2', 'c2', 'e2', 'g2'].map(toPdnSquare)).toEqual([25, 26, 27, 28]);
    expect(['b1', 'd1', 'f1', 'h1'].map(toPdnSquare)).toEqual([29, 30, 31, 32]);
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
    expect(toPdnSquare('a1')).toBeNull();
    expect(toPdnSquare('h8')).toBeNull();
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
    // a6 (9) to b5 (13).
    expect(toPdn(move({ from: 'a6', to: 'b5' }))).toBe('9-13');
  });

  it('joins a jump with an x', () => {
    // d3 (22) jumps over c4 to b5 (13).
    expect(toPdn(move({ from: 'd3', to: 'b5', captures: ['c4'] }))).toBe('22x13');
  });

  it('lists every landing square of a multi-jump', () => {
    // d3 (22) -> f5 (15) -> d7 (6), taking two pieces on the way.
    const chain = move({
      from: 'd3',
      to: 'd7',
      path: ['f5', 'd7'],
      captures: ['e4', 'e6'],
    });
    expect(toPdn(chain)).toBe('22x15x6');
  });

  it('adds no marker for kinging', () => {
    // PDN leaves promotion implicit — the move just ends on the back rank.
    expect(toPdn(move({ from: 'b3', to: 'a2', isKingPromotion: true }))).toBe('21-25');
  });
});

describe('moveHistoryToPdn', () => {
  it('renders a played opening in order', () => {
    let state = CheckersEngine.newGame();
    for (const [from, to] of [
      ['b3', 'a4'],
      ['a6', 'b5'],
    ] as const) {
      const result = CheckersEngine.validateMove(state, from, to);
      expect(result.valid, `${from}-${to} should be legal`).toBe(true);
      state = result.resultingState!;
    }
    expect(moveHistoryToPdn(state.moveHistory)).toEqual(['21-17', '9-13']);
  });
});
