/**
 * The flat-board primitives every Go search backend runs on.
 *
 * Extracted from `bot.ts` when a second search backend arrived. Nothing here is
 * a search — it is the board representation, the geometry cache, the capture
 * rule, the eye rule, the area count and the seeded generator, all of which
 * both backends need and neither should own.
 *
 * The representation is a flat `Uint8Array`, not `GoGameState`: a playout is
 * ~60–120 moves and a search is thousands of playouts, so cloning an immutable
 * array of strings per move would dominate the runtime entirely. The engine
 * remains the authority on what is legal at the ROOT (including superko, which
 * playouts deliberately ignore).
 */

import type { GoGameState } from './types';
import { coordinatesToPosition, positionToCoordinates } from './utils';

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export type FastBoard = Uint8Array;

/** Precomputed adjacency for one board size — built once, shared by every search. */
export interface Geometry {
  size: number;
  points: number;
  /** `points × 4`, off-board entries are −1. */
  neighbors: Int16Array;
  neighborCount: Uint8Array;
  diagonals: Int16Array;
  diagonalCount: Uint8Array;
}

const GEOMETRY_CACHE = new Map<number, Geometry>();

export function geometryFor(size: number): Geometry {
  const cached = GEOMETRY_CACHE.get(size);
  if (cached) return cached;

  const points = size * size;
  const neighbors = new Int16Array(points * 4).fill(-1);
  const neighborCount = new Uint8Array(points);
  const diagonals = new Int16Array(points * 4).fill(-1);
  const diagonalCount = new Uint8Array(points);

  const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      for (const [dr, dc] of orthogonal) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        neighbors[idx * 4 + neighborCount[idx]++] = r * size + c;
      }
      for (const [dr, dc] of diagonal) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        diagonals[idx * 4 + diagonalCount[idx]++] = r * size + c;
      }
    }
  }

  const geometry: Geometry = { size, points, neighbors, neighborCount, diagonals, diagonalCount };
  GEOMETRY_CACHE.set(size, geometry);
  return geometry;
}

export function opponentOf(color: number): number {
  return color === BLACK ? WHITE : BLACK;
}

/**
 * Scratch buffers reused across every flood fill in a search.
 *
 * `marks` holds a monotonically increasing stamp per point instead of a boolean
 * that would have to be cleared: a fill just bumps the stamp, so visiting is
 * O(1) and resetting is free.
 */
export interface Scratch {
  marks: Int32Array;
  stamp: number;
  stones: Int16Array;
  stack: Int16Array;
  order: Int16Array;
}

export function createScratch(points: number): Scratch {
  return {
    marks: new Int32Array(points),
    stamp: 0,
    stones: new Int16Array(points),
    stack: new Int16Array(points),
    order: new Int16Array(points),
  };
}

/**
 * Does the group containing `start` have at least one liberty?
 *
 * This is the hot function of the whole bot — every stone placed in every
 * playout asks it once per adjacent group — and it exists separately from
 * `collectGroup` for one reason: it **stops at the first liberty it finds**.
 * Counting a group's liberties means walking all of it, and groups late in a
 * playout run to forty stones; answering "any?" instead usually costs a handful
 * of steps, because a living group almost always has an empty point near the
 * one we came in through. Flooding the whole group is then only paid on the
 * rare move that actually captures.
 */
export function groupHasLiberty(board: FastBoard, geo: Geometry, start: number, scratch: Scratch): boolean {
  const color = board[start];
  const { neighbors, neighborCount } = geo;
  const marks = scratch.marks;
  const stamp = ++scratch.stamp;

  let top = 0;
  scratch.stack[top++] = start;
  marks[start] = stamp;

  while (top > 0) {
    const current = scratch.stack[--top];
    const base = current * 4;
    for (let i = 0; i < neighborCount[current]; i++) {
      const neighbor = neighbors[base + i];
      const stone = board[neighbor];
      if (stone === EMPTY) return true;
      if (stone === color && marks[neighbor] !== stamp) {
        marks[neighbor] = stamp;
        scratch.stack[top++] = neighbor;
      }
    }
  }
  return false;
}

/**
 * Flood the group containing `start` into `scratch.stones`, returning
 * `{ count, liberties }`. Only called on the capture path — see
 * `groupHasLiberty` for why.
 */
