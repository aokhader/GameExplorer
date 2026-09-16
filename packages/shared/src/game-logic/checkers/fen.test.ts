import { describe, it, expect } from 'vitest';
import { CHECKERS_START_FEN, checkersFenToState, stateToCheckersFen } from './fen';
import { fromPdnSquare, toPdnSquare } from './pdn';
import { createInitialGameState, getPieceAt, isDarkSquare, positionToCoordinates } from './utils';
import { CheckersEngine } from './engine';

describe('fromPdnSquare', () => {
  it('is the exact inverse of toPdnSquare for all 32 playable squares', () => {
    for (let square = 1; square <= 32; square++) {
      const position = fromPdnSquare(square);
      expect(position).not.toBeNull();
      expect(toPdnSquare(position!)).toBe(square);
    }
  });

  it('lands only on dark squares', () => {
    for (let square = 1; square <= 32; square++) {
      const { row, col } = positionToCoordinates(fromPdnSquare(square)!);
      expect(isDarkSquare(row, col)).toBe(true);
    }
  });

  it('anchors the numbering at b8 = 1 and g1 = 32', () => {
    // The dark squares of Black's back rank are b8, d8, f8, h8 on an a1-dark
    // board, so the count starts at b8 and ends on g1.
    expect(fromPdnSquare(1)).toBe('b8');
    expect(fromPdnSquare(32)).toBe('g1');
  });

  it('rejects out-of-range and non-integer input', () => {
    expect(fromPdnSquare(0)).toBeNull();
    expect(fromPdnSquare(33)).toBeNull();
    expect(fromPdnSquare(-1)).toBeNull();
    expect(fromPdnSquare(1.5)).toBeNull();
  });
});

describe('stateToCheckersFen / checkersFenToState', () => {
  it('encodes the opening position with Black on 1-12 and White on 21-32', () => {
    expect(CHECKERS_START_FEN).toBe(
      'W:W21,22,23,24,25,26,27,28,29,30,31,32:B1,2,3,4,5,6,7,8,9,10,11,12',
    );
  });

  it.each([
    CHECKERS_START_FEN,
    'B:WK11,19,21,26:B9,13,K23',
    'W:WK4:BK29',
    'B:W23,24:B2,3,4',
  ])('round-trips %s', (fen) => {
    expect(stateToCheckersFen(checkersFenToState(fen))).toBe(fen);
  });

  it('decodes the opening position to the same board createInitialGameState builds', () => {
    const decoded = checkersFenToState(CHECKERS_START_FEN);
    expect(decoded.board).toEqual(createInitialGameState().board);
    expect(decoded.currentTurn).toBe('white');
  });

  it('places kings and men on the right squares', () => {
    const state = checkersFenToState('B:WK11,19:B9,K23');
    expect(getPieceAt(state.board, fromPdnSquare(19)!)).toEqual({ type: 'man', color: 'white' });
    expect(getPieceAt(state.board, fromPdnSquare(11)!)).toEqual({ type: 'king', color: 'white' });
    expect(getPieceAt(state.board, fromPdnSquare(9)!)).toEqual({ type: 'man', color: 'black' });
    expect(getPieceAt(state.board, fromPdnSquare(23)!)).toEqual({ type: 'king', color: 'black' });
    expect(state.currentTurn).toBe('black');
  });

  it('decodes a fresh position — no history, not over', () => {
    const state = checkersFenToState('B:W19,21:B9,13');
    expect(state.moveHistory).toEqual([]);
    expect(state.isGameOver).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.movesSinceCapture).toBe(0);
  });

  it('normalizes a non-canonical square order to ascending on re-encode', () => {
    // The PDN spec's own examples group kings at the end; we always write
    // ascending by square so a position has exactly one encoding.
    expect(stateToCheckersFen(checkersFenToState('B:W19,21,26,K11:B9,13,K23')))
      .toBe('B:WK11,19,21,26:B9,13,K23');
  });

  it('accepts the two piece lists in either order, and lowercase king markers', () => {
    const a = checkersFenToState('W:B9,13:W19,21');
    const b = checkersFenToState('W:W19,21:B9,13');
    expect(a.board).toEqual(b.board);
    expect(checkersFenToState('W:Wk11:Bk23').board)
      .toEqual(checkersFenToState('W:WK11:BK23').board);
  });

  it('produces a position the engine can generate legal moves from', () => {
    const state = checkersFenToState('W:W19,21,26:B9,13,17');
    const moves = CheckersEngine.getAllLegalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(CheckersEngine.validateMove(state, move.from, move.to).valid).toBe(true);
    }
  });

  it('rejects malformed input', () => {
    expect(() => checkersFenToState('nonsense')).toThrow(/expected/);
    expect(() => checkersFenToState('X:W18:B12')).toThrow(/side to move/);
    expect(() => checkersFenToState('W:W18:X12')).toThrow(/must start with W or B/);
    expect(() => checkersFenToState('W:W18:W12')).toThrow(/one W list and one B list/);
    expect(() => checkersFenToState('W:W98:B9')).toThrow(/not a square number/);
    expect(() => checkersFenToState('W:W19,19:B9')).toThrow(/listed twice/);
  });

  it('rejects a position where a side has no pieces', () => {
    // Already lost — never a valid start position.
    expect(() => checkersFenToState('W:W:B9')).toThrow(/at least one piece/);
    expect(() => checkersFenToState('W:W19:B')).toThrow(/at least one piece/);
  });
});
