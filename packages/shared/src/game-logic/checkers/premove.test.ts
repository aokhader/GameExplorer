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
    expect(getCheckersPremoveDestinations(state, 'g3')).toEqual([]);
  });

  it('offers nothing from an empty square', () => {
    const state = CheckersEngine.newGame();
    expect(getCheckersPremoveDestinations(state, 'e5')).toEqual([]);
  });

  it('gives a man its forward step and jump squares only', () => {
    const state = stateWith([['e6', blackMan]], 'white');
    expect(getCheckersPremoveDestinations(state, 'e6').sort()).toEqual(
      ['f5', 'g4', 'd5', 'c4'].sort(),
    );
  });

  it('gives a king all four steps and jumps', () => {
    const state = stateWith([['e4', blackKing]], 'white');
    expect(getCheckersPremoveDestinations(state, 'e4').sort()).toEqual(
      ['f3', 'g2', 'd3', 'c2', 'f5', 'g6', 'd5', 'c6'].sort(),
    );
  });

  it('ignores occupancy — the reply decides which target survives', () => {
    // f5 holds a white man right now; premoving there is offered because the
    // man may move away, and g4 is offered because it may still be there to jump.
    const state = stateWith([['e6', blackMan], ['f5', whiteMan]], 'white');
    const dests = getCheckersPremoveDestinations(state, 'e6');
    expect(dests).toContain('f5');
    expect(dests).toContain('g4');
  });

  it('clips targets that fall off the board', () => {
    // From the a-file there is no left-hand diagonal at all.
    const state = stateWith([['h7', blackMan]], 'white');
    expect(getCheckersPremoveDestinations(state, 'h7').sort()).toEqual(['g6', 'f5'].sort());
  });
});

describe('isCheckersPremoveLegal', () => {
  it('plays out when the arriving position allows it', () => {
    const start = CheckersEngine.newGame();
    const after = CheckersEngine.validateMove(start, 'g3', 'f4').resultingState!;
    expect(isCheckersPremoveLegal(after, { from: 'h6', to: 'g5' })).toBe(true);
  });

  it('is dropped when a capture became mandatory elsewhere', () => {
    // Black must jump e6xf5→g4; the quiet premove c6-d5 is no longer legal.
    const state = stateWith([['e6', blackMan], ['f5', whiteMan], ['c6', blackMan]], 'black');
    expect(isCheckersPremoveLegal(state, { from: 'c6', to: 'd5' })).toBe(false);
    expect(isCheckersPremoveLegal(state, { from: 'e6', to: 'g4' })).toBe(true);
  });

  it('is dropped when it targets the first hop of a longer forced chain', () => {
    // e6 must take both men (…g4 then …e2); stopping on g4 is not a legal move.
    const state = stateWith(
      [['e6', blackMan], ['f5', whiteMan], ['f3', whiteMan]],
      'black',
    );
    expect(isCheckersPremoveLegal(state, { from: 'e6', to: 'g4' })).toBe(false);
    expect(isCheckersPremoveLegal(state, { from: 'e6', to: 'e2' })).toBe(true);
  });

  it('is dropped when the premoved piece was captured', () => {
    const state = stateWith([['c6', blackMan]], 'black');
    expect(isCheckersPremoveLegal(state, { from: 'e6', to: 'f5' })).toBe(false);
  });

  it("is dropped when it isn't the premover's turn yet", () => {
    const state = stateWith([['e6', blackMan]], 'white');
    expect(isCheckersPremoveLegal(state, { from: 'e6', to: 'f5' })).toBe(false);
  });

  it('is dropped once the game is over', () => {
    const state: CheckersGameState = {
      ...stateWith([['e6', blackMan]], 'black'),
      isGameOver: true,
    };
    expect(isCheckersPremoveLegal(state, { from: 'e6', to: 'f5' })).toBe(false);
  });
});
