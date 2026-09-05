/**
 * The flat-board primitives, and in particular the three tactical probes the
 * shaped playout policy is built on.
 *
 * These are the functions that decide whether a playout resembles Go, so being
 * subtly wrong here does not produce a crash or a failing assertion anywhere —
 * it produces a bot that is quietly bad, which is the hardest kind of bug to
 * notice in a game whose moves are hard to judge by eye.
 */
import { describe, it, expect } from 'vitest';
import {
  BLACK,
  EMPTY,
  WHITE,
  createScratch,
  geometryFor,
  groupSingleLiberty,
  isEye,
  isSelfAtari,
  playFast,
  positionToIndex,
  toFastBoard,
} from './fastBoard';
import { boardKey, createInitialGameState } from './utils';
import type { GoBoard, GoColor, GoGameState } from './types';

function stateFrom(rows: string[], currentTurn: GoColor = 'black'): GoGameState {
  const cleaned = rows.map((row) => row.replace(/\s/g, ''));
  const size = cleaned.length;
  const board: GoBoard = cleaned
    .slice()
    .reverse()
    .map((row) => row.split('').map((ch) => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));
  return {
    ...createInitialGameState({ size }),
    board,
    currentTurn,
    positionKeys: [boardKey(board)],
  };
}

/** Everything a probe needs, from a board drawn as text. */
function setup(rows: string[]) {
  const state = stateFrom(rows);
  const geo = geometryFor(state.size);
  return {
    board: toFastBoard(state),
    geo,
    scratch: createScratch(geo.points),
    at: (position: string) => positionToIndex(position, state.size),
  };
}

describe('geometryFor', () => {
  it('caches one geometry per size', () => {
    expect(geometryFor(9)).toBe(geometryFor(9));
    expect(geometryFor(13)).not.toBe(geometryFor(9));
  });

  it('gives a corner two orthogonal neighbours and an edge three', () => {
    const geo = geometryFor(9);
    expect(geo.neighborCount[positionToIndex('a1', 9)]).toBe(2);
    expect(geo.neighborCount[positionToIndex('e1', 9)]).toBe(3);
    expect(geo.neighborCount[positionToIndex('e5', 9)]).toBe(4);
  });

  it('agrees with itself at every size we offer', () => {
    for (const size of [9, 13, 19]) {
      const geo = geometryFor(size);
      expect(geo.points).toBe(size * size);

      for (let idx = 0; idx < geo.points; idx++) {
        // Every listed neighbour is on the board and genuinely adjacent, and
        // adjacency is symmetric — a geometry that is not is a geometry where
        // captures work in one direction only.
        for (let i = 0; i < geo.neighborCount[idx]; i++) {
          const neighbor = geo.neighbors[idx * 4 + i];
          expect(neighbor).toBeGreaterThanOrEqual(0);
          expect(neighbor).toBeLessThan(geo.points);
          const dr = Math.abs(Math.floor(neighbor / size) - Math.floor(idx / size));
          const dc = Math.abs((neighbor % size) - (idx % size));
          expect(dr + dc).toBe(1);

          const back = Array.from(
            geo.neighbors.subarray(neighbor * 4, neighbor * 4 + geo.neighborCount[neighbor]),
          );
          expect(back).toContain(idx);
        }
      }
    }
  });
});

describe('groupSingleLiberty', () => {
  it('finds the one point that captures a group in atari', () => {
    // White's three stones have a single liberty at g5.
    const { board, geo, scratch, at } = setup([
      '.........',
      '.........',
      '.........',
      '...XXX...',
      '..XOOO...',
      '...XXX...',
      '.........',
      '.........',
      '.........',
    ]);
    expect(groupSingleLiberty(board, geo, at('d5'), scratch)).toBe(at('g5'));
  });

  it('reports −1 for a group with room to breathe', () => {
    const { board, geo, scratch, at } = setup([
      '.....',
      '.....',
      '..X..',
      '.....',
      '.....',
    ]);
    expect(groupSingleLiberty(board, geo, at('c3'), scratch)).toBe(-1);
  });

  it('reports −1 for an empty point', () => {
    const { board, geo, scratch, at } = setup(['...', '...', '...']);
    expect(groupSingleLiberty(board, geo, at('b2'), scratch)).toBe(-1);
  });

  it('counts two liberties reachable from different ends of a long chain as two', () => {
    // A five-stone wall with exactly one liberty at each end — the shape a
    // naive "first empty point wins" implementation reports as atari.
    const { board, geo, scratch, at } = setup([
      'OXXXXXO',
      'OOOOOOO',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ]);
    expect(groupSingleLiberty(board, geo, at('d7'), scratch)).toBe(-1);
  });
});

