import { describe, expect, it } from 'vitest';
import { fenToState } from './fen';
import { illegalMoveReason } from './explain';

describe('illegalMoveReason', () => {
  it('says a piece cannot reach a square it has no path to', () => {
    const start = fenToState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(illegalMoveReason(start, 'b1', 'b3')).toBe('cantReach');
  });

  it('says the move has to end a check', () => {
    // White king on e1 in check from the rook on e8; a2-a3 is in reach but ignores it.
    const inCheck = fenToState('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1');
    expect(inCheck.isCheck).toBe(true);
    expect(illegalMoveReason(inCheck, 'a2', 'a3')).toBe('inCheck');
  });

  it('says a king cannot step onto an attacked square', () => {
    // The rook on d8 guards the d-file.
    const pos = fenToState('3r3k/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(illegalMoveReason(pos, 'e1', 'd1')).toBe('intoCheck');
  });

  it('says a pinned piece may not leave the line', () => {
    // The bishop on e2 shields its king from the rook on e8.
    const pos = fenToState('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');
    expect(illegalMoveReason(pos, 'e2', 'd3')).toBe('pinned');
  });

  it('ignores a tap on the other side’s piece', () => {
    const start = fenToState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(illegalMoveReason(start, 'e7', 'e5')).toBeNull();
  });
});
