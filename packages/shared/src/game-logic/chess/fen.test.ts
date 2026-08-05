import { describe, it, expect } from 'vitest';
import { stateToFen, fenToState } from './fen';
import { ChessEngine } from './engine';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

describe('stateToFen / fenToState round trip', () => {
  it('encodes the initial position as the standard start FEN', () => {
    expect(stateToFen(ChessEngine.newGame())).toBe(START_FEN);
  });

  it.each([
    START_FEN,
    // Kiwipete — castling rights on both sides, pieces everywhere.
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    // En passant target set.
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
    // No castling rights, non-zero clocks.
    '8/8/4k3/8/8/4K3/4P3/8 b - - 13 47',
  ])('round-trips %s', (fen) => {
    expect(stateToFen(fenToState(fen))).toBe(fen);
  });

  it('rejects malformed input', () => {
    expect(() => fenToState('not a fen')).toThrow();
    expect(() => fenToState('8/8/8 w - -')).toThrow(/ranks/);
    expect(() => fenToState('8/8/8/8/8/8/8/X7 w - - 0 1')).toThrow(/unknown piece/);
  });
});

describe('fenToState — terminal status flags', () => {
  it('reports a position that is in check', () => {
    // Black king on e8, white rook on e1 — black to move, in check.
    const state = fenToState('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1');
    expect(state.isCheck).toBe(true);
    expect(state.isCheckmate).toBe(false);
  });

  it('reports checkmate (back-rank mate, black to move)', () => {
    // Rook on e8 checks along the back rank; the king's own f7/g7/h7 pawns
    // leave it nowhere to run.
    const state = fenToState('4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1');
    expect(state.isCheck).toBe(true);
    expect(state.isCheckmate).toBe(true);
    expect(state.isStalemate).toBe(false);
  });

  it('reports stalemate, and stalemate counts as a draw', () => {
    // Classic corner stalemate: black king a8, white queen c7, black to move.
    const state = fenToState('k7/2Q5/8/8/8/8/8/6K1 b - - 0 1');
    expect(state.isCheck).toBe(false);
    expect(state.isStalemate).toBe(true);
    expect(state.isDraw).toBe(true);
  });

  it('leaves an ordinary quiet position with no flags set', () => {
    const state = fenToState(START_FEN);
    expect(state.isCheck).toBe(false);
    expect(state.isCheckmate).toBe(false);
    expect(state.isStalemate).toBe(false);
    expect(state.isDraw).toBe(false);
  });
});

describe('fenToState — positions that are not legal chess', () => {
  // The analysis page clears the board to an empty FEN and builds a position up
  // one piece at a time, so it holds these states constantly. Without the
  // both-kings guard an empty board reads as "no legal moves, not in check" —
  // i.e. stalemate and a draw.
  it('reports nothing for an empty board', () => {
    const state = fenToState(EMPTY_FEN);
    expect(state.isCheck).toBe(false);
    expect(state.isCheckmate).toBe(false);
    expect(state.isStalemate).toBe(false);
    expect(state.isDraw).toBe(false);
  });

  it('reports nothing when only one king is on the board', () => {
    const state = fenToState('4k3/8/8/8/8/8/8/8 w - - 0 1');
    expect(state.isStalemate).toBe(false);
    expect(state.isDraw).toBe(false);
  });

  it('still decodes the board and side to move for a partial position', () => {
    const state = fenToState('4k3/8/8/8/8/8/8/8 b - - 0 1');
    expect(state.currentTurn).toBe('black');
    expect(state.board.flat().filter(Boolean)).toHaveLength(1);
  });
});

describe('ChessEngine.withStatusFlags', () => {
  it('agrees with the flags executeMove sets for the same position', () => {
    // Reach a real position by playing moves, then decode its FEN and compare.
    let state = ChessEngine.newGame();
    for (const [from, to] of [
      ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'], // Fool's mate
    ] as const) {
      const result = ChessEngine.validateMove(state, from, to);
      expect(result.valid).toBe(true);
      state = result.resultingState!;
    }
    expect(state.isCheckmate).toBe(true);

    const decoded = fenToState(stateToFen(state));
    expect(decoded.isCheck).toBe(state.isCheck);
    expect(decoded.isCheckmate).toBe(state.isCheckmate);
    expect(decoded.isStalemate).toBe(state.isStalemate);
    expect(decoded.isDraw).toBe(state.isDraw);
  });

  it('does not mutate the state it is given', () => {
    const source = fenToState(EMPTY_FEN);
    const flagged = ChessEngine.withStatusFlags({ ...source, isCheck: true });
    expect(flagged).not.toBe(source);
    expect(source.isCheck).toBe(false);
  });
});
