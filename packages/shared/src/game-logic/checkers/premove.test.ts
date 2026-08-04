import { describe, it, expect } from 'vitest';
import { getCheckersPremoveDestinations, isCheckersPremoveLegal } from './premove';
import { CheckersEngine } from './engine';
import { createInitialGameState, setPieceAt } from './utils';
import type { CheckersBoard, CheckersGameState, CheckersPiece } from './types';

function stateWith(
  pieces: Array<[string, CheckersPiece]>,
  currentTurn: 'white' | 'black' = 'white',
): CheckersGameState {
  let board: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [pos, piece] of pieces) board = setPieceAt(board, pos, piece);
  return { ...createInitialGameState(), board, currentTurn };
}

const whiteMan = { type: 'man', color: 'white' } as const;
const blackMan = { type: 'man', color: 'black' } as const;
const blackKing = { type: 'king', color: 'black' } as const;

describe('getCheckersPremoveDestinations', () => {
  it('offers nothing for the side already to move', () => {
    const state = CheckersEngine.newGame(); // white to move
    expect(getCheckersPremoveDestinations(state, 'b3')).toEqual([]);
  });

  it('offers nothing from an empty square', () => {
    const state = CheckersEngine.newGame();
    expect(getCheckersPremoveDestinations(state, 'd5')).toEqual([]);
  });

  it('gives a man its forward step and jump squares only', () => {
    const state = stateWith([['d6', blackMan]], 'white');
    expect(getCheckersPremoveDestinations(state, 'd6').sort()).toEqual(
      ['c5', 'b4', 'e5', 'f4'].sort(),
    );
  });

  it('gives a king all four steps and jumps', () => {
    const state = stateWith([['d4', blackKing]], 'white');
    expect(getCheckersPremoveDestinations(state, 'd4').sort()).toEqual(
      ['c3', 'b2', 'e3', 'f2', 'c5', 'b6', 'e5', 'f6'].sort(),
    );
  });

  it('ignores occupancy — the reply decides which target survives', () => {
    // c5 holds a white man right now; premoving there is offered because the
    // man may move away, and b4 is offered because it may still be there to jump.
    const state = stateWith([['d6', blackMan], ['c5', whiteMan]], 'white');
    const dests = getCheckersPremoveDestinations(state, 'd6');
    expect(dests).toContain('c5');
    expect(dests).toContain('b4');
  });

  it('clips targets that fall off the board', () => {
    // From the a-file there is no left-hand diagonal at all.
    const state = stateWith([['a7', blackMan]], 'white');
    expect(getCheckersPremoveDestinations(state, 'a7').sort()).toEqual(['b6', 'c5'].sort());
  });
});

describe('isCheckersPremoveLegal', () => {
  it('plays out when the arriving position allows it', () => {
    const start = CheckersEngine.newGame();
    const after = CheckersEngine.validateMove(start, 'b3', 'c4').resultingState!;
    expect(isCheckersPremoveLegal(after, { from: 'a6', to: 'b5' })).toBe(true);
  });

  it('is dropped when a capture became mandatory elsewhere', () => {
    // Black must jump d6xc5→b4; the quiet premove f6-e5 is no longer legal.
    const state = stateWith([['d6', blackMan], ['c5', whiteMan], ['f6', blackMan]], 'black');
    expect(isCheckersPremoveLegal(state, { from: 'f6', to: 'e5' })).toBe(false);
    expect(isCheckersPremoveLegal(state, { from: 'd6', to: 'b4' })).toBe(true);
  });

  it('is dropped when it targets the first hop of a longer forced chain', () => {
    // d6 must take both men (…b4 then …d2); stopping on b4 is not a legal move.
    const state = stateWith(
      [['d6', blackMan], ['c5', whiteMan], ['c3', whiteMan]],
      'black',
    );
    expect(isCheckersPremoveLegal(state, { from: 'd6', to: 'b4' })).toBe(false);
    expect(isCheckersPremoveLegal(state, { from: 'd6', to: 'd2' })).toBe(true);
  });

  it('is dropped when the premoved piece was captured', () => {
    const state = stateWith([['f6', blackMan]], 'black');
    expect(isCheckersPremoveLegal(state, { from: 'd6', to: 'c5' })).toBe(false);
  });

  it("is dropped when it isn't the premover's turn yet", () => {
    const state = stateWith([['d6', blackMan]], 'white');
    expect(isCheckersPremoveLegal(state, { from: 'd6', to: 'c5' })).toBe(false);
  });

  it('is dropped once the game is over', () => {
    const state: CheckersGameState = {
      ...stateWith([['d6', blackMan]], 'black'),
      isGameOver: true,
    };
    expect(isCheckersPremoveLegal(state, { from: 'd6', to: 'c5' })).toBe(false);
  });
});
