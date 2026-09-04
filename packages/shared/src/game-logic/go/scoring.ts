/**
 * Counting a Go board, under either ruleset the app offers.
 *
 * Both rulesets ask the same question of the empty points — "is this region
 * surrounded by one colour or by both?" — and differ only in what else counts.
 * So the region flood lives here once, in `ownershipMap`, and the two scores are
 * thin sums on top of it. That shared function is also what the boards shade and
 * what the tutorial's scoring diagram is pinned against, which is the point:
 * there is exactly one answer in the codebase to "who owns this point".
 *
 * A region touching both colours is neutral (dame, or the boundary of a seki)
 * and scores for nobody — which is why seki needs no special case under either
 * ruleset.
 */

import type { GoBoard, GoColor, GoScore, GoScoring } from './types';
import { coordinatesToPosition, getStoneAt, positionToCoordinates } from './utils';
import { neighborPositions } from './moves';

/** Prisoners each colour holds — `black` is the number of WHITE stones Black has. */
export interface GoPrisoners {
  black: number;
  white: number;
}

/**
 * Who owns each **empty** point: the colour that solely surrounds it, or null
 * for a neutral point. Occupied points are absent from the map — ask the board
 * for those.
 */
export function ownershipMap(board: GoBoard, size: number): Map<string, GoColor | null> {
  const owners = new Map<string, GoColor | null>();

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (board[row][col] !== null) continue;

      const start = coordinatesToPosition({ row, col });
      if (owners.has(start)) continue;

      // Flood the empty region, collecting the colours on its border.
      const region: string[] = [start];
      const borders = new Set<GoColor>();
      const seen = new Set<string>([start]);
      const queue = [start];

      while (queue.length > 0) {
        const current = queue.pop() as string;
        for (const neighbor of neighborPositions(current, size)) {
          const stone = getStoneAt(board, neighbor);
          if (stone !== null) {
            borders.add(stone);
          } else if (!seen.has(neighbor)) {
            seen.add(neighbor);
            region.push(neighbor);
            queue.push(neighbor);
          }
        }
      }

      const owner = borders.size === 1 ? ([...borders][0] as GoColor) : null;
      for (const point of region) owners.set(point, owner);
    }
  }

  return owners;
}

/** A copy of the board with the given points emptied. */
export function boardWithoutStones(board: GoBoard, remove: readonly string[]): GoBoard {
  if (remove.length === 0) return board;
  const next = board.map(row => [...row]);
  for (const position of remove) {
    const { row, col } = positionToCoordinates(position);
    if (next[row]?.[col] !== undefined) next[row][col] = null;
  }
  return next;
}

/** Stones on the board, by colour. */
export function countStones(board: GoBoard, size: number): { black: number; white: number } {
  let black = 0;
  let white = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const stone = board[row][col];
      if (stone === 'black') black++;
      else if (stone === 'white') white++;
    }
  }
  return { black, white };
}

/** Empty points owned, by colour. */
export function countTerritory(board: GoBoard, size: number): { black: number; white: number } {
  let black = 0;
  let white = 0;
  for (const owner of ownershipMap(board, size).values()) {
    if (owner === 'black') black++;
    else if (owner === 'white') white++;
  }
  return { black, white };
}

/**
 * Count a board.
 *
 * `prisoners` is only consulted under territory scoring; area scoring counts
 * the empty point a capture left behind instead, so passing it there would
 * double-count. That asymmetry is the entire difference between the two
 * rulesets on a settled board.
 */
export function scoreBoard(
  board: GoBoard,
  size: number,
  komi: number,
  scoring: GoScoring,
  prisoners: GoPrisoners,
): GoScore {
  const territory = countTerritory(board, size);

  let black: number;
  let white: number;

  if (scoring === 'area') {
    const stones = countStones(board, size);
    black = stones.black + territory.black;
    white = stones.white + territory.white;
  } else {
    black = territory.black + prisoners.black;
    white = territory.white + prisoners.white;
  }

  white += komi;
  return { black, white, komi, lead: black - white, scoring };
}
