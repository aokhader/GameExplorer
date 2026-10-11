/**
 * The sliced bots must play exactly what the unsliced ones play.
 *
 * Web's e2e suite pins `Math.random` (`seedRandom`) to replay a known bot line,
 * so "the same move" is not enough: the engine's draws have to come in the same
 * order too, or the next move in a pinned line changes. Each engine test seeds
 * `Math.random`, runs the search both ways, and compares the move *and* the
 * number of draws, with the sliced run pausing at every interior node — the
 * most pauses it can take.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChessEngine } from '../game-logic/chess/engine';
import { getBestMoveElo, getBestMoveEloSliced } from '../game-logic/chess/weakEngine';
import { CheckersEngine } from '../game-logic/checkers/engine';
import {
  getBestCheckersMove,
  getBestCheckersMoveSliced,
} from '../game-logic/checkers/weakEngine';
import { ReversiEngine } from '../game-logic/reversi/engine';
import {
  getBestReversiMove,
  getBestReversiMoveSliced,
} from '../game-logic/reversi/weakEngine';
import { runSearch, runSearchSliced, type PausableSearch } from './slicedSearch';

/** A search with `n` interior nodes that counts how often it paused. */
function counter(n: number, pauses: { count: number }): PausableSearch<number> {
  return function* (shouldPause) {
    let visited = 0;
    for (let i = 0; i < n; i++) {
      if (shouldPause()) {
        pauses.count++;
        yield;
      }
      visited++;
    }
    return visited;
  };
}

describe('runSearch', () => {
  it('runs to the end without ever pausing', () => {
    const pauses = { count: 0 };
    expect(runSearch(counter(50, pauses))).toBe(50);
    expect(pauses.count).toBe(0);
  });
});

describe('runSearchSliced', () => {
  it('pauses when the slice is used up, and gives the thread back each time', async () => {
    const pauses = { count: 0 };
    const order: string[] = [];
    // Queued before the search starts: a microtask pause would never let it in.
    setTimeout(() => order.push('timer'), 0);
    const result = await runSearchSliced(counter(5, pauses), { sliceMs: 0 });
    order.push('search');

    expect(result).toBe(5);
    expect(pauses.count).toBe(5);
    expect(order).toEqual(['timer', 'search']);
  });

  it('does not pause while the slice lasts', async () => {
    const pauses = { count: 0 };
    await expect(runSearchSliced(counter(50, pauses), { sliceMs: 60_000 })).resolves.toBe(50);
    expect(pauses.count).toBe(0);
  });

  it('hands the thread back through the host yield when one is given', async () => {
    // React Native passes its own: its timers wait for the next frame.
    const pauses = { count: 0 };
    const yieldToHost = vi.fn(() => Promise.resolve());
    await expect(
      runSearchSliced(counter(4, pauses), { sliceMs: 0, yieldToHost }),
    ).resolves.toBe(4);
    expect(yieldToHost).toHaveBeenCalledTimes(4);
  });

  it('rejects with an AbortError once the signal is set', async () => {
    const signal = { aborted: false };
    const pauses = { count: 0 };
    const search = runSearchSliced(counter(1000, pauses), { sliceMs: 0, signal });
    signal.aborted = true;

    await expect(search).rejects.toMatchObject({ name: 'AbortError' });
    // It stopped at the first pause rather than finishing the search.
    expect(pauses.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The three bots
// ---------------------------------------------------------------------------

/** mulberry32 over a counter — any fixed sequence will do. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let draws = 0;
function seedRandom(seed: number) {
  const random = seeded(seed);
  draws = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    draws++;
    return random();
  });
}

/** Run one position both ways from the same seed. */
async function bothWays<M>(
  seed: number,
  sync: () => M,
  sliced: () => Promise<M>,
): Promise<{ sync: [M, number]; sliced: [M, number] }> {
  seedRandom(seed);
  const a = sync();
  const aDraws = draws;

  seedRandom(seed);
  const b = await sliced();
  return { sync: [a, aDraws], sliced: [b, draws] };
}

/** A few positions from a game the bot plays against itself. */
function line<S>(start: S, plies: number, step: (s: S) => S | null): S[] {
  const out: S[] = [];
  let s: S | null = start;
  for (let i = 0; i < plies && s; i++) {
    out.push(s);
    s = step(s);
  }
  return out;
}

/**
 * Pause at every interior node — thousands of pauses a search — and resume on a
 * microtask, which keeps that fast. When a search resumes has no bearing on
 * what it plays.
 */
const EVERY_NODE = { sliceMs: 0, yieldToHost: () => Promise.resolve() };

describe('sliced bots play the same move after the same draws', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chess, across the in-house bands', async () => {
    seedRandom(7);
    const positions = line(ChessEngine.newGame(), 10, (s) => {
      if (s.isCheckmate || s.isStalemate || s.isDraw) return null;
      const m = getBestMoveElo(s, 700);
      return ChessEngine.validateMove(s, m.from, m.to, false, m.promotion).resultingState ?? null;
    });

    for (const [i, s] of positions.entries()) {
      // Depth 1 to 3 on every position; the depth-4 band on a couple (it is the
      // slow one, and the one that matters most).
      const elos = i % 4 === 0 ? [500, 900, 1150, 1300] : [500, 900, 1150];
      for (const elo of elos) {
        const r = await bothWays(
          i * 31 + elo,
          () => getBestMoveElo(s, elo),
          () => getBestMoveEloSliced(s, elo, EVERY_NODE),
        );
        expect(r.sliced).toEqual(r.sync);
      }
    }
  });

  it('checkers, every depth', async () => {
    seedRandom(11);
    const positions = line(CheckersEngine.newGame(), 16, (s) => {
      if (s.isGameOver) return null;
      const m = getBestCheckersMove(s, 600);
      return CheckersEngine.validateMove(s, m.from, m.to).resultingState ?? null;
    });

    for (const [i, s] of positions.entries()) {
      for (const elo of [500, 800, 1100, 1400, 1700, 2000]) {
        const r = await bothWays(
          i * 31 + elo,
          () => getBestCheckersMove(s, elo),
          () => getBestCheckersMoveSliced(s, elo, EVERY_NODE),
        );
        expect(r.sliced).toEqual(r.sync);
      }
    }
  });

  it('reversi, every depth', async () => {
    seedRandom(13);
    const positions = line(ReversiEngine.newGame(), 9, (s) => {
      if (s.isGameOver) return null;
      if (ReversiEngine.getAllLegalMoves(s).length === 0) return ReversiEngine.executePass(s);
      return ReversiEngine.executeMove(s, getBestReversiMove(s, 600).position);
    }).filter((s) => ReversiEngine.getAllLegalMoves(s).length > 0);

    for (const [i, s] of positions.entries()) {
      for (const elo of [500, 800, 1100, 1400, 1700, 2000]) {
        const r = await bothWays(
          i * 31 + elo,
          () => getBestReversiMove(s, elo),
          () => getBestReversiMoveSliced(s, elo, EVERY_NODE),
        );
        expect(r.sliced).toEqual(r.sync);
      }
    }
  });
});
