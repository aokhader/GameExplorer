import { describe, expect, it } from 'vitest';
import { edgeOf, gridPos, isCornerIndex, sideLength } from './geometry';
import { getBoard } from './board';

/**
 * The ring's arithmetic, checked as a whole rather than case by case.
 *
 * A ring that double-places a tile is invisible in a screenshot — the board
 * still looks like a board — but it silently breaks every token position and
 * every hit test built on top of it. These are properties over the whole loop
 * for both real board sizes, so a regression cannot hide in the one index
 * nobody wrote a case for.
 */

const SIZES = [
  { mode: 'quick' as const, total: 28, n: 8 },
  { mode: 'full' as const, total: 44, n: 12 },
];

describe('sideLength', () => {
  it('matches the two real boards', () => {
    expect(sideLength(28)).toBe(8);
    expect(sideLength(44)).toBe(12);
  });

  it('agrees with the actual board layouts', () => {
    for (const { mode, n } of SIZES) {
      expect(sideLength(getBoard(mode).length)).toBe(n);
    }
  });

  it('inverts the perimeter formula 4n − 4', () => {
    for (let n = 4; n <= 20; n++) {
      expect(sideLength(4 * n - 4)).toBe(n);
    }
  });
});

describe.each(SIZES)('gridPos on the $total-tile ring', ({ total, n }) => {
  const all = Array.from({ length: total }, (_, i) => gridPos(i, n));

  it('places every tile inside the grid', () => {
    for (const { row, col } of all) {
      expect(row).toBeGreaterThanOrEqual(1);
      expect(row).toBeLessThanOrEqual(n);
      expect(col).toBeGreaterThanOrEqual(1);
      expect(col).toBeLessThanOrEqual(n);
    }
  });

  it('gives every tile a distinct cell', () => {
    const seen = new Set(all.map(({ row, col }) => `${row},${col}`));
    expect(seen.size).toBe(total);
  });

  it('places every tile on the perimeter', () => {
    for (const { row, col } of all) {
      expect(row === 1 || row === n || col === 1 || col === n).toBe(true);
    }
  });

  it('covers the whole perimeter and nothing else', () => {
    const perimeter = new Set<string>();
    for (let row = 1; row <= n; row++) {
      for (let col = 1; col <= n; col++) {
        if (row === 1 || row === n || col === 1 || col === n) perimeter.add(`${row},${col}`);
      }
    }
    expect(new Set(all.map(({ row, col }) => `${row},${col}`))).toEqual(perimeter);
  });

  it('starts at the bottom-right and runs counter-clockwise', () => {
    expect(gridPos(0, n)).toEqual({ row: n, col: n });
    // One step along the bottom edge moves left, staying on the bottom row.
    expect(gridPos(1, n)).toEqual({ row: n, col: n - 1 });
  });

  it('steps to an adjacent cell every time, and closes the loop', () => {
    for (let i = 0; i < total; i++) {
      const a = gridPos(i, n);
      const b = gridPos((i + 1) % total, n);
      const dist = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
      expect(dist).toBe(1);
    }
  });

  it('puts the corners at 0, n−1, 2n−2 and 3n−3', () => {
    const corners = [0, n - 1, 2 * n - 2, 3 * n - 3];
    for (let i = 0; i < total; i++) {
      expect(isCornerIndex(i, n)).toBe(corners.includes(i));
    }
  });

  it('marks exactly the four grid corners as corner indices', () => {
    const cornerCells = all
      .filter((_, i) => isCornerIndex(i, n))
      .map(({ row, col }) => `${row},${col}`)
      .sort();
    expect(cornerCells).toEqual([`1,1`, `1,${n}`, `${n},1`, `${n},${n}`].sort());
  });

  it('agrees with edgeOf about which side a tile sits on', () => {
    for (let i = 0; i < total; i++) {
      const { row, col } = gridPos(i, n);
      switch (edgeOf(i, n)) {
        case 'bottom':
          expect(row).toBe(n);
          break;
        case 'left':
          expect(col).toBe(1);
          break;
        case 'top':
          expect(row).toBe(1);
          break;
        case 'right':
          expect(col).toBe(n);
          break;
      }
    }
  });
});
