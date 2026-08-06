import { describe, it, expect } from 'vitest';
import { ChessEngine } from './engine';
import { createInitialGameState, setPieceAt } from './utils';
import { isSquareUnderAttack } from './moves';
import type { Board, ChessGameState, Color, PieceType } from '../../types/chess.types';

/** Build an otherwise-empty board with both kings (so check detection works). */
function emptyBoardWithKings(): Board {
  let board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board = setPieceAt(board, 'e1', { type: 'king', color: 'white' });
  board = setPieceAt(board, 'e8', { type: 'king', color: 'black' });
  return board;
}

describe('ChessEngine.newGame', () => {
  it('starts with white to move and the standard 32 pieces', () => {
    const state = ChessEngine.newGame();
    expect(state.currentTurn).toBe('white');
    const pieceCount = state.board.flat().filter(Boolean).length;
    expect(pieceCount).toBe(32);
    expect(state.castlingRights).toEqual({
      whiteKingSide: true,
      whiteQueenSide: true,
      blackKingSide: true,
      blackQueenSide: true,
    });
    expect(state.enPassantTarget).toBeNull();
  });
});

describe('ChessEngine.validateMove — basics', () => {
  it('accepts a legal pawn double-push and sets the en passant target', () => {
    const state = ChessEngine.newGame();
    const result = ChessEngine.validateMove(state, 'e2', 'e4');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.currentTurn).toBe('black');
    expect(next.enPassantTarget).toBe('e3');
    // Pawn moved, origin empty
    expect(next.board[3][4]).toEqual({ type: 'pawn', color: 'white' });
    expect(next.board[1][4]).toBeNull();
  });

  it("rejects moving the opponent's piece", () => {
    const state = ChessEngine.newGame(); // white to move
    const result = ChessEngine.validateMove(state, 'e7', 'e5');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Not your turn');
  });

  it('rejects an illegal move for the piece', () => {
    const state = ChessEngine.newGame();
    const result = ChessEngine.validateMove(state, 'e2', 'e5'); // pawn can't jump 3
    expect(result.valid).toBe(false);
  });

  it('rejects moving from an empty square', () => {
    const state = ChessEngine.newGame();
    const result = ChessEngine.validateMove(state, 'e3', 'e4');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No piece at starting position');
  });

  it('resets the half-move clock on a pawn move and increments on a quiet move', () => {
    const state = ChessEngine.newGame();
    const afterPawn = ChessEngine.validateMove(state, 'e2', 'e4').resultingState!;
    expect(afterPawn.halfMoveClock).toBe(0);
    // Black knight develops (quiet, non-pawn, non-capture)
    const afterKnight = ChessEngine.validateMove(afterPawn, 'b8', 'c6').resultingState!;
    expect(afterKnight.halfMoveClock).toBe(1);
  });
});

describe('ChessEngine.validateMove — promotion', () => {
  it('signals needsPromotion when a pawn reaches the back rank without a chosen piece', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'a7', { type: 'pawn', color: 'white' });
    const state: ChessGameState = { ...createInitialGameState(), board, currentTurn: 'white' };

    const result = ChessEngine.validateMove(state, 'a7', 'a8');
    expect(result.valid).toBe(true);
    expect(result.needsPromotion).toBe(true);
    expect(result.resultingState).toBeUndefined();
  });

  it('promotes to the chosen piece when provided', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'a7', { type: 'pawn', color: 'white' });
    const state: ChessGameState = { ...createInitialGameState(), board, currentTurn: 'white' };

    const result = ChessEngine.validateMove(state, 'a7', 'a8', false, 'queen');
    expect(result.valid).toBe(true);
    expect(result.resultingState!.board[7][0]).toEqual({ type: 'queen', color: 'white' });
  });
});

describe('ChessEngine.validateMove — castling', () => {
  it('castles kingside, moving both king and rook', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'h1', { type: 'rook', color: 'white' });
    const state: ChessGameState = { ...createInitialGameState(), board, currentTurn: 'white' };

    const result = ChessEngine.validateMove(state, 'e1', 'g1');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.board[0][6]).toEqual({ type: 'king', color: 'white' }); // g1
    expect(next.board[0][5]).toEqual({ type: 'rook', color: 'white' }); // f1
    expect(next.board[0][4]).toBeNull(); // e1 vacated
    expect(next.board[0][7]).toBeNull(); // h1 vacated
  });

  it('rejects castling after the king has lost its rights', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'h1', { type: 'rook', color: 'white' });
    const state: ChessGameState = {
      ...createInitialGameState(),
      board,
      currentTurn: 'white',
      castlingRights: {
        whiteKingSide: false,
        whiteQueenSide: false,
        blackKingSide: true,
        blackQueenSide: true,
      },
    };
    const result = ChessEngine.validateMove(state, 'e1', 'g1');
    expect(result.valid).toBe(false);
  });
});

