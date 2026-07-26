/**
 * Seeded, counter-based PRNG for chance-driven games (dice, deck shuffles).
 *
 * The generator is *stateless per draw*: a value depends only on `(seed, cursor)`,
 * so the whole RNG state serializes as two integers and lives inside the game
 * state. That makes every roll pure and reproducible — replays, Vitest fixtures,
 * and (later) server-side verification all get identical sequences from the same
 * seed. Never call `Math.random()` in game logic; route randomness through here.
 *
 * The mixing function is mulberry32 applied to a Weyl-sequence counter, which
 * gives an O(1), well-distributed value for any `(seed, cursor)` pair.
 */

export interface RngState {
  /** 32-bit unsigned seed fixed at game creation. */
  seed: number;
  /** How many values have been drawn; advanced on every draw. */
  cursor: number;
}

const WEYL = 0x9e3779b9; // 2^32 / golden ratio — the Weyl increment

/** Deterministic value in [0, 1) for a given seed and cursor. */
function valueAt(seed: number, cursor: number): number {
  let t = (seed + Math.imul(cursor, WEYL)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Start a fresh RNG at cursor 0 from a seed (coerced to 32-bit unsigned). */
export function createRng(seed: number): RngState {
  return { seed: seed >>> 0, cursor: 0 };
}

/**
 * Generate a non-deterministic seed for a *new* game. This is the only impure
 * function in the module and must be called only when creating a game, never
 * during play. Prefers `crypto` when available, falls back to `Math.random`.
 */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return (Math.random() * 0x100000000) >>> 0;
}

/** Draw the next value in [0, 1) and return the advanced state. */
export function next(state: RngState): { value: number; state: RngState } {
  return {
    value: valueAt(state.seed, state.cursor),
    state: { seed: state.seed, cursor: state.cursor + 1 },
  };
}

/** Draw an integer in [min, max] inclusive. */
export function randomInt(
  state: RngState,
  min: number,
  max: number,
): { value: number; state: RngState } {
  const { value, state: next1 } = next(state);
  return { value: min + Math.floor(value * (max - min + 1)), state: next1 };
}

/** Roll one six-sided die (1–6). */
export function rollDie(state: RngState): { value: number; state: RngState } {
  return randomInt(state, 1, 6);
}

/** Roll two six-sided dice, returning both faces in draw order. */
export function rollDice(state: RngState): {
  dice: [number, number];
  state: RngState;
} {
  const first = rollDie(state);
  const second = rollDie(first.state);
  return { dice: [first.value, second.value], state: second.state };
}

/**
 * Fisher–Yates shuffle. Pure: returns a new array and the advanced state,
 * leaving the input untouched.
 */
export function shuffle<T>(
  state: RngState,
  items: readonly T[],
): { shuffled: T[]; state: RngState } {
  const shuffled = items.slice();
  let s = state;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const draw = randomInt(s, 0, i);
    s = draw.state;
    const j = draw.value;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { shuffled, state: s };
}
