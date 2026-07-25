import { describe, it, expect } from 'vitest';
import { toSan, timelineToSan } from './san';
import { ChessEngine } from './engine';
import type { Board, ChessGameState, PieceType } from '../../types/chess.types';

/**
 * Play a list of `from``to` moves, keeping the state BEFORE each one — the same
 * shape `useLocalGame` stores as its timeline.
 */
function playTimeline(moves: string[], promotion?: PieceType): ChessGameState[] {
  const timeline = [ChessEngine.newGame()];
  for (const move of moves) {
    const before = timeline[timeline.length - 1];
    const result = ChessEngine.validateMove(
      before,
      move.slice(0, 2),
      move.slice(2, 4),
      false,
      promotion,
    );
    expect(result.valid, `${move} should be legal`).toBe(true);
    timeline.push(result.resultingState!);
  }
  return timeline;
}

/** SAN of the last move in a played sequence. */
function lastSan(moves: string[], promotion?: PieceType): string {
  const timeline = playTimeline(moves, promotion);
  const after = timeline[timeline.length - 1];
  const history = after.moveHistory;
  return toSan(timeline[timeline.length - 2], history[history.length - 1], after);
}

/** Board holding only the given squares, e.g. `{ e1: ['king', 'white'] }`. */
function sparseBoard(squares: Record<string, [PieceType, 'white' | 'black']>): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [square, [type, color]] of Object.entries(squares)) {
    board[Number(square[1]) - 1][square.charCodeAt(0) - 97] = { type, color };
  }
  return board;
}

describe('toSan — basics', () => {
  it('writes a quiet pawn push as the destination alone', () => {
    expect(lastSan(['e2e4'])).toBe('e4');
  });

  it('writes a piece move as letter + destination', () => {
    expect(lastSan(['e2e4', 'e7e5', 'g1f3'])).toBe('Nf3');
  });

  it('names the departure file on a pawn capture', () => {
    expect(lastSan(['e2e4', 'd7d5', 'e4d5'])).toBe('exd5');
  });

  it('marks a piece capture with x', () => {
    // 1. e4 d5 2. Nc3 dxe4 3. Nxe4
    expect(lastSan(['e2e4', 'd7d5', 'b1c3', 'd5e4', 'c3e4'])).toBe('Nxe4');
  });

  it('writes castling with Os, not king coordinates', () => {
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O
    expect(lastSan(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'])).toBe('O-O');
  });

  it('writes queenside castling as O-O-O', () => {
    // 1. d4 d5 2. Nc3 Nc6 3. Bf4 Bf5 4. Qd2 Qd7 5. O-O-O
    const moves = ['d2d4', 'd7d5', 'b1c3', 'b8c6', 'c1f4', 'c8f5', 'd1d2', 'd8d7', 'e1c1'];
    expect(lastSan(moves)).toBe('O-O-O');
  });

  it('appends + for check', () => {
    // 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#  → test the check-only case first
    // 1. e4 f5 2. Qh5+ — the queen checks along the diagonal.
    expect(lastSan(['e2e4', 'f7f5', 'd1h5'])).toBe('Qh5+');
  });

  it('appends # for checkmate', () => {
    // Scholar's mate: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
    const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
    expect(lastSan(moves)).toBe('Qxf7#');
  });

  it('writes en passant as a pawn capture on the landing square', () => {
    // 1. e4 a6 2. e5 d5 3. exd6 e.p.
    expect(lastSan(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'])).toBe('exd6');
  });

  it('appends the promotion piece', () => {
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      board: sparseBoard({ e1: ['king', 'white'], a8: ['king', 'black'], g7: ['pawn', 'white'] }),
      moveHistory: [],
    };
    const result = ChessEngine.validateMove(state, 'g7', 'g8', false, 'queen');
    expect(result.valid).toBe(true);
    const history = result.resultingState!.moveHistory;
    expect(toSan(state, history[0])).toBe('g8=Q');
  });
});

describe('toSan — disambiguation', () => {
  it('adds nothing when only one piece can reach the square', () => {
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      board: sparseBoard({ e1: ['king', 'white'], e8: ['king', 'black'], b1: ['knight', 'white'] }),
      moveHistory: [],
      castlingRights: {
        whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false,
      },
    };
    const result = ChessEngine.validateMove(state, 'b1', 'd2');
    expect(toSan(state, result.resultingState!.moveHistory[0])).toBe('Nd2');
  });

  it('disambiguates by file when two knights share a rank', () => {
    // Knights on b1 and f1 both reach d2 — files differ, so "Nbd2".
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      board: sparseBoard({
        e1: ['king', 'white'], e8: ['king', 'black'],
        b1: ['knight', 'white'], f1: ['knight', 'white'],
      }),
      moveHistory: [],
      castlingRights: {
        whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false,
      },
    };
    const result = ChessEngine.validateMove(state, 'b1', 'd2');
    expect(toSan(state, result.resultingState!.moveHistory[0])).toBe('Nbd2');
  });

  it('disambiguates by rank when the files match', () => {
    // Rooks on a1 and a5 both reach a3 — same file, so the rank: "R1a3".
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      board: sparseBoard({
        e1: ['king', 'white'], e8: ['king', 'black'],
        a1: ['rook', 'white'], a5: ['rook', 'white'],
      }),
      moveHistory: [],
      castlingRights: {
        whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false,
      },
    };
    const result = ChessEngine.validateMove(state, 'a1', 'a3');
    expect(toSan(state, result.resultingState!.moveHistory[0])).toBe('R1a3');
  });

  it('falls back to the whole square when file and rank both collide', () => {
    // Queens on a1, a3 and c1 all reach a2... use c3/a1/c1 → three queens see c2.
    const state: ChessGameState = {
      ...ChessEngine.newGame(),
      board: sparseBoard({
        e1: ['king', 'white'], e8: ['king', 'black'],
        a2: ['queen', 'white'], c2: ['queen', 'white'], a4: ['queen', 'white'],
      }),
      moveHistory: [],
      castlingRights: {
        whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false,
      },
    };
    // a2, c2 and a4 all reach c4: a2 shares its file with a4 and its rank with c2.
    const result = ChessEngine.validateMove(state, 'a2', 'c4');
    expect(result.valid).toBe(true);
    expect(toSan(state, result.resultingState!.moveHistory[0])).toBe('Qa2c4');
  });
});

describe('timelineToSan', () => {
  it('renders a whole opening in order', () => {
    const timeline = playTimeline(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']);
    expect(timelineToSan(timeline)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('returns nothing for a fresh game', () => {
    expect(timelineToSan([ChessEngine.newGame()])).toEqual([]);
  });
});
