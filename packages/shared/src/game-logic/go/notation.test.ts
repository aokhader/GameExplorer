import { describe, it, expect } from 'vitest';
import {
  GO_PASS_NOTATION,
  fromGoPoint,
  goColumnIndex,
  goColumnLabel,
  moveHistoryToGo,
  toGoMove,
  toGoPoint,
} from './notation';
import { GoEngine } from './engine';
import type { GoMove } from './types';

describe('Go column labels', () => {
  it('skips the letter I, as every Go board does', () => {
    expect(goColumnLabel(7)).toBe('H');
    expect(goColumnLabel(8)).toBe('J');
    expect(goColumnLabel(9)).toBe('K');
    expect(goColumnIndex('J')).toBe(8);
    expect(goColumnIndex('I')).toBe(-1);
  });

  it('labels a 9x9 board A through J', () => {
    const labels = Array.from({ length: 9 }, (_, i) => goColumnLabel(i));
    expect(labels.join('')).toBe('ABCDEFGHJ');
  });
});

describe('point conversion', () => {
  it('translates the engine position to what a player reads', () => {
    expect(toGoPoint('a1')).toBe('A1');
    expect(toGoPoint('h9')).toBe('H9');
    expect(toGoPoint('i9')).toBe('J9'); // the gap: the 9th file is J
    expect(toGoPoint('e5')).toBe('E5');
  });

  it('round-trips every point on the board', () => {
    for (let row = 1; row <= 9; row++) {
      for (let col = 0; col < 9; col++) {
        const position = String.fromCharCode(97 + col) + row;
        expect(fromGoPoint(toGoPoint(position))).toBe(position);
      }
    }
  });
});

describe('move notation', () => {
  it('writes a placement as its point and a pass as Pass', () => {
    const placement: GoMove = { position: 'e5', color: 'black', captures: [] };
    const pass: GoMove = { position: null, color: 'white', captures: [] };
    expect(toGoMove(placement)).toBe('E5');
    expect(toGoMove(pass)).toBe(GO_PASS_NOTATION);
  });

  it('writes a whole game, passes included', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executeMove(state, 'e5');
    state = GoEngine.executeMove(state, 'i9');
    state = GoEngine.executePass(state);
    expect(moveHistoryToGo(state.moveHistory)).toEqual(['E5', 'J9', 'Pass']);
  });
});
