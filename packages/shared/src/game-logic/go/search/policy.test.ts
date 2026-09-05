/**
 * The playout policy.
 *
 * Two kinds of assertion here, and the split matters.
 *
 * The **rule** is tested at `tactics: 1`, where it either fires or it is broken:
 * a group in atari next to the last move gets taken, every time, from every
 * seed. That is a statement about the code.
 *
 * The **shipped policy** is tested at its real setting, where the same rule
 * fires only a quarter of the time on purpose. That is not a weaker version of
 * the first assertion, it is a different claim: a playout that always answers
 * atari makes the *search* worse, because every simulation then follows the same
 * forced line and thousands of playouts sample one variation instead of
 * thousands. The numbers behind that are in `policy.ts`; this file pins the
 * behaviour they justify, so nobody later "fixes" the probability back to 1.
 */
import { describe, it, expect } from 'vitest';
import {
  BLACK,
  EMPTY,
  WHITE,
  createRandom,
  createScratch,
  geometryFor,
  playFast,
  positionToIndex,
  toFastBoard,
} from '../fastBoard';
import {
  FULL_POLICY,
  UNIFORM_POLICY,
  createLocalBuffer,
  policyMove,
  policyPlayout,
  type PolicyOptions,
} from './policy';
import { boardKey, createInitialGameState } from '../utils';
import type { GoBoard, GoGameState } from '../types';

/** The tactical rule with the randomisation removed, to test the rule itself. */
const ALWAYS_TACTICS: PolicyOptions = { tactics: 1, avoidSelfAtari: false };
/** The self-atari refusal, which the shipped policy measured harmful and disables. */
const REFUSE_SELF_ATARI: PolicyOptions = { tactics: 0, avoidSelfAtari: true };

function stateFrom(rows: string[]): GoGameState {
  const size = rows.length;
  const board: GoBoard = rows
    .slice()
    .reverse()
    .map((row) => row.split('').map((ch) => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));
  return { ...createInitialGameState({ size }), board, positionKeys: [boardKey(board)] };
}

function setup(rows: string[]) {
  const state = stateFrom(rows);
  const geo = geometryFor(state.size);
  const scratch = createScratch(geo.points);
  for (let i = 0; i < geo.points; i++) scratch.order[i] = i;
  return {
    board: toFastBoard(state),
    geo,
    scratch,
    local: createLocalBuffer(),
    at: (position: string) => positionToIndex(position, state.size),
  };
}

/**
 * The policy is randomised, so a single call proves nothing. Every assertion
 * below runs it over many seeds and asks how often it did the right thing.
 */
