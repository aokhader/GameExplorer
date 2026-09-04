import { describe, it, expect } from 'vitest';
import { isPassAlive, passAliveChains } from './benson';
import { createEmptyBoard } from './utils';
import type { GoBoard } from './types';

/**
 * Build a board from a diagram. Rows are given **top first** (rank 9 down to
 * rank 1), which is how a board is drawn; `board[0]` is rank 1, so the rows are
 * reversed on the way in. `.` empty, `X` black, `O` white.
 */
function boardFrom(rows: string[]): GoBoard {
  return rows
    .slice()
    .reverse()
    .map(row => row.split('').map(ch => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));
}

/**
 * A black corner group, fully surrounded by white, whose only liberties are the
 * three points of its eye space at a1–a3. Every life-and-death fact about a
 * straight three is visible in this one shape, so both this file and the solver
 * tests are built on it.
 */
const STRAIGHT_THREE = [
  '.........',
  '.........',
  '.........',
  '.........',
  'OO.......',
  'XXO......',
  '.XO......',
  '.XO......',
  '.XO......',
];

/** The same corner after Black has taken the vital point at a2. */
const TWO_EYES = [
  '.........',
  '.........',
  '.........',
  '.........',
  'OO.......',
  'XXO......',
  '.XO......',
  'XXO......',
  '.XO......',
];

describe('passAliveChains', () => {
  it('finds nothing on an empty board', () => {
    const board = createEmptyBoard(9);
    expect(passAliveChains(board, 9, 'black').size).toBe(0);
    expect(passAliveChains(board, 9, 'white').size).toBe(0);
  });

  it('calls a group with two real eyes unconditionally alive', () => {
    const alive = passAliveChains(boardFrom(TWO_EYES), 9, 'black');
    expect([...alive].sort()).toEqual(['a2', 'a4', 'b1', 'b2', 'b3', 'b4']);
  });

  it('refuses a group whose whole eye space is one straight three', () => {
    // The region a1–a3 is vital — every point in it is a liberty — but it is
    // only ONE vital region, and White to play kills by taking a2. Benson is
    // right to withhold the verdict.
    expect(passAliveChains(boardFrom(STRAIGHT_THREE), 9, 'black').size).toBe(0);
  });

  it('refuses a lone stone', () => {
    const board = createEmptyBoard(9);
    board[4][4] = 'black';
    expect(passAliveChains(board, 9, 'black').size).toBe(0);
  });

  it('does not confuse the two colours', () => {
    const board = boardFrom(TWO_EYES);
    // White's stones here are an open wall with no eye space of their own.
    expect(passAliveChains(board, 9, 'white').size).toBe(0);
  });

  it('refuses a wall around a large open territory — the documented limit', () => {
    // Nine black stones down the d-file enclose 27 points to their left. Any
    // Go player calls that alive; Benson does not, because "unconditional"
    // grants the opponent unlimited consecutive moves and most of those 27
    // points are not liberties of the wall. Callers must read "not pass-alive"
    // as "not proven alive", never as "dead" — this test is what pins that.
    const wall = boardFrom([
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
    ]);
    expect(passAliveChains(wall, 9, 'black').size).toBe(0);
  });

  it('handles several chains of the same colour independently', () => {
    // The live corner group, plus a doomed black stone out in white's area.
    const rows = [...TWO_EYES];
    rows[0] = '.......X.';
    const alive = passAliveChains(boardFrom(rows), 9, 'black');
    expect(alive.has('b2')).toBe(true);
    expect(alive.has('h9')).toBe(false);
  });
});

describe('isPassAlive', () => {
  it('answers for the stone at a point', () => {
    const board = boardFrom(TWO_EYES);
    expect(isPassAlive(board, 'b2', 9)).toBe(true);
    expect(isPassAlive(board, 'c1', 9)).toBe(false);
  });

  it('is false on an empty point rather than throwing', () => {
    expect(isPassAlive(boardFrom(TWO_EYES), 'i9', 9)).toBe(false);
  });
});
