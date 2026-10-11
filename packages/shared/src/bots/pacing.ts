/**
 * How long a bot appears to think before it replies, in every bot game on both
 * platforms.
 *
 * The engines are fast enough to answer before the player's own move has
 * finished landing, and a reply that arrives that quickly reads as a machine,
 * not an opponent. So every bot loop waits the LONGER of its search and this
 * pad (`Promise.all([search, pad])`). The pad is a floor, never a ceiling: a
 * search that genuinely needs longer still gets it.
 *
 * It used to scale with the bot's rating (300–1400 ms, a separate table per
 * game and per platform). The owner set a flat floor instead (Sep 2026): at
 * least two seconds, with up to a second of random variation so consecutive
 * replies don't land on the same beat. Forced passes are not bot decisions and
 * keep their own shorter delays.
 */

/** No bot reply lands sooner than this after the player's move. */
export const BOT_THINK_MIN_MS = 2000;

/** Random extra on top of the floor, so the rhythm doesn't read as mechanical. */
export const BOT_THINK_JITTER_MS = 1000;

/*
 * The jitter has its own generator and never touches `Math.random`.
 *
 * The weak engines take their noise and their blunder rolls from `Math.random`,
 * and the web e2e suite pins it (`seedRandom`) to replay a known bot line. The
 * pad is drawn in the same tick as the search, so drawing it from `Math.random`
 * shifted the engine's sequence by one and the bot answered a different move —
 * how the pinned checkers line broke when this module first landed. Pacing is
 * presentation; it must not change which move a bot plays.
 *
 * mulberry32, seeded once from the clock: small, fast and uniform enough for a
 * pause length. Not for anything that needs to be unpredictable.
 *
 * mulberry32 was written in 2017 by Tommy Ettinger and dedicated to the public
 * domain under CC0 1.0 (https://gist.github.com/tommyettinger/46a874533244883189143505d203312c).
 */
let jitterSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
function jitterRandom(): number {
  jitterSeed = (jitterSeed + 0x6d2b79f5) >>> 0;
  let t = jitterSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * The pad for one bot reply: a whole number of milliseconds in
 * `[BOT_THINK_MIN_MS, BOT_THINK_MIN_MS + BOT_THINK_JITTER_MS)`.
 *
 * `random` is injectable for tests; it must return a value in `[0, 1)`. The
 * default is deliberately NOT `Math.random` — see above.
 */
export function botThinkMs(random: () => number = jitterRandom): number {
  return BOT_THINK_MIN_MS + Math.floor(random() * BOT_THINK_JITTER_MS);
}
