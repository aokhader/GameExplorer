/**
 * How a search shares its thread: the gap between slices belongs to the host,
 * and the time ceiling counts that gap.
 *
 * The second half is the one that bit. React Native's zero-delay timers wait
 * for a frame boundary, so on Android most of a search's time went to waiting
 * between slices, and the Master bot on the game screen finished about 540 of
 * its 4,000 playouts in the 3 s it then had (Pixel 8 emulator, dev build,
 * Sep 2026). Nothing on desktop could see it — Node finishes every tier's
 * budget in under a second.
 * `playouts` is reported so a cut-short search is visible rather than inferred
 * from the strength of the moves.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { GoEngine } from '../engine';
import { __testing } from '../bot';
import { classicSearch } from './classic';
import { patternSearch } from './pattern';
import { SEARCH_CEILING_MS } from './types';

const position = () => {
  let state = GoEngine.newGame();
  for (const move of ['e5', 'c3', 'g7', 'c7', 'g3']) state = GoEngine.executeMove(state, move);
  return state;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([patternSearch, classicSearch])('the $id search', (search) => {
  it('gives the thread back through the host’s yield, and the yield cannot change the move', async () => {
    const state = position();
    const candidates = __testing.rootCandidates(state);
    let yields = 0;
    const counted = async () => {
      yields++;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };

    const hosted = await search.search(state, candidates, {
      iterations: 2000,
      seed: 9,
      yieldToHost: counted,
    });
    const plain = await search.search(state, candidates, { iterations: 2000, seed: 9 });

    expect(yields).toBeGreaterThan(0);
    expect(hosted.position).toBe(plain.position);
    expect(hosted.playouts).toBe(2000);
    expect(plain.playouts).toBe(2000);
  });

  it('counts the gaps against the time ceiling and reports the playouts it managed', async () => {
    // A clock that moves 1 ms per reading, so a slice ends every few playouts,
    // and a host whose every gap costs a whole second.
    let clock = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock++);
    let yields = 0;
    const slowHost = async () => {
      yields++;
      clock += 1000;
    };

    const state = position();
    const result = await search.search(state, __testing.rootCandidates(state), {
      iterations: 4000,
      seed: 3,
      yieldToHost: slowHost,
    });

    expect(yields).toBe(Math.ceil(SEARCH_CEILING_MS / 1000));
    expect(result.playouts).toBeGreaterThan(0);
    expect(result.playouts).toBeLessThan(100);
    expect(GoEngine.validateMove(state, result.position).valid).toBe(true);
  });
});
