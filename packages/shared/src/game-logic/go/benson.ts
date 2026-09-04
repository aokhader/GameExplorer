/**
 * Benson's algorithm — which stones are **unconditionally alive**.
 *
 * A chain is unconditionally alive when its owner could pass forever and the
 * opponent still could not capture it, even given unlimited consecutive moves.
 * That is a decidable property of the board alone: no search, no evaluation, no
 * assumptions about how well either side plays. Benson (1976) settles it by
 * fixed point.
 *
 * Two features in this package need exactly this and nothing weaker:
 *
 * - the **tsumego solver** uses it as a terminal test — the moment the group
 *   under attack is unconditionally alive, the fight is over and the search can
 *   stop, which is what keeps an exhaustive search tractable at all;
 * - **dead-stone detection** uses it as the floor — a group that is
 *   unconditionally alive is never marked dead, whatever else is true, so the
 *   review can never hand away a group with two real eyes.
 *
 * What it deliberately does NOT do is recognise a large open territory as
 * alive. A nine-stone wall enclosing thirty-six points is obviously alive to a
 * human and is *not* pass-alive by this test, because most of those points are
 * not liberties of the wall. That is a property of the definition, not a bug:
 * "unconditional" means the opponent gets infinite moves, and a wall around a
 * big open area really can be killed by an opponent allowed to play thirty
 * stones in a row. Callers must treat "not pass-alive" as "not proven alive",
 * never as "dead".
 */

import type { GoBoard, GoColor } from './types';
import { coordinatesToPosition, getStoneAt } from './utils';
import { neighborPositions } from './moves';

interface Chain {
  stones: string[];
  /** Empty points adjacent to the chain. */
  liberties: Set<string>;
}

interface Region {
  /** Every point in the region — empty points and enemy stones alike. */
  points: string[];
  /** Just the empty ones. These are what decide vitality. */
  empties: string[];
  /** Indices into `chains` of the chains bordering this region. */
  borders: Set<number>;
}

/**
 * The stones of every `color` chain that is unconditionally alive.
 *
 * Returned as a flat set of points rather than as chains because every caller
 * asks "is this stone safe?" — regrouping would just be undone.
 */
export function passAliveChains(board: GoBoard, size: number, color: GoColor): Set<string> {
  const chains: Chain[] = [];
  const chainOf = new Map<string, number>();

  // 1. Every chain of `color`, with its liberties.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const start = coordinatesToPosition({ row, col });
      if (board[row][col] !== color || chainOf.has(start)) continue;

      const stones: string[] = [];
      const liberties = new Set<string>();
      const queue = [start];
      chainOf.set(start, chains.length);

      while (queue.length > 0) {
        const current = queue.pop() as string;
        stones.push(current);
        for (const neighbor of neighborPositions(current, size)) {
          const stone = getStoneAt(board, neighbor);
          if (stone === null) {
            liberties.add(neighbor);
          } else if (stone === color && !chainOf.has(neighbor)) {
            chainOf.set(neighbor, chains.length);
            queue.push(neighbor);
          }
        }
      }
      chains.push({ stones, liberties });
    }
  }

  // 2. Every `color`-enclosed region: a maximal connected run of points that are
  //    NOT `color`. Maximality is what makes it enclosed — everything on its
  //    border is a `color` stone by construction.
  const regions: Region[] = [];
  const seenRegion = new Set<string>();

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const start = coordinatesToPosition({ row, col });
      if (board[row][col] === color || seenRegion.has(start)) continue;

      const points: string[] = [];
      const empties: string[] = [];
      const borders = new Set<number>();
      const queue = [start];
      seenRegion.add(start);

      while (queue.length > 0) {
        const current = queue.pop() as string;
        points.push(current);
        if (getStoneAt(board, current) === null) empties.push(current);

        for (const neighbor of neighborPositions(current, size)) {
          if (getStoneAt(board, neighbor) === color) {
            const index = chainOf.get(neighbor);
            if (index !== undefined) borders.add(index);
          } else if (!seenRegion.has(neighbor)) {
            seenRegion.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      regions.push({ points, empties, borders });
    }
  }

  // 3. The fixed point. Drop chains without two vital regions; drop regions
  //    that lean on a chain already dropped; repeat until nothing moves.
  const liveChains = new Set<number>(chains.map((_, i) => i));
  const liveRegions = new Set<number>(regions.map((_, i) => i));

  /**
   * A region is vital to a chain when every empty point in it is a liberty of
   * that chain — the chain can answer any move played inside.
   *
   * A region with no empty points at all is treated as NOT vital. It is
   * vacuously "all liberties" under the literal definition, but such a region
   * is an enemy group with zero liberties, which cannot stand on a legal board.
   * Refusing it keeps this function honest on the hand-built positions the
   * tests and tutorial diagrams feed it, and costs nothing in real play.
   */
  const isVital = (region: Region, chainIndex: number): boolean => {
    if (region.empties.length === 0) return false;
    const { liberties } = chains[chainIndex];
    return region.empties.every(point => liberties.has(point));
  };

  let changed = true;
  while (changed) {
    changed = false;

    for (const chainIndex of liveChains) {
      let vital = 0;
      for (const regionIndex of liveRegions) {
        if (!regions[regionIndex].borders.has(chainIndex)) continue;
        if (isVital(regions[regionIndex], chainIndex)) vital++;
        if (vital >= 2) break;
      }
      if (vital < 2) {
        liveChains.delete(chainIndex);
        changed = true;
      }
    }

    for (const regionIndex of liveRegions) {
      for (const chainIndex of regions[regionIndex].borders) {
        if (!liveChains.has(chainIndex)) {
          liveRegions.delete(regionIndex);
          changed = true;
          break;
        }
      }
    }
  }

  const alive = new Set<string>();
  for (const chainIndex of liveChains) {
    for (const stone of chains[chainIndex].stones) alive.add(stone);
  }
  return alive;
}

/** True when the stone at `position` belongs to an unconditionally alive chain. */
export function isPassAlive(board: GoBoard, position: string, size: number): boolean {
  const color = getStoneAt(board, position);
  if (color === null) return false;
  return passAliveChains(board, size, color).has(position);
}
