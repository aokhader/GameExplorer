import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../game-logic/chess/engine';
import { createInitialGameState, setPieceAt } from '../game-logic/chess/utils';
import { CheckersEngine } from '../game-logic/checkers/engine';
import {
  createInitialGameState as createCheckersState,
  setPieceAt as setCheckersPiece,
} from '../game-logic/checkers/utils';
import { ReversiEngine } from '../game-logic/reversi/engine';
import type { Board, ChessGameState, Color, Piece } from '../types/chess.types';
import type { CheckersBoard } from '../game-logic/checkers/types';
import { checkersTransition, chessTransition, reversiTransition } from './games';
import { diffBoards, isStaticTransition } from './transition';

/** Both kings plus whatever the test places. Mirrors the premove suite's helper. */
function stateWith(pieces: Array<[string, Piece]>, currentTurn: Color = 'white'): ChessGameState {
  let board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board = setPieceAt(board, 'e1', { type: 'king', color: 'white' });
  board = setPieceAt(board, 'e8', { type: 'king', color: 'black' });
  for (const [pos, piece] of pieces) board = setPieceAt(board, pos, piece);
  return { ...createInitialGameState(), board, currentTurn };
}

/** `a1`-style square to the `{ row, col }` the diff speaks. */
function sq(position: string) {
  return { row: Number(position[1]) - 1, col: position.charCodeAt(0) - 97 };
}

describe('diffBoards', () => {
  it('reports nothing when handed the same board twice', () => {
    const board = ChessEngine.newGame().board;
    expect(isStaticTransition(chessTransition(board, board))).toBe(true);
  });

  it('reports nothing when a position is missing', () => {
    const board = ChessEngine.newGame().board;
    expect(isStaticTransition(chessTransition(null, board))).toBe(true);
    expect(isStaticTransition(chessTransition(board, undefined))).toBe(true);
  });

  it('reports nothing when only off-board state changed', () => {
    // Same pieces, different side to move: a diff must not invent motion.
    const before = ChessEngine.newGame();
    const after = { ...before, currentTurn: 'black' as Color };
    expect(isStaticTransition(chessTransition(before.board, after.board))).toBe(true);
  });
});

describe('chess transitions', () => {
  it('turns a quiet move into one slide and nothing else', () => {
    const before = ChessEngine.newGame();
    const after = ChessEngine.executeMove(before, 'e2', 'e4');

    const t = chessTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq('e2'), to: sq('e4'), morphed: false }]);
    expect(t.fades).toEqual([]);
    expect(t.appears).toEqual([]);
    expect(t.changes).toEqual([]);
  });

  it('makes a capture a slide plus a fade on the destination, never a swap in place', () => {
    // The case that decides the whole design: on the captured square the piece
    // is simply replaced, which is indistinguishable from a reversi flip until
    // the arriving rook finds the square it came from.
    const before = stateWith([
      ['a1', { type: 'rook', color: 'white' }],
      ['a8', { type: 'rook', color: 'black' }],
    ]);
    const after = ChessEngine.executeMove(before, 'a1', 'a8');

    const t = chessTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq('a1'), to: sq('a8'), morphed: false }]);
    expect(t.fades.map((f) => f.at)).toEqual([sq('a8')]);
    expect(t.fades[0].piece).toEqual({ type: 'rook', color: 'black' });
    expect(t.changes).toEqual([]);
  });

  it('slides a promoting pawn into the piece it becomes', () => {
    // chessground animates this wrong — a pawn and a queen never match by role,
    // so the piece jumps. The same-side second pass is what fixes it.
    const before = stateWith([['b7', { type: 'pawn', color: 'white' }]]);
    const after = ChessEngine.executeMove(before, 'b7', 'b8', false, 'queen');

    const t = chessTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq('b7'), to: sq('b8'), morphed: true }]);
    expect(t.appears).toEqual([]);
    expect(t.fades).toEqual([]);
  });

  it('gives castling two slides — the king and the rook', () => {
    const before = stateWith([['h1', { type: 'rook', color: 'white' }]]);
    const after = ChessEngine.executeMove(before, 'e1', 'g1');

    const t = chessTransition(before.board, after.board);

    expect(t.moves).toHaveLength(2);
    expect(t.moves).toContainEqual({ from: sq('e1'), to: sq('g1'), morphed: false });
    expect(t.moves).toContainEqual({ from: sq('h1'), to: sq('f1'), morphed: false });
    expect(t.fades).toEqual([]);
  });

  it('fades the en-passant victim from the square the capturer did not land on', () => {
    const before: ChessGameState = {
      ...stateWith([
        ['e5', { type: 'pawn', color: 'white' }],
        ['d5', { type: 'pawn', color: 'black' }],
      ]),
      enPassantTarget: 'd6',
    };
    const after = ChessEngine.executeMove(before, 'e5', 'd6');

    const t = chessTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq('e5'), to: sq('d6'), morphed: false }]);
    expect(t.fades.map((f) => f.at)).toEqual([sq('d5')]);
  });

  it('pairs identical pieces with the nearer origin, so knights do not cross', () => {
    // Both knights match the arrival by role and colour. Scan order would pick
    // b1; only the distance test picks g1, and only g1 actually moved.
    const before = stateWith([
      ['b1', { type: 'knight', color: 'white' }],
      ['g1', { type: 'knight', color: 'white' }],
    ]);
    const after = ChessEngine.executeMove(before, 'g1', 'f3');

    const t = chessTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq('g1'), to: sq('f3'), morphed: false }]);
  });
});

