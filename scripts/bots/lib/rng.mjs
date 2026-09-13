/**
 * Seeded randomness for calibration runs.
 *
 * The in-house TypeScript engines take their randomness from `Math.random`, so
 * the only way to make a trial reproducible is to swap the global for its
 * duration. That is what `withSeed` does.
 *
 * Note this is the same technique `scripts/puzzles/calibrate.mjs` uses inline.
 * It is duplicated here rather than hoisted out of that script because the
 * puzzle pipeline is load-bearing and its corpus was expensive to produce;
 * unify the two once this harness has proven itself, not before.
 *
 * Arasan cannot be seeded from here at all — its suboptimal-move routine draws
 * from a C++ `random_engine` we do not reach. Engine-backed tiers therefore
 * reproduce in aggregate, not bit-exactly, which is the same honest limitation
 * calibrate.mjs records about Stockfish. That is not a flaw to engineer away:
 * the sampled thing is the actual bot a player faces.
 */

import { createHash } from 'node:crypto';

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(...parts) {
  return parseInt(createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 8), 16);
}

const realRandom = Math.random;

/** Replace the global for the duration of one trial, then put it back. */
export function withSeed(seed, fn) {
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = realRandom;
  }
}
