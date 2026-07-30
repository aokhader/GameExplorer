/**
 * Perimeter-loop geometry.
 *
 * Liquidate's board is a ring of tiles, not a filled grid, so it renders as an
 * `N × N` CSS grid where only the outer ring is occupied and the middle is one
 * big spanned cell (the "well" that holds the dice, prompt, and action log).
 *
 * A board of `N` tiles per side holds `4N − 4` tiles: 44 on a 12×12 full board,
 * 28 on an 8×8 quick board. Tile 0 sits at the bottom-right and the loop runs
 * **counter-clockwise** (left along the bottom, up the left side, right along the
 * top, down the right side), which puts the corners at `0`, `N−1`, `2N−2`,
 * `3N−3`.
 */

/** Tiles per side for a board of `total` perimeter tiles. */
export function sideLength(total: number): number {
  return (total + 4) / 4;
}

export interface GridPos {
  /** 1-based CSS grid row. */
  row: number;
  /** 1-based CSS grid column. */
  col: number;
}

/**
 * Map a tile index to its cell in an `N × N` grid.
 *
 * The four segments share their corner tiles by construction: the last index of
 * one segment is the first index of the next, so the ring closes without gaps or
 * double-placement.
 */
export function gridPos(index: number, n: number): GridPos {
  if (index < n) {
    // Bottom edge, right → left. Tile 0 is the bottom-right corner.
    return { row: n, col: n - index };
  }
  if (index < 2 * n - 1) {
    // Left edge, bottom → top.
    return { row: n - (index - (n - 1)), col: 1 };
  }
  if (index < 3 * n - 2) {
    // Top edge, left → right.
    return { row: 1, col: 1 + (index - (2 * n - 2)) };
  }
  // Right edge, top → bottom, closing back onto tile 0.
  return { row: 1 + (index - (3 * n - 3)), col: n };
}

/** True for the four corner indices. */
export function isCornerIndex(index: number, n: number): boolean {
  return index === 0 || index === n - 1 || index === 2 * n - 2 || index === 3 * n - 3;
}

/**
 * Which edge a tile sits on — used to rotate the tile's colour band so every
 * band faces the middle of the board.
 */
export type BoardEdge = 'bottom' | 'left' | 'top' | 'right';

export function edgeOf(index: number, n: number): BoardEdge {
  if (index < n) return 'bottom';
  if (index < 2 * n - 1) return 'left';
  if (index < 3 * n - 2) return 'top';
  return 'right';
}