describe('ChessEngine.validateMove — en passant', () => {
  it('captures en passant and removes the passed pawn', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'e5', { type: 'pawn', color: 'white' });
    board = setPieceAt(board, 'd5', { type: 'pawn', color: 'black' });
    const state: ChessGameState = {
      ...createInitialGameState(),
      board,
      currentTurn: 'white',
      enPassantTarget: 'd6',
    };

    const result = ChessEngine.validateMove(state, 'e5', 'd6');
    expect(result.valid).toBe(true);
    const next = result.resultingState!;
    expect(next.board[5][3]).toEqual({ type: 'pawn', color: 'white' }); // d6 occupied
    expect(next.board[4][3]).toBeNull(); // d5 captured pawn removed
    expect(next.board[4][4]).toBeNull(); // e5 vacated
  });
});

describe('ChessEngine — checkmate detection (Fool\'s Mate)', () => {
  it('flags checkmate after 1. f3 e5 2. g4 Qh4#', () => {
    let state = ChessEngine.newGame();
    state = ChessEngine.validateMove(state, 'f2', 'f3').resultingState!;
    state = ChessEngine.validateMove(state, 'e7', 'e5').resultingState!;
    state = ChessEngine.validateMove(state, 'g2', 'g4').resultingState!;
    const mate = ChessEngine.validateMove(state, 'd8', 'h4');
    expect(mate.valid).toBe(true);
    const final = mate.resultingState!;
    expect(final.isCheck).toBe(true);
    expect(final.isCheckmate).toBe(true);
  });
});

describe('ChessEngine — fifty-move rule', () => {
  /**
   * A position with only the two kings, so both sides can shuffle indefinitely
   * without ever resetting the clock.
   */
  function kingsOnly(halfMoveClock: number): ChessGameState {
    return {
      ...createInitialGameState(),
      board: emptyBoardWithKings(),
      currentTurn: 'white',
      halfMoveClock,
    };
  }

  it('does not draw at 50 plies — the rule counts 50 moves by EACH player', () => {
    // Regression test for the old `halfMoveClock >= 50` threshold, which drew
    // the game at 25 moves each.
    const next = ChessEngine.validateMove(kingsOnly(50), 'e1', 'd1').resultingState!;
    expect(next.halfMoveClock).toBe(51);
    expect(next.isDraw).toBe(false);
  });

  it('does not draw at 99 plies', () => {
    const next = ChessEngine.validateMove(kingsOnly(98), 'e1', 'd1').resultingState!;
    expect(next.halfMoveClock).toBe(99);
    expect(next.isDraw).toBe(false);
  });

  it('draws at 100 plies', () => {
    const next = ChessEngine.validateMove(kingsOnly(99), 'e1', 'd1').resultingState!;
    expect(next.halfMoveClock).toBe(100);
    expect(next.isDraw).toBe(true);
  });

  it('resets the clock on a pawn move, clearing an imminent draw', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'a2', { type: 'pawn', color: 'white' });
    const state: ChessGameState = {
      ...createInitialGameState(),
      board,
      currentTurn: 'white',
      halfMoveClock: 99,
    };

    const next = ChessEngine.validateMove(state, 'a2', 'a3').resultingState!;
    expect(next.halfMoveClock).toBe(0);
    expect(next.isDraw).toBe(false);
  });

  it('resets the clock on a capture', () => {
    let board = emptyBoardWithKings();
    board = setPieceAt(board, 'd4', { type: 'rook', color: 'white' });
    board = setPieceAt(board, 'd7', { type: 'rook', color: 'black' });
    const state: ChessGameState = {
      ...createInitialGameState(),
      board,
      currentTurn: 'white',
      halfMoveClock: 99,
    };

    const next = ChessEngine.validateMove(state, 'd4', 'd7').resultingState!;
    expect(next.halfMoveClock).toBe(0);
    expect(next.isDraw).toBe(false);
  });

  it('draws after 100 quiet plies actually played out, and not after 98', () => {
    // Two kings shuffling between two squares each — 4 plies per cycle.
    const cycle = [
      ['e1', 'd1'], ['e8', 'd8'], ['d1', 'e1'], ['d8', 'e8'],
    ] as const;

    let state = kingsOnly(0);
    const seen: boolean[] = [];
    for (let ply = 0; ply < 100; ply++) {
      const [from, to] = cycle[ply % 4];
      const result = ChessEngine.validateMove(state, from, to);
      expect(result.valid).toBe(true);
      state = result.resultingState!;
      seen.push(state.isDraw);
    }

    expect(state.halfMoveClock).toBe(100);
    expect(seen[97]).toBe(false); // after 98 plies
    expect(seen[98]).toBe(false); // after 99 plies
    expect(seen[99]).toBe(true);  // after 100 plies
  });
});

