import { describe, it, expect } from 'vitest';
import {
  getChessPremoveDestinations,
  isChessPremoveLegal,
  isChessPremovePromotion,
} from './premove';
import { ChessEngine } from './engine';
import { createInitialGameState, setPieceAt } from './utils';
import type { Board, ChessGameState, Color, Piece } from '../../types/chess.types';

/** Position with both kings plus whatever the test places, side to move given. */
function stateWith(
  pieces: Array<[string, Piece]>,
  currentTurn: Color = 'white',
): ChessGameState {
  let board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  board = setPieceAt(board, 'e1', { type: 'king', color: 'white' });
  board = setPieceAt(board, 'e8', { type: 'king', color: 'black' });
  for (const [pos, piece] of pieces) board = setPieceAt(board, pos, piece);
  return { ...createInitialGameState(), board, currentTurn };
}

describe('getChessPremoveDestinations', () => {
  it('offers nothing for the side already to move — that player moves for real', () => {
    const state = ChessEngine.newGame(); // white to move
    expect(getChessPremoveDestinations(state, 'g1')).toEqual([]);
  });

  it('offers nothing from an empty square', () => {
    const state = ChessEngine.newGame();
    expect(getChessPremoveDestinations(state, 'e5')).toEqual([]);
  });

  it('gives a knight every jump that stays on the board', () => {
    const state = ChessEngine.newGame(); // white to move, so black premoves
    const dests = getChessPremoveDestinations(state, 'g8');
    expect(dests.sort()).toEqual(['e7', 'f6', 'h6'].sort());
  });

  it('ignores blockers for sliders — the reply may clear the path', () => {
    const state = ChessEngine.newGame();
    // Black's rook is boxed in by its own pieces, but a1 down the a-file and
    // the whole 8th rank are still premovable.
    const dests = getChessPremoveDestinations(state, 'a8');
    expect(dests).toContain('a1');
    expect(dests).toContain('h8');
    expect(dests).toContain('a7'); // own pawn today — capturable by then
  });

  it('gives a pawn its double step, single step and both capture diagonals', () => {
    const state = ChessEngine.newGame();
    const dests = getChessPremoveDestinations(state, 'e7').sort();
    expect(dests).toEqual(['d6', 'e5', 'e6', 'f6'].sort());
  });

  it('drops the double step once the pawn has left its home rank', () => {
    const state = stateWith([['e6', { type: 'pawn', color: 'black' }]], 'white');
    const dests = getChessPremoveDestinations(state, 'e6');
    expect(dests).toContain('e5');
    expect(dests).not.toContain('e4');
  });

  it('offers castling squares while the rights survive, and not after', () => {
    const state = ChessEngine.newGame(); // white to move → black premoves
    expect(getChessPremoveDestinations(state, 'e8')).toEqual(
      expect.arrayContaining(['g8', 'c8']),
    );

    const noRights: ChessGameState = {
      ...state,
      castlingRights: { ...state.castlingRights, blackKingSide: false, blackQueenSide: false },
    };
    const dests = getChessPremoveDestinations(noRights, 'e8');
    expect(dests).not.toContain('g8');
    expect(dests).not.toContain('c8');
    expect(dests).toContain('d8'); // ordinary king steps are untouched
  });
});

describe('isChessPremovePromotion', () => {
  it('flags a pawn premove onto the back rank', () => {
    const state = stateWith([['b7', { type: 'pawn', color: 'white' }]], 'black');
    expect(isChessPremovePromotion(state, 'b7', 'b8')).toBe(true);
    expect(isChessPremovePromotion(state, 'b7', 'b7')).toBe(false);
  });

  it('does not flag other pieces reaching the back rank', () => {
    const state = stateWith([['b7', { type: 'rook', color: 'white' }]], 'black');
    expect(isChessPremovePromotion(state, 'b7', 'b8')).toBe(false);
  });
});

describe('isChessPremoveLegal', () => {
  it('plays out when the arriving position allows it', () => {
    // Black premoves ...e5 while white is still to move.
    const start = ChessEngine.newGame();
    const after = ChessEngine.validateMove(start, 'd2', 'd4').resultingState!;
    expect(isChessPremoveLegal(after, { from: 'e7', to: 'e5' })).toBe(true);
  });

  it('is dropped when the opponent occupied the destination', () => {
    let state = ChessEngine.newGame();
    state = ChessEngine.validateMove(state, 'e2', 'e4').resultingState!; // white
    state = ChessEngine.validateMove(state, 'd7', 'd5').resultingState!; // black
    state = ChessEngine.validateMove(state, 'e4', 'e5').resultingState!; // white takes e5
    // Black's queued ...e5 is now blocked by the white pawn sitting there.
    expect(isChessPremoveLegal(state, { from: 'e7', to: 'e5' })).toBe(false);
  });

  it('is dropped when the premoved piece was captured', () => {
    const state = stateWith([['d4', { type: 'rook', color: 'black' }]], 'black');
    expect(isChessPremoveLegal(state, { from: 'd5', to: 'd8' })).toBe(false);
  });

  it("is dropped when it isn't the premover's turn yet", () => {
    const state = stateWith([['d4', { type: 'rook', color: 'black' }]], 'white');
    expect(isChessPremoveLegal(state, { from: 'd4', to: 'd8' })).toBe(false);
  });

  it('is dropped when the move would leave the king in check', () => {
    // Black rook on e5 is the only thing between a white rook and the black king.
    const state = stateWith(
      [
        ['e5', { type: 'rook', color: 'black' }],
        ['e2', { type: 'rook', color: 'white' }],
      ],
      'black',
    );
    expect(isChessPremoveLegal(state, { from: 'e5', to: 'a5' })).toBe(false);
    expect(isChessPremoveLegal(state, { from: 'e5', to: 'e4' })).toBe(true);
  });

  it('needs the promotion piece it was queued with', () => {
    const state = stateWith([['b7', { type: 'pawn', color: 'white' }]], 'white');
    expect(isChessPremoveLegal(state, { from: 'b7', to: 'b8', promotion: 'queen' })).toBe(true);
  });

  it('is dropped once the game is over', () => {
    const state: ChessGameState = {
      ...stateWith([['d4', { type: 'rook', color: 'black' }]], 'black'),
      isCheckmate: true,
    };
    expect(isChessPremoveLegal(state, { from: 'd4', to: 'd8' })).toBe(false);
  });
});
