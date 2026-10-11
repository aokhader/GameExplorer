import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CheckersEngine,
  getBestCheckersMove,
  getBestCheckersMoveSliced,
  type CheckersGameState,
} from '@gameexplorer/shared';
import { slicedInBrowser, yieldToBrowser } from '../lib/yieldToBrowser';

/**
 * The gap between the slices of web's checkers and reversi bot searches. Node
 * has `MessageChannel`, so the path a page takes is the one that runs here.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('yieldToBrowser', () => {
  it('wakes waiters in the order they yielded', async () => {
    const order: number[] = [];
    await Promise.all([0, 1, 2, 3].map((i) => yieldToBrowser().then(() => order.push(i))));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('is a task, not a microtask', async () => {
    // Microtasks queued after the yield all run before it comes back; a
    // microtask "gap" would let no click or render in either.
    let microtasksDone = false;
    const resumed = yieldToBrowser().then(() => microtasksDone);
    void Promise.resolve()
      .then(() => undefined)
      .then(() => {
        microtasksDone = true;
      });
    await expect(resumed).resolves.toBe(true);
  });

  it('falls back to a timer where there is no MessageChannel', async () => {
    vi.resetModules();
    vi.stubGlobal('MessageChannel', undefined);
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const { yieldToBrowser: withoutChannel } = await import('../lib/yieldToBrowser');
    await withoutChannel();
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 0);
  });
});

/** A fixed `Math.random`, as e2e's `seedRandom` pins it, counting its draws. */
function seedRandom() {
  let seed = 0x2f6e2b1;
  const counter = { draws: 0 };
  vi.spyOn(Math, 'random').mockImplementation(() => {
    counter.draws++;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  });
  return counter;
}

/** A few positions from a game the bot plays against itself. */
function positions(elo: number, plies: number): CheckersGameState[] {
  seedRandom();
  const out: CheckersGameState[] = [];
  let state = CheckersEngine.newGame();
  for (let i = 0; i < plies && !state.isGameOver; i++) {
    out.push(state);
    const { from, to } = getBestCheckersMove(state, elo);
    state = CheckersEngine.validateMove(state, from, to).resultingState!;
  }
  vi.restoreAllMocks();
  return out;
}

describe('slicedInBrowser', () => {
  // The e2e lines are recorded against the bot's noise and blunder rolls, so
  // the sliced search must make the same draws, not just find the same move.
  // Noisy levels only: at the top the bot draws nothing.
  it.each([500, 1100])('plays what the unsliced bot plays, from the same draws (elo %i)', async (elo) => {
    for (const state of positions(elo, 12)) {
      const syncDraws = seedRandom();
      const expected = getBestCheckersMove(state, elo);
      vi.restoreAllMocks();

      const slicedDraws = seedRandom();
      const actual = await getBestCheckersMoveSliced(state, elo, {
        ...slicedInBrowser(),
        sliceMs: 0,
      });
      vi.restoreAllMocks();

      expect(syncDraws.draws).toBeGreaterThan(0);
      expect(actual).toEqual(expected);
      expect(slicedDraws.draws).toBe(syncDraws.draws);
    }
  });

  it('stops a search when its signal is aborted', async () => {
    const controller = new AbortController();
    const search = getBestCheckersMoveSliced(CheckersEngine.newGame(), 2000, {
      ...slicedInBrowser(controller.signal),
      sliceMs: 0,
    });
    controller.abort();
    await expect(search).rejects.toMatchObject({ name: 'AbortError' });
  });
});
