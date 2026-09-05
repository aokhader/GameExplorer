/**
 * Star points, per board size.
 *
 * Worth its own file because both boards used to read
 * `size === 9 ? GO_STAR_POINTS_9 : []` — a fallback that draws *nothing* on any
 * other size and cannot fail a typecheck, which is the same silent-empty class
 * that has bitten this repo repeatedly. The resolver replaced it; these are the
 * assertions that keep it honest.
 */
import { describe, it, expect } from 'vitest';
import { GO_STAR_POINTS_9, goStarPoints, type GoPoint } from '../go/tokens';

/** Sorted, so a comparison is about the set and not the order it was built in. */
const sorted = (points: readonly GoPoint[]): string[] =>
  points.map(([r, c]) => `${r},${c}`).sort();

describe('goStarPoints', () => {
  it('marks the 3-3 points and tengen on 9×9', () => {
    expect(sorted(goStarPoints(9))).toEqual(sorted([
      [2, 2], [2, 6], [4, 4], [6, 2], [6, 6],
    ]));
  });

  it('moves to the 4-4 points on 13×13, still five of them', () => {
    expect(sorted(goStarPoints(13))).toEqual(sorted([
      [3, 3], [3, 9], [6, 6], [9, 3], [9, 9],
    ]));
  });

  it('marks the familiar nine on 19×19, including the side midpoints', () => {
    expect(sorted(goStarPoints(19))).toEqual(sorted([
      [3, 3], [3, 9], [3, 15],
      [9, 3], [9, 9], [9, 15],
      [15, 3], [15, 9], [15, 15],
    ]));
  });

  it('keeps the shipped 9×9 constant identical to the resolver', () => {
    expect(sorted(GO_STAR_POINTS_9)).toEqual(sorted(goStarPoints(9)));
  });

  it.each([9, 13, 19])('is symmetric under reflection on %i×%i', (size) => {
    const points = goStarPoints(size);
    const set = new Set(sorted(points));
    for (const [row, col] of points) {
      // A star pattern that is not symmetric is a star pattern that is wrong.
      expect(set.has(`${size - 1 - row},${col}`)).toBe(true);
      expect(set.has(`${row},${size - 1 - col}`)).toBe(true);
      expect(set.has(`${col},${row}`)).toBe(true);
    }
  });

  it.each([9, 13, 19])('keeps every point on the board at %i×%i', (size) => {
    for (const [row, col] of goStarPoints(size)) {
      expect(row).toBeGreaterThanOrEqual(0);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(size);
      expect(col).toBeLessThan(size);
    }
  });

  it('draws nothing on a board too small to have a convention', () => {
    expect(goStarPoints(5)).toEqual([]);
  });

  it('falls back to corners on an even board rather than inventing a centre', () => {
    const points = goStarPoints(10);
    expect(points).toHaveLength(4);
    // No point sits on a half-way line that does not exist.
    for (const [row, col] of points) {
      expect(Number.isInteger(row)).toBe(true);
      expect(Number.isInteger(col)).toBe(true);
    }
  });
});
