import { describe, expect, it } from 'vitest';
import { GoEngine } from './engine';
import type { GoGameState } from './types';

/**
 * Budgets, not benchmarks.
 *
 * These exist because 13×13 and 19×19 multiply the work per position by 2× and
 * 4.5×, and both boards call the first of these once per position change — so a
 * regression here is felt as a stutter on a phone, which no correctness test
 * would ever catch.
 *
 * **The size pass expected to find work here and did not.** Measured on a dense
 * 19×19 board: legal-move generation 1.3 ms, a single validation 0.08 ms,
 * scoring 0.16 ms. `getAllLegalMoves` already hashes `positionKeys` into a Set
 * once per call rather than re-scanning it per candidate, and a 361-point board
 * is a cheap clone. Nothing was rewritten; this file is the tripwire that keeps
 * it that way.
 *
 * Budgets sit at roughly 10× the measured figure: enough to catch an
 * order-of-magnitude regression, loose enough to survive a slow CI box.
 */

/** A plausible mid-game board, built by playing seeded pseudo-random moves. */
function densePosition(size: number, moves: number): GoGameState {
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  let state = GoEngine.newGame({ size });
  for (let i = 0; i < moves; i++) {
    const legal = GoEngine.getAllLegalMoves(state);
    if (legal.length === 0) break;
    state = GoEngine.executeMove(state, legal[Math.floor(next() * legal.length)]);
  }
  return state;
}

function millis(run: () => void, times: number): number {
  const start = performance.now();
  for (let i = 0; i < times; i++) run();
  return (performance.now() - start) / times;
}

describe('Go engine performance at full board size', () => {
  it('generates legal moves on a dense 19×19 board inside the frame budget', () => {
    const state = densePosition(19, 160);
    // Sanity: a dense board, not an empty one that would make this test a lie.
    expect(state.moveHistory.length).toBeGreaterThan(100);

    const ms = millis(() => GoEngine.getAllLegalMoves(state), 20);
    // eslint-disable-next-line no-console
    console.log(`getAllLegalMoves 19x19: ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(15);
  });

  it('validates a single placement on a long 19×19 history quickly', () => {
    const state = densePosition(19, 160);
    const legal = GoEngine.getAllLegalMoves(state);
    const ms = millis(() => GoEngine.validateMove(state, legal[0]), 200);
    // eslint-disable-next-line no-console
    console.log(`validateMove 19x19: ${ms.toFixed(3)}ms`);
    expect(ms).toBeLessThan(2);
  });

  it('scores a dense 19×19 board quickly', () => {
    const state = densePosition(19, 160);
    const ms = millis(() => GoEngine.score(state), 20);
    // eslint-disable-next-line no-console
    console.log(`score 19x19: ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(5);
  });
});
