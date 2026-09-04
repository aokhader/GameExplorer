import { describe, it, expect } from 'vitest';
import { detectDeadStones, toggleDeadChain } from './deadStones';
import { GoEngine } from './engine';
import { boardKey, createInitialGameState } from './utils';
import type { GoBoard, GoColor, GoGameState } from './types';

/** Rows top first (rank 9 down to rank 1). `.` empty, `X` black, `O` white. */
function stateFrom(rows: string[], currentTurn: GoColor = 'black'): GoGameState {
  const board: GoBoard = rows
    .slice()
    .reverse()
    .map(row => row.split('').map(ch => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));

  return {
    ...createInitialGameState({ size: rows.length }),
    board,
    currentTurn,
    positionKeys: [boardKey(board)],
  };
}

describe('detectDeadStones', () => {
  it('finds nothing on an empty board', () => {
    expect(detectDeadStones(GoEngine.newGame())).toEqual([]);
  });

  it('marks a group sealed into a straight three', () => {
    // Black's corner group can only make one eye; White kills at a2. Every
    // stone of the chain goes, not just the one the proof started from.
    const state = stateFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      'OO.......',
      'XXO......',
      '.XO......',
      '.XO......',
      '.XO......',
    ]);

    expect(detectDeadStones(state)).toEqual(['a4', 'b1', 'b2', 'b3', 'b4']);
  });

  it('leaves the same group alone once it has two eyes', () => {
    const state = stateFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      'OO.......',
      'XXO......',
      '.XO......',
      'XXO......',
      '.XO......',
    ]);

    expect(detectDeadStones(state)).toEqual([]);
  });

  it('leaves a straight four alone — it is alive as it stands', () => {
    const state = stateFrom([
      '.........',
      '.........',
      '.........',
      'OO.......',
      'XXO......',
      '.XO......',
      '.XO......',
      '.XO......',
      '.XO......',
    ]);

    expect(detectDeadStones(state)).toEqual([]);
  });

  it('marks dead invaders inside a small pocket of enemy territory', () => {
    // Three white stones in two separate chains, sealed into a seven-point
    // pocket of Black's corner with no way to build two eyes between them.
    // Both chains are settled even though the proof runs once per chain.
    const state = stateFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      'XXXX.....',
      'OO.X.....',
      '..OX.....',
      'XX.X.....',
      'XXXX.....',
    ]);

    expect(detectDeadStones(state)).toEqual(['a4', 'b4', 'c3']);
  });

  it('says nothing about a group with a large open area to live in', () => {
    // Nothing here is settled, and nothing is provable. The review must not
    // guess: an unmarked group costs the same points the game charged before
    // this feature existed, while a wrongly marked one cannot be argued with.
    const state = stateFrom([
      '...X.....',
      '...X.....',
      '...X..O..',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
      '...X.....',
    ]);

    expect(detectDeadStones(state)).toEqual([]);
  });

  it('never contradicts unconditional life, whatever else it decides', () => {
    const state = stateFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      'OO.......',
      'XXO......',
      '.XO......',
      'XXO......',
      '.XO......',
    ]);

    const dead = new Set(detectDeadStones(state));
    for (const stone of ['a2', 'a4', 'b1', 'b2', 'b3', 'b4']) {
      expect(dead.has(stone)).toBe(false);
    }
  });

  it('produces marks the engine accepts as they stand', () => {
    const state = GoEngine.executePass(
      GoEngine.executePass(
        stateFrom([
          '.........',
          '.........',
          '.........',
          '.........',
          'OO.......',
          'XXO......',
          '.XO......',
          '.XO......',
          '.XO......',
        ]),
      ),
    );

    const dead = detectDeadStones(state);
    // The round trip that matters: nothing detection proposes may be filtered
    // out by `validMarks`, or the review's preview and its result would differ.
    expect(GoEngine.validMarks(state, dead)).toEqual(dead);
  });
});

describe('toggleDeadChain', () => {
  /** A finished corner: Black is sealed into a straight three, White is not. */
  const state = stateFrom([
    '.........',
    '.........',
    '.........',
    '.........',
    'OO.......',
    'XXO......',
    '.XO......',
    '.XO......',
    '.XO......',
  ]);
  const BLACK_CHAIN = ['a4', 'b1', 'b2', 'b3', 'b4'];

  it('marks the whole chain from any one of its stones', () => {
    expect(toggleDeadChain(state, [], 'b3')).toEqual(BLACK_CHAIN);
    expect(toggleDeadChain(state, [], 'a4')).toEqual(BLACK_CHAIN);
  });

  it('unmarks the whole chain on a second tap', () => {
    expect(toggleDeadChain(state, BLACK_CHAIN, 'b3')).toEqual([]);
  });

  it('leaves other marks alone', () => {
    // White's wall is one chain of four, and is not unconditionally alive here,
    // so the review is allowed to argue about it too.
    const WHITE_WALL = ['c1', 'c2', 'c3', 'c4'];
    const both = toggleDeadChain(state, BLACK_CHAIN, 'c1');
    expect(both).toEqual([...BLACK_CHAIN, ...WHITE_WALL].sort());

    expect(toggleDeadChain(state, both, 'b3')).toEqual(WHITE_WALL);
  });

  it('does nothing on an empty point', () => {
    expect(toggleDeadChain(state, BLACK_CHAIN, 'i9')).toEqual(BLACK_CHAIN);
  });

  it('refuses a group with two real eyes', () => {
    const alive = stateFrom([
      '.........',
      '.........',
      '.........',
      '.........',
      'OO.......',
      'XXO......',
      '.XO......',
      'XXO......',
      '.XO......',
    ]);
    expect(toggleDeadChain(alive, [], 'b2')).toEqual([]);
  });

  it('always returns a sorted set, so the review has one canonical state', () => {
    const marks = toggleDeadChain(state, ['c3', 'c1'], 'b1');
    expect(marks).toEqual([...marks].sort());
  });
});