function chosen(
  rows: string[],
  color: number,
  last: string,
  options: PolicyOptions,
  seeds = 40,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (let seed = 1; seed <= seeds; seed++) {
    const { board, geo, scratch, local, at } = setup(rows);
    const played = policyMove(
      board,
      geo,
      color,
      at(last),
      createRandom(seed),
      scratch,
      options,
      local,
    );
    const size = rows.length;
    const key =
      played < 0
        ? 'pass'
        : String.fromCharCode(97 + (played % size)) + (Math.floor(played / size) + 1);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** White has just played f5; its three stones have one liberty, at g5. */
const WHITE_IN_ATARI = [
  '.........',
  '.........',
  '.........',
  '...XXX...',
  '..XOOO...',
  '...XXX...',
  '.........',
  '.........',
  '.........',
];

/** Black's three stones are the ones in atari, and White has just played c5. */
const BLACK_IN_ATARI = [
  '.........',
  '.........',
  '.........',
  '...OOO...',
  '..OXXX...',
  '...OOO...',
  '.........',
  '.........',
  '.........',
];

describe('the tactical rule, with the randomisation removed', () => {
  it('always takes a group the last move left in atari', () => {
    const counts = chosen(WHITE_IN_ATARI, BLACK, 'f5', ALWAYS_TACTICS);
    expect(counts.get('g5')).toBe(40);
  });

  it('always saves its own group when the last move puts it in atari', () => {
    const counts = chosen(BLACK_IN_ATARI, BLACK, 'c5', ALWAYS_TACTICS);
    expect(counts.get('g5')).toBe(40);
  });

  it('does neither with the rule switched off', () => {
    const counts = chosen(WHITE_IN_ATARI, BLACK, 'f5', UNIFORM_POLICY);
    // With no policy at all the capture is one point among some seventy.
    expect(counts.get('g5') ?? 0).toBeLessThan(10);
  });
});

describe('the shipped policy', () => {
  it('answers atari sometimes and not always — deliberately', () => {
    /*
     * The point of the whole file. At p=1 this is 40/40 and the search is
     * measurably WORSE, because every playout from this position then plays the
     * same sequence. Somewhere in between is where the knowledge helps and the
     * sampling survives.
     */
    const counts = chosen(WHITE_IN_ATARI, BLACK, 'f5', FULL_POLICY);
    const captures = counts.get('g5') ?? 0;
    expect(captures).toBeGreaterThan(0);
    expect(captures).toBeLessThan(40);
  });

  it('does not refuse self-atari, which measured harmful', () => {
    expect(FULL_POLICY.avoidSelfAtari).toBe(false);
  });
});

describe('the self-atari refusal, kept only so it can be re-measured', () => {
  it('never plays a point that leaves it on one liberty for nothing', () => {
    const rows = ['.....', '.....', '.O...', 'O.O..', '.....'];
    const counts = chosen(rows, BLACK, 'a2', REFUSE_SELF_ATARI);
    expect(counts.get('b2') ?? 0).toBe(0);
  });

  it('will play one anyway when the board offers nothing else', () => {
    /*
     * The end of a playout: every remaining point is self-atari. Refusing them
     * all would make the player pass with points still on the board, and hand
     * the simulation a final score nobody would have reached.
     */
    const { board, geo, scratch, local, at } = setup([
      'OOOOO',
      'OOOOO',
      'OOOOO',
      'OOOO.',
      'OOOO.',
    ]);
    const played = policyMove(
      board, geo, BLACK, at('a1'), createRandom(1), scratch, REFUSE_SELF_ATARI, local,
    );
    expect([at('e1'), at('e2')]).toContain(played);
  });
});

describe('policyPlayout', () => {
  it.each([9, 13, 19])('terminates and leaves a legal board at %i×%i', (size) => {
    const state = createInitialGameState({ size });
    const geo = geometryFor(size);
    const scratch = createScratch(geo.points);
    for (let i = 0; i < geo.points; i++) scratch.order[i] = i;
    const board = toFastBoard(state);

    const lead = policyPlayout(
      board,
      geo,
      BLACK,
      -1,
      createRandom(7),
      scratch,
      FULL_POLICY,
      createLocalBuffer(),
    );

    expect(Number.isFinite(lead)).toBe(true);
    expect(Math.abs(lead)).toBeLessThanOrEqual(geo.points);

    // Every stone left standing must have a liberty: a playout that leaves a
    // captured group on the board is scoring a position that cannot exist.
    for (let idx = 0; idx < geo.points; idx++) {
      if (board[idx] === EMPTY) continue;
      const color = board[idx];
      board[idx] = EMPTY;
      expect(playFast(board, geo, idx, color, scratch)).toBe(true);
    }
  });

  it('reports every point it plays, with the colour that played it', () => {
    // RAVE is built entirely on this callback, and a colour swapped here would
    // credit each side with the other's good moves — which does not crash, it
    // just makes the search worse for no visible reason.
    const geo = geometryFor(9);
    const scratch = createScratch(geo.points);
    for (let i = 0; i < geo.points; i++) scratch.order[i] = i;
    const board = toFastBoard(createInitialGameState({ size: 9 }));

    const seen: { idx: number; color: number }[] = [];
    policyPlayout(
      board, geo, BLACK, -1, createRandom(3), scratch, FULL_POLICY, createLocalBuffer(),
      (idx, color) => seen.push({ idx, color }),
    );

    expect(seen.length).toBeGreaterThan(20);
    expect(seen[0].color).toBe(BLACK);
    expect(new Set(seen.map((m) => m.color))).toEqual(new Set([BLACK, WHITE]));
    for (const { idx } of seen) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(geo.points);
    }
  });

  it('is deterministic for a given seed', () => {
    const run = (): number => {
      const geo = geometryFor(9);
      const scratch = createScratch(geo.points);
      for (let i = 0; i < geo.points; i++) scratch.order[i] = i;
      return policyPlayout(
        toFastBoard(createInitialGameState({ size: 9 })),
        geo,
        BLACK,
        -1,
        createRandom(42),
        scratch,
        FULL_POLICY,
        createLocalBuffer(),
      );
    };
    expect(run()).toBe(run());
  });
});