describe('checkers transitions', () => {
  it('turns a multi-jump into one slide, a fade per victim, and a crowning', () => {
    let board: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
    board = setCheckersPiece(board, 'c4', { type: 'man', color: 'white' });
    board = setCheckersPiece(board, 'd5', { type: 'man', color: 'black' });
    board = setCheckersPiece(board, 'd7', { type: 'man', color: 'black' });
    const before = { ...createCheckersState(), board, currentTurn: 'white' as const };

    // Let the engine find the chain rather than asserting a hand-built one —
    // jump chains are exactly where hand-built checkers positions go wrong.
    const jump = CheckersEngine.getAllLegalMoves(before).find((m) => m.to === 'c8');
    expect(jump, 'c4 should have a double jump landing on c8').toBeDefined();
    const after = CheckersEngine.executeMove(before, jump!);

    const t = checkersTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq('c4'), to: sq('c8'), morphed: true }]);
    expect(t.fades.map((f) => f.at).sort((a, b) => a.row - b.row)).toEqual([sq('d5'), sq('d7')]);
    expect(t.appears).toEqual([]);
    // `morphed` is the crowning: a man left c4 and a king arrived on c8.
    expect(after.board[7][2]).toEqual({ type: 'king', color: 'white' });
  });

  it('turns a plain step into one slide', () => {
    const before = CheckersEngine.newGame();
    const step = CheckersEngine.getAllLegalMoves(before)[0];
    const after = CheckersEngine.executeMove(before, step);

    const t = checkersTransition(before.board, after.board);

    expect(t.moves).toEqual([{ from: sq(step.from), to: sq(step.to), morphed: false }]);
    expect(t.fades).toEqual([]);
  });
});

describe('reversi transitions', () => {
  it('flips discs in place and never slides one', () => {
    const before = ReversiEngine.newGame();
    const move = ReversiEngine.getAllLegalMoves(before)[0];
    const after = ReversiEngine.executeMove(before, move);

    const t = reversiTransition(before.board, after.board);

    // A disc has no origin to travel from. If any of these were `moves`, discs
    // would swim across the board on every capture.
    expect(t.moves).toEqual([]);
    expect(t.fades).toEqual([]);
    expect(t.appears).toEqual([sq(move)]);
    expect(t.changes.length).toBeGreaterThan(0);

    const flipped = after.moveHistory[after.moveHistory.length - 1].flipped;
    expect(t.changes.sort(bySquare)).toEqual(flipped.map(sq).sort(bySquare));
  });

  it('flips a whole row in place', () => {
    // Six discs turning at once is the case where a same-side pairing would be
    // most tempting and most wrong.
    const t = diffBoards(
      [[{ color: 'black' }, { color: 'black' }, { color: 'black' }]],
      [[{ color: 'white' }, { color: 'white' }, { color: 'white' }]],
      { samePiece: (a: { color: string }, b: { color: string }) => a.color === b.color },
    );

    expect(t.moves).toEqual([]);
    expect(t.changes).toHaveLength(3);
    expect(t.appears).toEqual([]);
    expect(t.fades).toEqual([]);
  });
});

function bySquare(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return a.row - b.row || a.col - b.col;
}
