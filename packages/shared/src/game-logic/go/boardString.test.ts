import { describe, it, expect } from 'vitest';
import { GO_EMPTY_POSITION, goBoardStringToState, stateToGoBoardString } from './boardString';
import { GoEngine } from './engine';
import { boardKey } from './utils';

const CORNER = [
  '........./',
  '........./',
  '........./',
  '........./',
  'OO......./',
  'XXO....../',
  '.XO....../',
  '.XO....../',
  '.XO......',
].join('');

describe('stateToGoBoardString', () => {
  it('writes the top rank first, then the side to move', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executeMove(state, 'a9'); // black, top-left
    state = GoEngine.executeMove(state, 'i1'); // white, bottom-right

    expect(stateToGoBoardString(state)).toBe(
      'X......../........./........./........./........./........./........./........./........O b',
    );
  });

  it('describes the empty board', () => {
    expect(GO_EMPTY_POSITION).toBe(
      '........./........./........./........./........./........./........./........./......... b',
    );
  });
});

describe('goBoardStringToState', () => {
  it('round-trips every position it can produce', () => {
    for (const position of [GO_EMPTY_POSITION, `${CORNER} b`, `${CORNER} w`]) {
      expect(stateToGoBoardString(goBoardStringToState(position))).toBe(position);
    }
  });

  it('puts the stones where the diagram draws them', () => {
    const state = goBoardStringToState(`${CORNER} w`);
    expect(state.currentTurn).toBe('white');
    expect(state.board[0][1]).toBe('black'); // b1
    expect(state.board[0][2]).toBe('white'); // c1
    expect(state.board[4][0]).toBe('white'); // a5
    expect(state.board[8][8]).toBeNull(); // i9
  });

  it('starts a fresh game rather than inheriting one', () => {
    const state = goBoardStringToState(`${CORNER} b`);
    expect(state.moveHistory).toEqual([]);
    expect(state.captured).toEqual({ black: 0, white: 0 });
    expect(state.consecutivePasses).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.isGameOver).toBe(false);
    // Superko starts from the position given, not from an empty board.
    expect(state.positionKeys).toEqual([boardKey(state.board)]);
  });

  it('parses a multi-line literal, so a position can be authored as a diagram', () => {
    const authored = `
      ........./
      ........./
      ........./
      ........./
      OO......./
      XXO....../
      .XO....../
      .XO....../
      .XO...... w
    `;

    expect(stateToGoBoardString(goBoardStringToState(authored))).toBe(`${CORNER} w`);
  });

  it('reads the board edge off the rows, so it is not pinned to 9×9', () => {
    const state = goBoardStringToState('XXX/.O./... b');
    expect(state.size).toBe(3);
    expect(state.board[2][0]).toBe('black');
    expect(stateToGoBoardString(state)).toBe('XXX/.O./... b');
  });

  it('refuses a position with no side to move', () => {
    expect(() => goBoardStringToState(CORNER)).toThrow(/expected rows/i);
  });

  it('refuses a row of the wrong length', () => {
    expect(() => goBoardStringToState('XXX/.O/... b')).toThrow(/row 2 has 2 points/i);
  });

  it('refuses an unknown character rather than treating it as empty', () => {
    expect(() => goBoardStringToState('XXX/.Q./... b')).toThrow(/unknown point/i);
  });
});