export function collectGroup(
  board: FastBoard,
  geo: Geometry,
  start: number,
  scratch: Scratch,
): { count: number; liberties: number } {
  const color = board[start];
  const { neighbors, neighborCount } = geo;
  const marks = scratch.marks;
  const groupStamp = ++scratch.stamp;
  const libertyStamp = ++scratch.stamp;

  let count = 0;
  let liberties = 0;
  let top = 0;

  scratch.stack[top++] = start;
  marks[start] = groupStamp;

  while (top > 0) {
    const current = scratch.stack[--top];
    scratch.stones[count++] = current;
    const base = current * 4;
    for (let i = 0; i < neighborCount[current]; i++) {
      const neighbor = neighbors[base + i];
      const stone = board[neighbor];
      if (stone === EMPTY) {
        if (marks[neighbor] !== libertyStamp) {
          marks[neighbor] = libertyStamp;
          liberties++;
        }
      } else if (stone === color && marks[neighbor] !== groupStamp) {
        marks[neighbor] = groupStamp;
        scratch.stack[top++] = neighbor;
      }
    }
  }

  return { count, liberties };
}

/**
 * Play a stone, resolving captures. Returns false (leaving the board untouched)
 * when the point is occupied or the move is self-capture.
 *
 * Superko is not consulted — see the module note. The engine screens the root
 * move; inside a playout a repetition is harmless and the move cap bounds it.
 */
export function playFast(board: FastBoard, geo: Geometry, idx: number, color: number, scratch: Scratch): boolean {
  if (board[idx] !== EMPTY) return false;

  board[idx] = color;

  const opponent = opponentOf(color);
  const { neighbors, neighborCount } = geo;
  const base = idx * 4;
  let captured = 0;

  for (let i = 0; i < neighborCount[idx]; i++) {
    const neighbor = neighbors[base + i];
    if (board[neighbor] !== opponent) continue;
    if (groupHasLiberty(board, geo, neighbor, scratch)) continue;
    const group = collectGroup(board, geo, neighbor, scratch);
    for (let s = 0; s < group.count; s++) board[scratch.stones[s]] = EMPTY;
    captured += group.count;
  }

  if (captured === 0 && !groupHasLiberty(board, geo, idx, scratch)) {
    board[idx] = EMPTY; // undo — the move was suicide
    return false;
  }

  return true;
}

/** See `isSingleSpaceEye` in moves.ts — this is the same rule on the flat board. */
export function isEye(board: FastBoard, geo: Geometry, idx: number, color: number): boolean {
  if (board[idx] !== EMPTY) return false;

  const base = idx * 4;
  for (let i = 0; i < geo.neighborCount[idx]; i++) {
    if (board[geo.neighbors[base + i]] !== color) return false;
  }

  const diagonalCount = geo.diagonalCount[idx];
  const allowed = diagonalCount < 4 ? 0 : 1;
  let nonFriendly = 0;
  for (let i = 0; i < diagonalCount; i++) {
    if (board[geo.diagonals[base + i]] !== color) nonFriendly++;
  }
  return nonFriendly <= allowed;
}

/** Tromp-Taylor area difference (black − white), komi excluded. */
export function scoreFast(board: FastBoard, geo: Geometry, scratch: Scratch): number {
  const { neighbors, neighborCount, points } = geo;
  const marks = scratch.marks;
  let black = 0;
  let white = 0;

  // One stamp for the whole pass: every empty point belongs to exactly one
  // region, so regions can share it and each point is still visited once.
  const stamp = ++scratch.stamp;

  for (let start = 0; start < points; start++) {
    const stone = board[start];
    if (stone === BLACK) { black++; continue; }
    if (stone === WHITE) { white++; continue; }
    if (marks[start] === stamp) continue;

    // Flood the empty region, noting which colours sit on its border.
    let top = 0;
    let count = 0;
    let touchesBlack = false;
    let touchesWhite = false;
    scratch.stack[top++] = start;
    marks[start] = stamp;

    while (top > 0) {
      const current = scratch.stack[--top];
      count++;
      const base = current * 4;
      for (let i = 0; i < neighborCount[current]; i++) {
        const neighbor = neighbors[base + i];
        const neighborStone = board[neighbor];
        if (neighborStone === BLACK) touchesBlack = true;
        else if (neighborStone === WHITE) touchesWhite = true;
        else if (marks[neighbor] !== stamp) {
          marks[neighbor] = stamp;
          scratch.stack[top++] = neighbor;
        }
      }
    }

    if (touchesBlack && !touchesWhite) black += count;
    else if (touchesWhite && !touchesBlack) white += count;
  }

  return black - white;
}

