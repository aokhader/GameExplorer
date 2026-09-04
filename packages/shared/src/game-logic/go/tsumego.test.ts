import { describe, it, expect } from 'vitest';
import { TSUMEGO_PASS, solveTsumego, tryTsumego } from './tsumego';
import { createInitialGameState, boardKey } from './utils';
import type { GoBoard, GoColor, GoGameState } from './types';

/**
 * Build a position from a diagram. Rows are given **top first** (rank 9 down to
 * rank 1); `board[0]` is rank 1, so they are reversed on the way in.
 * `.` empty, `X` black, `O` white.
 */
function stateFrom(rows: string[], currentTurn: GoColor): GoGameState {
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

/**
 * A black corner group sealed in by white, alive or dead depending on a single
 * point. Its liberties are exactly its eye space, which is what makes it a
 * life-and-death problem rather than a fight — the group cannot run.
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
const THREE_REGION = ['a1', 'a2', 'a3'];

/** The same shape one point longer. A straight four is alive as it stands. */
const STRAIGHT_FOUR = [
  '.........',
  '.........',
  '.........',
  'OO.......',
  'XXO......',
  '.XO......',
  '.XO......',
  '.XO......',
  '.XO......',
];
const FOUR_REGION = ['a1', 'a2', 'a3', 'a4'];

describe('solveTsumego — a straight three', () => {
  it('dies, and only to the vital point', () => {
    const result = solveTsumego(stateFrom(STRAIGHT_THREE, 'white'), {
      region: THREE_REGION,
      target: 'b1',
      goal: 'kill',
    });

    expect(result.solved).toBe(true);
    // The uniqueness this returns is the whole basis of the puzzle gate: if a
    // second move also killed, the puzzle would have two answers and only one
    // would be accepted from the player.
    expect(result.winningMoves).toEqual(['a2']);
  });

  it('lives if the defender gets there first, and only that way', () => {
    const result = solveTsumego(stateFrom(STRAIGHT_THREE, 'black'), {
      region: THREE_REGION,
      target: 'b1',
      goal: 'live',
    });

    expect(result.solved).toBe(true);
    expect(result.winningMoves).toEqual(['a2']);
  });

  it('does not count passing as a way to live', () => {
    const result = solveTsumego(stateFrom(STRAIGHT_THREE, 'black'), {
      region: THREE_REGION,
      target: 'b1',
      goal: 'live',
    });
    expect(result.winningMoves).not.toContain(TSUMEGO_PASS);
  });
});

describe('solveTsumego — a straight four', () => {
  it('cannot be killed', () => {
    const result = solveTsumego(stateFrom(STRAIGHT_FOUR, 'white'), {
      region: FOUR_REGION,
      target: 'b1',
      goal: 'kill',
    });

    expect(result.solved).toBe(false);
    expect(result.winningMoves).toEqual([]);
  });

  it('is already alive, so every reply keeps it alive', () => {
    const result = solveTsumego(stateFrom(STRAIGHT_FOUR, 'black'), {
      region: FOUR_REGION,
      target: 'b1',
      goal: 'live',
    });

    expect(result.solved).toBe(true);
    // Nothing is forced here — including the pass. A puzzle whose key move is
    // not unique looks exactly like this, which is how the gate catches one.
    expect(result.winningMoves).toContain(TSUMEGO_PASS);
    expect(result.winningMoves.length).toBeGreaterThan(1);
  });
});

describe('solveTsumego — a group with two eyes', () => {
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

  it('is settled by the unconditional-life cutoff, not by search', () => {
    const result = solveTsumego(stateFrom(TWO_EYES, 'white'), {
      region: ['a1', 'a3'],
      target: 'b1',
      goal: 'kill',
    });

    expect(result.solved).toBe(false);
    // Benson answers at the root's children; nothing deep is ever explored.
    expect(result.nodes).toBeLessThan(20);
  });
});

describe('solveTsumego — refusals', () => {
  it('refuses a target that is not a stone', () => {
    expect(() =>
      solveTsumego(stateFrom(STRAIGHT_THREE, 'white'), {
        region: THREE_REGION,
        target: 'a1',
        goal: 'kill',
      }),
    ).toThrow(/empty point/i);
  });

  it('refuses a goal the side to move cannot be pursuing', () => {
    // Black to move cannot be the one trying to kill a black group.
    expect(() =>
      solveTsumego(stateFrom(STRAIGHT_THREE, 'black'), {
        region: THREE_REGION,
        target: 'b1',
        goal: 'kill',
      }),
    ).toThrow(/needs white to move/i);
  });

  it('throws rather than guessing when the region is too wide to settle', () => {
    const state = stateFrom(STRAIGHT_THREE, 'white');
    const wide = state.board.flatMap((row, r) =>
      row.map((_, c) => String.fromCharCode(97 + c) + (r + 1)),
    );

    expect(() =>
      solveTsumego(state, { region: wide, target: 'b1', goal: 'kill' }, { nodeLimit: 500 }),
    ).toThrow(/too wide to settle/i);
  });
});

describe('tryTsumego', () => {
  it('answers null instead of throwing when the region is too wide', () => {
    const state = stateFrom(STRAIGHT_THREE, 'white');
    const wide = state.board.flatMap((row, r) =>
      row.map((_, c) => String.fromCharCode(97 + c) + (r + 1)),
    );

    expect(tryTsumego(state, { region: wide, target: 'b1', goal: 'kill' }, { nodeLimit: 500 }))
      .toBeNull();
  });

  it('still propagates an authoring error, which is not a budget problem', () => {
    expect(() =>
      tryTsumego(stateFrom(STRAIGHT_THREE, 'white'), {
        region: THREE_REGION,
        target: 'a1',
        goal: 'kill',
      }),
    ).toThrow(/empty point/i);
  });

  it('agrees with solveTsumego when the region is sane', () => {
    const state = stateFrom(STRAIGHT_THREE, 'white');
    const spec = { region: THREE_REGION, target: 'b1', goal: 'kill' as const };
    expect(tryTsumego(state, spec)).toEqual(solveTsumego(state, spec));
  });
});
