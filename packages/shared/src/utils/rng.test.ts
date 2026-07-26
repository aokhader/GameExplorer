import { describe, it, expect } from 'vitest';
import {
  createRng,
  next,
  randomInt,
  rollDie,
  rollDice,
  shuffle,
  type RngState,
} from './rng';

describe('createRng', () => {
  it('starts at cursor 0 and coerces the seed to 32-bit unsigned', () => {
    expect(createRng(42)).toEqual({ seed: 42, cursor: 0 });
    expect(createRng(-1).seed).toBe(0xffffffff);
  });
});

describe('next', () => {
  it('returns values in [0, 1) and advances the cursor without mutating input', () => {
    const state = createRng(123);
    const { value, state: after } = next(state);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(after.cursor).toBe(1);
    expect(state.cursor).toBe(0); // input untouched
  });

  it('is deterministic: same (seed, cursor) yields the same value', () => {
    const a = next(createRng(999));
    const b = next(createRng(999));
    expect(a.value).toBe(b.value);
  });

  it('different seeds diverge', () => {
    expect(next(createRng(1)).value).not.toBe(next(createRng(2)).value);
  });

  it('produces a reproducible sequence across many draws', () => {
    const run = (): number[] => {
      let s = createRng(7);
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = next(s);
        out.push(r.value);
        s = r.state;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('randomInt', () => {
  it('stays within the inclusive range', () => {
    let s: RngState = createRng(55);
    for (let i = 0; i < 500; i++) {
      const r = randomInt(s, 3, 9);
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(9);
      expect(Number.isInteger(r.value)).toBe(true);
      s = r.state;
    }
  });

  it('can hit both endpoints of the range', () => {
    let s: RngState = createRng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const r = randomInt(s, 0, 1);
      seen.add(r.value);
      s = r.state;
    }
    expect(seen).toEqual(new Set([0, 1]));
  });
});

describe('rollDie / rollDice', () => {
  it('rolls a single die in 1..6', () => {
    let s: RngState = createRng(88);
    const faces = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const r = rollDie(s);
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(6);
      faces.add(r.value);
      s = r.state;
    }
    expect(faces).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('rolls two dice and advances the cursor by two', () => {
    const s = createRng(3);
    const { dice, state } = rollDice(s);
    expect(dice).toHaveLength(2);
    expect(state.cursor).toBe(2);
  });
});

describe('shuffle', () => {
  it('is a permutation that preserves every element', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { shuffled } = shuffle(createRng(17), items);
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the input array', () => {
    const items = [1, 2, 3];
    shuffle(createRng(17), items);
    expect(items).toEqual([1, 2, 3]);
  });

  it('is deterministic for a given seed and advances the cursor', () => {
    const a = shuffle(createRng(101), [1, 2, 3, 4, 5]);
    const b = shuffle(createRng(101), [1, 2, 3, 4, 5]);
    expect(a.shuffled).toEqual(b.shuffled);
    expect(a.state.cursor).toBe(4); // n-1 draws for length 5
  });
});