/**
 * `isSquareUnderAttack` was rewritten from "generate every enemy piece's moves
 * and search the results" to a geometric probe outward from the square, because
 * it is the hottest function in the engine. These pin the cases where the two
 * forms could disagree.
 */
describe('attack detection', () => {
  function board(pieces: Record<string, [PieceType, Color]>): Board {
    let b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (const [square, [type, color]] of Object.entries(pieces)) {
      b = setPieceAt(b, square, { type, color });
    }
    return b;
  }

  it('sees a pawn covering an EMPTY square, which the move-list form could not', () => {
    // A pawn's legal moves only list a diagonal when something is standing on
    // it, so asking "what can this pawn move to" missed the squares it covers.
    const b = board({ d4: ['pawn', 'white'] });
    expect(isSquareUnderAttack(b, 'c5', 'white')).toBe(true);
    expect(isSquareUnderAttack(b, 'e5', 'white')).toBe(true);
  });

  it('does not treat a pawn PUSH square as attacked', () => {
    const b = board({ d4: ['pawn', 'white'] });
    expect(isSquareUnderAttack(b, 'd5', 'white')).toBe(false);
    expect(isSquareUnderAttack(b, 'd6', 'white')).toBe(false);
    // …and a pawn never attacks backwards.
    expect(isSquareUnderAttack(b, 'c3', 'white')).toBe(false);
  });

  it('stops a slider at the first piece on the ray', () => {
    const b = board({ a1: ['rook', 'white'], a4: ['pawn', 'black'] });
    expect(isSquareUnderAttack(b, 'a4', 'white')).toBe(true);  // the blocker itself
    expect(isSquareUnderAttack(b, 'a5', 'white')).toBe(false); // behind it
    expect(isSquareUnderAttack(b, 'h1', 'white')).toBe(true);  // open rank
  });

  it('separates the two slider families', () => {
    const b = board({ d4: ['bishop', 'white'] });
    expect(isSquareUnderAttack(b, 'h8', 'white')).toBe(true);
    expect(isSquareUnderAttack(b, 'd8', 'white')).toBe(false);

    const r = board({ d4: ['rook', 'white'] });
    expect(isSquareUnderAttack(r, 'd8', 'white')).toBe(true);
    expect(isSquareUnderAttack(r, 'h8', 'white')).toBe(false);

    const q = board({ d4: ['queen', 'white'] });
    expect(isSquareUnderAttack(q, 'h8', 'white')).toBe(true);
    expect(isSquareUnderAttack(q, 'd8', 'white')).toBe(true);
  });

  it('handles knights and kings, and ignores the attacker’s own colour', () => {
    const b = board({ d4: ['knight', 'black'], h1: ['king', 'black'] });
    expect(isSquareUnderAttack(b, 'e6', 'black')).toBe(true);
    expect(isSquareUnderAttack(b, 'e5', 'black')).toBe(false); // not a knight square
    expect(isSquareUnderAttack(b, 'g2', 'black')).toBe(true);
    expect(isSquareUnderAttack(b, 'f1', 'black')).toBe(false); // two files from the king
    expect(isSquareUnderAttack(b, 'e6', 'white')).toBe(false); // wrong colour
  });

  it('reports check through the engine, and legality follows it', () => {
    const state = ChessEngine.withStatusFlags({
      ...createInitialGameState(),
      // Both kings, or `withStatusFlags` declines to report status at all.
      board: board({
        e1: ['king', 'white'],
        h8: ['king', 'black'],
        e7: ['rook', 'black'],
        a2: ['pawn', 'white'],
      }),
    });
    expect(state.isCheck).toBe(true);
    expect(state.isCheckmate).toBe(false);

    // Every legal answer must deal with the check — the a2 pawn cannot move.
    const moves = ChessEngine.getAllLegalMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.from === 'e1')).toBe(true);
    expect(moves.some((m) => m.to === 'e2')).toBe(false); // still on the file
  });
});
