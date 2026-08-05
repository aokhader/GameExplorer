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

  it('anchors the numbering at a8 = 1 and h1 = 32', () => {
    expect(fromPdnSquare(1)).toBe('a8');
    expect(fromPdnSquare(32)).toBe('h1');
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
    'B:WK10,18,24,27:B12,16,K22',
    'W:WK1:BK32',
    'B:W21,22:B1,2,3',
  ])('round-trips %s', (fen) => {
    expect(stateToCheckersFen(checkersFenToState(fen))).toBe(fen);
  });

  it('decodes the opening position to the same board createInitialGameState builds', () => {
    const decoded = checkersFenToState(CHECKERS_START_FEN);
    expect(decoded.board).toEqual(createInitialGameState().board);
    expect(decoded.currentTurn).toBe('white');
  });

  it('places kings and men on the right squares', () => {
    const state = checkersFenToState('B:W18,K10:B12,K22');
    expect(getPieceAt(state.board, fromPdnSquare(18)!)).toEqual({ type: 'man', color: 'white' });
    expect(getPieceAt(state.board, fromPdnSquare(10)!)).toEqual({ type: 'king', color: 'white' });
    expect(getPieceAt(state.board, fromPdnSquare(12)!)).toEqual({ type: 'man', color: 'black' });
    expect(getPieceAt(state.board, fromPdnSquare(22)!)).toEqual({ type: 'king', color: 'black' });
    expect(state.currentTurn).toBe('black');
  });

  it('decodes a fresh position — no history, not over', () => {
    const state = checkersFenToState('B:W18,24:B12,16');
    expect(state.moveHistory).toEqual([]);
    expect(state.isGameOver).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.movesSinceCapture).toBe(0);
  });

  it('normalizes a non-canonical square order to ascending on re-encode', () => {
    // The PDN spec's own examples group kings at the end; we always write
    // ascending by square so a position has exactly one encoding.
    expect(stateToCheckersFen(checkersFenToState('B:W18,24,27,K10:B12,16,K22')))
      .toBe('B:WK10,18,24,27:B12,16,K22');
  });

  it('accepts the two piece lists in either order, and lowercase king markers', () => {
    const a = checkersFenToState('W:B12,16:W18,24');
    const b = checkersFenToState('W:W18,24:B12,16');
    expect(a.board).toEqual(b.board);
    expect(checkersFenToState('W:Wk10:Bk22').board)
      .toEqual(checkersFenToState('W:WK10:BK22').board);
  });

  it('produces a position the engine can generate legal moves from', () => {
    const state = checkersFenToState('W:W18,24,27:B12,16,20');
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
    expect(() => checkersFenToState('W:W99:B12')).toThrow(/not a square number/);
    expect(() => checkersFenToState('W:W18,18:B12')).toThrow(/listed twice/);
  });

  it('rejects a position where a side has no pieces', () => {
    // Already lost — never a valid start position.
    expect(() => checkersFenToState('W:W:B12')).toThrow(/at least one piece/);
    expect(() => checkersFenToState('W:W18:B')).toThrow(/at least one piece/);
  });
});
