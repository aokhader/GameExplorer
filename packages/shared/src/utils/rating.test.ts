import { describe, expect, it } from 'vitest';
import { DEFAULT_RATING, RATING_BOUNDS, calculateNewRating, clampRating } from './rating';

describe('clampRating', () => {
  it('keeps an honest rating as it is, whole', () => {
    expect(clampRating(1480)).toBe(1480);
    expect(clampRating(1234.6)).toBe(1235);
  });

  it('pulls a forged extreme back inside the bounds the database enforces', () => {
    expect(clampRating(99_999)).toBe(RATING_BOUNDS.max);
    expect(clampRating(-50)).toBe(RATING_BOUNDS.min);
  });

  it('reads anything that is not a finite number as the default', () => {
    for (const bad of [NaN, Infinity, -Infinity, '1500', null, undefined, {}]) {
      expect(clampRating(bad)).toBe(DEFAULT_RATING);
    }
  });
});

describe('calculateNewRating', () => {
  it('still floors at the minimum', () => {
    expect(calculateNewRating(RATING_BOUNDS.min, 2800, 'loss', 5)).toBe(RATING_BOUNDS.min);
  });

  it('never produces a value the database CHECK would refuse', () => {
    // A write outside the bounds fails, and a failed write loses the result.
    expect(calculateNewRating(RATING_BOUNDS.max, 100, 'win', 5)).toBeLessThanOrEqual(RATING_BOUNDS.max);
    expect(calculateNewRating(RATING_BOUNDS.max - 5, RATING_BOUNDS.max, 'win', 5)).toBe(RATING_BOUNDS.max);
  });
});
