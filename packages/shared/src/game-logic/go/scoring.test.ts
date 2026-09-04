import { describe, it, expect } from 'vitest';
import {
  boardWithoutStones,
  countStones,
  countTerritory,
  ownershipMap,
  scoreBoard,
} from './scoring';
import { createEmptyBoard } from './utils';
import type { GoBoard, GoColor } from './types';

/** Rows top first (rank 9 down to rank 1). `.` empty, `X` black, `O` white. */
function boardFrom(rows: string[]): GoBoard {
  return rows
    .slice()
    .reverse()
    .map(row => row.split('').map(ch => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));
}

/**
 * Two nine-stone walls, one on the d-file and one on the f-file.
 *
 * The board the tutorial's counting diagram draws, and the clearest position
 * there is for showing the two rulesets apart: they agree on the twenty-seven
 * points each side surrounds and disagree on whether the walls themselves count.
 * 9 + 27 + 27 + 9 + 9 = 81, with the e-file neutral because it touches both.
 */
const TWO_WALLS = [
  '...X.O...',
  '...X.O...',
  '...X.O...',
  '...X.O...',
  '...X.O...',
  '...X.O...',
  '...X.O...',
  '...X.O...',
  '...X.O...',
];

const NO_PRISONERS = { black: 0, white: 0 };

describe('ownershipMap', () => {
  it('gives each enclosed region to the colour that surrounds it', () => {
    const owners = ownershipMap(boardFrom(TWO_WALLS), 9);
    expect(owners.get('a1')).toBe('black');
    expect(owners.get('c9')).toBe('black');
    expect(owners.get('g1')).toBe('white');
    expect(owners.get('i9')).toBe('white');
  });

  it('gives a region touching both colours to nobody', () => {
    const owners = ownershipMap(boardFrom(TWO_WALLS), 9);
    for (const rank of [1, 5, 9]) expect(owners.get(`e${rank}`)).toBeNull();
  });

  it('leaves occupied points out entirely — ask the board for those', () => {
    const owners = ownershipMap(boardFrom(TWO_WALLS), 9);
    expect(owners.has('d5')).toBe(false);
    expect(owners.has('f5')).toBe(false);
    expect(owners.size).toBe(63);
  });

  it('gives an empty board to nobody', () => {
    const owners = ownershipMap(createEmptyBoard(9), 9);
    expect(owners.size).toBe(81);
    expect([...owners.values()].every(owner => owner === null)).toBe(true);
  });
});

describe('countStones and countTerritory', () => {
  it('counts the walls and the space behind them separately', () => {
    const board = boardFrom(TWO_WALLS);
    expect(countStones(board, 9)).toEqual({ black: 9, white: 9 });
    expect(countTerritory(board, 9)).toEqual({ black: 27, white: 27 });
  });
});

describe('scoreBoard', () => {
  const board = boardFrom(TWO_WALLS);

  it('counts stones and territory under area scoring', () => {
    expect(scoreBoard(board, 9, 7.5, 'area', NO_PRISONERS)).toEqual({
      scoring: 'area',
      black: 36,
      white: 43.5,
      komi: 7.5,
      lead: -7.5,
    });
  });

  it('counts territory only under territory scoring', () => {
    // The same board, nine points lighter on each side: a wall you built is
    // worth nothing in itself, only the space it surrounds.
    expect(scoreBoard(board, 9, 7.5, 'territory', NO_PRISONERS)).toEqual({
      scoring: 'territory',
      black: 27,
      white: 34.5,
      komi: 7.5,
      lead: -7.5,
    });
  });

  it('adds prisoners under territory scoring and ignores them under area', () => {
    const prisoners = { black: 4, white: 1 };
    expect(scoreBoard(board, 9, 7.5, 'territory', prisoners).black).toBe(31);
    expect(scoreBoard(board, 9, 7.5, 'territory', prisoners).white).toBe(35.5);

    // Under area scoring the empty point a capture left behind has already been
    // counted, so counting the prisoner too would count it twice.
    expect(scoreBoard(board, 9, 7.5, 'area', prisoners).black).toBe(36);
  });

  it('gives an empty board to white on komi under both rulesets', () => {
    const empty = createEmptyBoard(9);
    for (const scoring of ['area', 'territory'] as const) {
      expect(scoreBoard(empty, 9, 7.5, scoring, NO_PRISONERS)).toMatchObject({
        black: 0,
        white: 7.5,
        lead: -7.5,
      });
    }
  });

  it('can end level at an integer komi', () => {
    // Jigo. Real Go, and reachable from the setup screen's komi presets — which
    // is why the winner of a scored position is allowed to be nobody.
    expect(scoreBoard(board, 9, 0, 'area', NO_PRISONERS).lead).toBe(0);
    expect(scoreBoard(board, 9, 0, 'territory', NO_PRISONERS).lead).toBe(0);
  });

  it('leaves a seki-shaped shared region out of both counts', () => {
    // A region bordered by both colours scores for nobody, which is how seki
    // comes out right without a rule of its own.
    const shared = boardFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      'OOO......',
      'O..O.....',
      'XXXO.....',
    ]);
    const owners = ownershipMap(shared, 9);
    expect(owners.get('b2')).toBeNull();
    expect(owners.get('c2')).toBeNull();
  });
});

describe('boardWithoutStones', () => {
  it('empties the given points and leaves the rest alone', () => {
    const board = boardFrom(TWO_WALLS);
    const next = boardWithoutStones(board, ['d5', 'f5']);

    expect(next[4][3]).toBeNull();
    expect(next[4][5]).toBeNull();
    expect(next[0][3]).toBe('black');
    // The input is never mutated — the whole engine depends on that.
    expect(board[4][3]).toBe('black');
  });

  it('returns the same board when nothing is removed', () => {
    const board = boardFrom(TWO_WALLS);
    expect(boardWithoutStones(board, [])).toBe(board);
  });

  it('turns removed stones into territory for the other side', () => {
    const board = boardFrom(TWO_WALLS);
    const after = boardWithoutStones(board, ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']);
    const owners = ownershipMap(after, 9);

    // With Black's wall gone, everything left of White's wall is White's.
    expect(owners.get('a1')).toBe<GoColor>('white');
    expect(owners.get('d5')).toBe<GoColor>('white');
    // Nine stones plus the other seventy-two points: with nothing left to
    // contest, White owns the whole board.
    expect(scoreBoard(after, 9, 7.5, 'area', { black: 0, white: 9 }).white).toBe(81 + 7.5);
  });
});