/**
 * A seeded generator as a closure rather than the package's counter-based
 * `RngState`.
 *
 * `utils/rng.ts` is built so RNG state can live *inside* a game state and
 * serialize — the right trade for dice, where there are tens of draws per game.
 * A single Go search makes millions, and `next()` allocates a fresh state object
 * per draw. This keeps the same mulberry32 mixing and the same "seeded, so a
 * bot game replays exactly" contract, without the per-draw allocation.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toFastBoard(state: GoGameState): FastBoard {
  const geo = geometryFor(state.size);
  const board = new Uint8Array(geo.points);
  for (let row = 0; row < state.size; row++) {
    for (let col = 0; col < state.size; col++) {
      const stone = state.board[row][col];
      board[row * state.size + col] = stone === 'black' ? BLACK : stone === 'white' ? WHITE : EMPTY;
    }
  }
  return board;
}

export function indexToPosition(idx: number, size: number): string {
  return coordinatesToPosition({ row: Math.floor(idx / size), col: idx % size });
}

export function positionToIndex(position: string, size: number): number {
  const { row, col } = positionToCoordinates(position);
  return row * size + col;
}

// ---------------------------------------------------------------------------
// Tactical probes
// ---------------------------------------------------------------------------
//
// Everything above is what a uniform-playout search needs. These three are what
// a search that knows anything about Go needs, and they are the difference
// between a playout that carries a signal on 361 points and one that does not.

/**
 * The sole liberty of the group containing `start`, or −1 when it has none or
 * more than one.
 *
 * "Exactly one" is the question a tactical policy actually asks — a group in
 * atari is either captured next move or saved by playing that point — so this
 * stops as soon as a second liberty appears rather than counting them all, the
 * same early-exit trade `groupHasLiberty` makes.
 */
export function groupSingleLiberty(
  board: FastBoard,
  geo: Geometry,
  start: number,
  scratch: Scratch,
): number {
  const color = board[start];
  if (color === EMPTY) return -1;

  const { neighbors, neighborCount } = geo;
  const marks = scratch.marks;
  const stamp = ++scratch.stamp;

  let liberty = -1;
  let top = 0;
  scratch.stack[top++] = start;
  marks[start] = stamp;

  while (top > 0) {
    const current = scratch.stack[--top];
    const base = current * 4;
    for (let i = 0; i < neighborCount[current]; i++) {
      const neighbor = neighbors[base + i];
      const stone = board[neighbor];
      if (stone === EMPTY) {
        if (neighbor === liberty) continue;
        if (liberty !== -1) return -1; // a second, distinct liberty
        liberty = neighbor;
      } else if (stone === color && marks[neighbor] !== stamp) {
        marks[neighbor] = stamp;
        scratch.stack[top++] = neighbor;
      }
    }
  }

  return liberty;
}

/**
 * Liberties the stone at `idx` would have after being played, ignoring any
 * capture it makes. Counts up to `cap` and stops — callers only ever ask
 * "is this 1, or more than 1".
 *
 * The stone is placed and removed rather than reasoned about: merging two of
 * your own groups makes the shared liberties overlap, and every attempt to
 * count that without building the merged group gets it wrong on exactly the
 * shapes that matter.
 */
function libertiesAfterPlacing(
  board: FastBoard,
  geo: Geometry,
  idx: number,
  color: number,
  scratch: Scratch,
  cap: number,
): number {
  board[idx] = color;

  const { neighbors, neighborCount } = geo;
  const marks = scratch.marks;
  const groupStamp = ++scratch.stamp;
  const libertyStamp = ++scratch.stamp;

  let liberties = 0;
  let top = 0;
  scratch.stack[top++] = idx;
  marks[idx] = groupStamp;

  while (top > 0 && liberties < cap) {
    const current = scratch.stack[--top];
    const base = current * 4;
    for (let i = 0; i < neighborCount[current]; i++) {
      const neighbor = neighbors[base + i];
      const stone = board[neighbor];
      if (stone === EMPTY) {
        if (marks[neighbor] !== libertyStamp) {
          marks[neighbor] = libertyStamp;
          liberties++;
        }
      } else if (stone === color && marks[neighbor] !== groupStamp) {
        marks[neighbor] = groupStamp;
        scratch.stack[top++] = neighbor;
      }
    }
  }

  board[idx] = EMPTY;
  return liberties;
}

/**
 * Would playing here put the stone (and whatever it joins) straight into atari
 * for nothing?
 *
 * Self-atari is the single most destructive thing uniform random play does: it
 * hands the opponent a free capture and, more importantly, it fills the eye
 * space of the player's own groups, so the playout's verdict on who lives comes
 * out wrong. Excluding it is worth more than any pattern.
 *
 * A move that captures something is never treated as self-atari — the capture
 * frees liberties, and throw-ins that look like self-atari are exactly the
 * tactic this must not forbid.
 */
export function isSelfAtari(
  board: FastBoard,
  geo: Geometry,
  idx: number,
  color: number,
  scratch: Scratch,
): boolean {
  if (board[idx] !== EMPTY) return false;

  const opponent = color === BLACK ? WHITE : BLACK;
  const { neighbors, neighborCount } = geo;
  const base = idx * 4;

  for (let i = 0; i < neighborCount[idx]; i++) {
    const neighbor = neighbors[base + i];
    if (board[neighbor] !== opponent) continue;
    if (groupSingleLiberty(board, geo, neighbor, scratch) === idx) return false; // captures
  }

  return libertiesAfterPlacing(board, geo, idx, color, scratch, 2) < 2;
}