describe('isSelfAtari', () => {
  it('refuses a point that leaves the new stone on one liberty', () => {
    // b2 is surrounded by white on three sides; playing there leaves one liberty.
    const { board, geo, scratch, at } = setup([
      '.....',
      '.....',
      '.O...',
      'O.O..',
      '.....',
    ]);
    expect(isSelfAtari(board, geo, at('b2'), BLACK, scratch)).toBe(true);
  });

  it('allows a capture even when the stone would otherwise have no liberties at all', () => {
    /*
     * White a1 is in atari, its one liberty a2. Every other neighbour of a2 is
     * white, so playing there is *suicide* on the board as it stands — and it
     * is legal and good, because it takes a1 first. A self-atari test that
     * reasons about liberties without accounting for the capture forbids this
     * move, and with it every throw-in and snapback in the game.
     */
    const { board, geo, scratch, at } = setup([
      '.....',
      '.....',
      'O....',
      '.O...',
      'OX...',
    ]);
    expect(groupSingleLiberty(board, geo, at('a1'), scratch)).toBe(at('a2'));
    expect(isSelfAtari(board, geo, at('a2'), BLACK, scratch)).toBe(false);
    expect(playFast(board, geo, at('a2'), BLACK, scratch)).toBe(true);
    expect(board[at('a1')]).toBe(EMPTY);
  });

  it('allows an ordinary move in open space', () => {
    const { board, geo, scratch, at } = setup(['.....', '.....', '.....', '.....', '.....']);
    expect(isSelfAtari(board, geo, at('c3'), BLACK, scratch)).toBe(false);
  });

  it('sees that joining a friendly group can save a move from being self-atari', () => {
    // b1 alone would have one liberty; connected to the group above it has more.
    const { board, geo, scratch, at } = setup([
      '.....',
      '.....',
      '.....',
      '.X...',
      'O.O..',
    ]);
    expect(isSelfAtari(board, geo, at('b1'), BLACK, scratch)).toBe(false);
  });

  it('leaves the board exactly as it found it', () => {
    const { board, geo, scratch, at } = setup([
      '.....',
      '.....',
      '.O...',
      'O.O..',
      '.....',
    ]);
    const before = Uint8Array.from(board);
    isSelfAtari(board, geo, at('b2'), BLACK, scratch);
    expect(Array.from(board)).toEqual(Array.from(before));
  });
});

describe('playFast', () => {
  it('captures a group and empties its points', () => {
    const { board, geo, scratch, at } = setup([
      '.........',
      '.........',
      '.........',
      '...XXX...',
      '..XOOO...',
      '...XXX...',
      '.........',
      '.........',
      '.........',
    ]);
    expect(playFast(board, geo, at('g5'), BLACK, scratch)).toBe(true);
    for (const point of ['d5', 'e5', 'f5']) expect(board[at(point)]).toBe(EMPTY);
    expect(board[at('g5')]).toBe(BLACK);
  });

  it('refuses suicide and leaves the board untouched', () => {
    const { board, geo, scratch, at } = setup([
      '.....',
      '.....',
      '.O...',
      'O.O..',
      '.O...',
    ]);
    const before = Uint8Array.from(board);
    expect(playFast(board, geo, at('b2'), BLACK, scratch)).toBe(false);
    expect(Array.from(board)).toEqual(Array.from(before));
  });
});

describe('isEye', () => {
  it('is true for a point surrounded orthogonally and on its diagonals', () => {
    const { board, geo, at } = setup([
      '.....',
      '.....',
      'XXX..',
      'X.X..',
      'XXX..',
    ]);
    expect(isEye(board, geo, at('b2'), BLACK)).toBe(true);
    expect(isEye(board, geo, at('b2'), WHITE)).toBe(false);
  });

  it('tolerates one enemy diagonal in the centre but not two — the false-eye rule', () => {
    const oneDiagonal = setup([
      '.....',
      '.....',
      'OXX..',
      'X.X..',
      'XXX..',
    ]);
    expect(isEye(oneDiagonal.board, oneDiagonal.geo, oneDiagonal.at('b2'), BLACK)).toBe(true);

    const twoDiagonals = setup([
      '.....',
      '.....',
      'OXO..',
      'X.X..',
      'XXX..',
    ]);
    expect(isEye(twoDiagonals.board, twoDiagonals.geo, twoDiagonals.at('b2'), BLACK)).toBe(false);
  });

  it('allows no enemy diagonal at all on the edge, where one is enough to kill it', () => {
    // a2 sits on the left edge, so it has only two diagonals and the rule
    // tightens: any enemy stone on one means this is not an eye.
    const { board, geo, at } = setup([
      '.....',
      '.....',
      'XX...',
      '.X...',
      'OX...',
    ]);
    expect(isEye(board, geo, at('a2'), BLACK)).toBe(false);
  });
});
