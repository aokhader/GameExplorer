import type { GoBoard, GoColor } from './types';
import {
  coordinatesToPosition,
  getOpponentColor,
  getStoneAt,
  isValidCoordinates,
  positionToCoordinates,
} from './utils';

/** A connected group of same-coloured stones and the empty points touching it. */
export interface GoGroup {
  stones: string[];
  /** Distinct empty points adjacent to the group. Zero liberties = captured. */
  liberties: string[];
}

/** The (up to four) orthogonally adjacent intersections. Go has no diagonals. */
export function neighborPositions(position: string, size: number): string[] {
  const { row, col } = positionToCoordinates(position);
  const candidates = [
    { row: row + 1, col },
    { row: row - 1, col },
    { row, col: col + 1 },
    { row, col: col - 1 },
  ];
  return candidates
    .filter(c => isValidCoordinates(c, size))
    .map(coordinatesToPosition);
}

/**
 * The group the stone at `position` belongs to, by flood fill.
 *
 * Returns null for an empty point — callers ask about stones, and an "empty
 * group" would silently mean something different (a region, not a group).
 */
export function getGroup(board: GoBoard, position: string, size: number): GoGroup | null {
  const color = getStoneAt(board, position);
  if (color === null) return null;

  const stones: string[] = [];
  const liberties: string[] = [];
  const seenStones = new Set<string>([position]);
  const seenLiberties = new Set<string>();
  const queue = [position];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    stones.push(current);
    for (const neighbor of neighborPositions(current, size)) {
      const stone = getStoneAt(board, neighbor);
      if (stone === null) {
        if (!seenLiberties.has(neighbor)) {
          seenLiberties.add(neighbor);
          liberties.push(neighbor);
        }
      } else if (stone === color && !seenStones.has(neighbor)) {
        seenStones.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return { stones, liberties };
}

/** Liberty count without materialising the group's stone list. */
export function countLiberties(board: GoBoard, position: string, size: number): number {
  return getGroup(board, position, size)?.liberties.length ?? 0;
}

/**
 * Place a stone and resolve the position: enemy groups left without liberties
 * are removed, then the move is rejected if it was suicide.
 *
 * Returns null when the move is not playable *by the placement rules* —
 * occupied point, or self-capture. Superko is deliberately NOT checked here:
 * it is a property of the game's history, not of the board, and this function
 * is also what the bot's playouts and the engine's own legality scan run on.
 *
 * **Order matters and is the whole subtlety.** Captures are resolved before the
 * suicide test, because a move that fills its own last liberty is legal exactly
 * when it takes the enemy group that was surrounding it — that is what makes a
 * ko capture, and a snapback, work at all.
 */
export function playStone(
  board: GoBoard,
  position: string,
  color: GoColor,
  size: number,
): { board: GoBoard; captures: string[] } | null {
  if (getStoneAt(board, position) !== null) return null;

  const next = board.map(row => [...row]);
  const { row, col } = positionToCoordinates(position);
  next[row][col] = color;

  const opponent = getOpponentColor(color);
  const captures: string[] = [];
  const resolved = new Set<string>();

  for (const neighbor of neighborPositions(position, size)) {
    if (resolved.has(neighbor)) continue;
    if (getStoneAt(next, neighbor) !== opponent) continue;

    const group = getGroup(next, neighbor, size);
    if (!group) continue;
    for (const stone of group.stones) resolved.add(stone);
    if (group.liberties.length > 0) continue;

    for (const stone of group.stones) {
      const c = positionToCoordinates(stone);
      next[c.row][c.col] = null;
      captures.push(stone);
    }
  }

  // Suicide is only possible when nothing was captured — a capture always
  // frees at least one liberty for the stone that made it.
  if (captures.length === 0) {
    const own = getGroup(next, position, size);
    if (own && own.liberties.length === 0) return null;
  }

  return { board: next, captures };
}

/**
 * Every empty point where `color` may place a stone under the placement rules
 * (ignoring superko — see `GoEngine.getAllLegalMoves`, which layers that on).
 */
export function getPlayablePositions(board: GoBoard, color: GoColor, size: number): string[] {
  const playable: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (board[row][col] !== null) continue;
      const position = coordinatesToPosition({ row, col });
      if (playStone(board, position, color, size) !== null) playable.push(position);
    }
  }
  return playable;
}

/**
 * True when the point is a single-point eye for `color`: empty, every
 * orthogonal neighbour is a friendly stone, and the diagonals are friendly
 * enough that filling it can only hurt.
 *
 * This is not a rule of Go — it is the one piece of Go knowledge that random
 * play cannot do without. A uniformly random player eventually fills in its own
 * eyes, kills its own groups, and makes the playout's result meaningless, so
 * every Monte-Carlo Go program since the 1990s excludes eye-filling from its
 * playout policy. The diagonal condition is the standard approximation: on the
 * edge every diagonal must be friendly, in the centre at most one may not be.
 */
export function isSingleSpaceEye(board: GoBoard, position: string, color: GoColor, size: number): boolean {
  if (getStoneAt(board, position) !== null) return false;

  const neighbors = neighborPositions(position, size);
  for (const neighbor of neighbors) {
    if (getStoneAt(board, neighbor) !== color) return false;
  }

  const { row, col } = positionToCoordinates(position);
  const diagonals = [
    { row: row + 1, col: col + 1 },
    { row: row + 1, col: col - 1 },
    { row: row - 1, col: col + 1 },
    { row: row - 1, col: col - 1 },
  ].filter(c => isValidCoordinates(c, size));

  // On the edge/corner the point is only an eye when every diagonal is ours;
  // in the centre one enemy (or empty) diagonal is survivable.
  const allowedNonFriendly = diagonals.length < 4 ? 0 : 1;
  let nonFriendly = 0;
  for (const diagonal of diagonals) {
    if (board[diagonal.row][diagonal.col] !== color) nonFriendly++;
  }
  return nonFriendly <= allowedNonFriendly;
}
