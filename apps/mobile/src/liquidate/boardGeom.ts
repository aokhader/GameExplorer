import { gridPos, sideLength } from '@finesse/shared';

export interface RingGeometry {
  /** Tiles per side. */
  n: number;
  /** Edge of one cell, in px. */
  cellPx: number;
  /** Gutter between cells — also the ring's own padding. */
  gap: number;
  /** Left offset of a 1-based grid column. */
  xOf: (col: number) => number;
  /** Top offset of a 1-based grid row. */
  yOf: (row: number) => number;
  /** Top-left px of a tile index. */
  tileXY: (index: number) => { x: number; y: number };
  /** The open middle of the loop. */
  well: { x: number; y: number; size: number };
}

/**
 * The ring's pixel maths, in one place.
 *
 * Three layers need identical numbers — the tiles, the pulse overlay and the
 * token layer — and when they are derived separately a one-pixel disagreement
 * puts the active ring half a border off the tile it is marking. This is the
 * same arithmetic web's `TokenLayer` uses, which is the cheapest confirmation
 * that the geometry ported unchanged.
 */
export function ringGeometry(size: number, total: number, gap: number): RingGeometry {
  const n = sideLength(total);
  const cellPx = (size - gap * (n + 1)) / n;

  const xOf = (col: number) => gap + (col - 1) * (cellPx + gap);
  const yOf = (row: number) => gap + (row - 1) * (cellPx + gap);

  return {
    n,
    cellPx,
    gap,
    xOf,
    yOf,
    tileXY: (index: number) => {
      const { row, col } = gridPos(index, n);
      return { x: xOf(col), y: yOf(row) };
    },
    well: {
      x: xOf(2),
      y: yOf(2),
      size: (n - 2) * (cellPx + gap) - gap,
    },
  };
}
