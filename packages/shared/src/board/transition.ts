// What changed between two board positions, expressed as something a renderer
// can animate.
//
// This is the animation equivalent of `game-logic/*/premove.ts`: the *decision*
// is a pure function shared by both platforms, while the actual gliding is left
// to each renderer, because web (CSS transforms) and React Native (Reanimated
// shared values) have nothing useful in common at that level.
//
// The approach is Lichess's — their board library, chessground, animates by
// diffing two positions rather than by tracking piece identity, and so do we.
// That matters: our engines rebuild `board` arrays on every move and no piece
// carries an id, so identity-based animation would mean inventing one and
// threading it through four engines. A diff needs nothing from them.
//
// Boards are `(P | null)[][]` indexed `[row][col]` in all three games, so one
// generic signature covers chess, checkers and reversi. Row/column orientation
// is the renderer's problem; nothing here knows which way is up.

/** A square in board coordinates. Orientation is the renderer's business. */
export interface BoardSquare {
  row: number;
  col: number;
}

/** A piece that travelled from one square to another. */
export interface BoardMove {
  from: BoardSquare;
  to: BoardSquare;
  /**
   * True when the piece changed identity in transit — a promoting pawn, a
   * crowning checkers man. It still slides; a renderer may want to pop the new
   * piece on arrival. chessground gets this case wrong (its pieces only ever
   * match by role, so a promotion jumps instead of sliding); the `sameSide`
   * fallback below is what fixes it for us.
   */
  morphed: boolean;
}

/** A piece that left the board — captured, jumped, or otherwise removed. */
export interface BoardFade<P> {
  at: BoardSquare;
  /**
   * The piece as it was, carried here because the renderer has already moved on
   * to the new position and would otherwise have nothing left to draw.
   */
  piece: P;
}

export interface BoardTransition<P> {
  /** Slid from one square to another. */
  moves: BoardMove[];
  /** Removed. Draw at `at` and fade out. */
  fades: BoardFade<P>[];
  /** Materialised with no origin: a placed reversi disc, a dropped piece. */
  appears: BoardSquare[];
  /** Same square, different piece: a flipped reversi disc. Turn it over in place. */
  changes: BoardSquare[];
}

export interface DiffOptions<P> {
  /** Same kind of piece — same role and side. Chess: type + colour. */
  samePiece: (a: P, b: P) => boolean;
  /**
   * Same side, ignoring role. Optional, and only used as a second pass for
   * pieces `samePiece` could not pair: it is what lets a pawn slide into the
   * queen it promotes to. Omit it for games where a piece never changes kind
   * mid-move — reversi, notably, where supplying it would be actively wrong.
   */
  sameSide?: (a: P, b: P) => boolean;
}

/**
 * How long a piece takes to travel, in milliseconds.
 *
 * Lichess's default, and it is a good one — slow enough to read as movement,
 * fast enough that a player clicking through a puzzle line never waits on it.
 * Lives here rather than in `packages/ui` because `usePuzzle` (in
 * `packages/client`) times the opponent's reply against it, and that package
 * does not depend on `ui`. One number, three consumers.
 */
export const BOARD_ANIM_MS = 200;

function empty<P>(): BoardTransition<P> {
  return { moves: [], fades: [], appears: [], changes: [] };
}

interface Occupant<P> {
  sq: BoardSquare;
  piece: P;
}

/**
 * Diff two positions into an animation plan.
 *
 * Pieces present in `next` but not `prev` are paired with pieces present in
 * `prev` but not `next` — nearest first, matching kind before side. Whatever
 * cannot be paired appears or fades. A square that ends up on both unpaired
 * lists held a piece that was replaced without anything travelling, which is a
 * reversi flip, and becomes a `change`.
 *
 * This is a *visual* account, not a legal one. It reports what looks like it
 * moved, which for two identical pieces may not be which one the rules say
 * moved. That is the same trade chessground makes and it is invisible in play.
 *
 * Callers must decide whether animating is appropriate at all: between two
 * consecutive positions in a game, yes; across a jump to an unrelated position
 * (loading a new puzzle, seeking through history, resetting the board) the diff
 * is meaningless and every piece would swim to its new square. Snap instead.
 */
export function diffBoards<P>(
  prev: readonly (readonly (P | null)[])[] | null | undefined,
  next: readonly (readonly (P | null)[])[] | null | undefined,
  { samePiece, sameSide }: DiffOptions<P>,
): BoardTransition<P> {
  if (!prev || !next) return empty();
  if (prev === next) return empty();

  const missing: Occupant<P>[] = [];
  const arrived: Occupant<P>[] = [];

  for (let row = 0; row < next.length; row++) {
    const prevRow = prev[row];
    const nextRow = next[row];
    if (!prevRow || !nextRow) continue;

    for (let col = 0; col < nextRow.length; col++) {
      const before = prevRow[col] ?? null;
      const after = nextRow[col] ?? null;

      if (before && after && samePiece(before, after)) continue;
      // A square whose occupant merely changed lands on BOTH lists. That is
      // deliberate: a chess capture looks identical at this point, and only the
      // pairing below can tell them apart — the capturing piece finds its
      // origin, a flipped disc does not.
      if (before) missing.push({ sq: { row, col }, piece: before });
      if (after) arrived.push({ sq: { row, col }, piece: after });
    }
  }

  if (arrived.length === 0 && missing.length === 0) return empty();

  const moves: BoardMove[] = [];
  const claimed = new Set<number>();

  // Kind first, then side. Two passes rather than one, so a queen already on
  // the board cannot claim the pawn that a promotion needs.
  pair(arrived, missing, claimed, samePiece, moves, false);
  if (sameSide) pair(arrived, missing, claimed, sameSide, moves, true);

  const paired = new Set(moves.map((m) => key(m.to)));
  const appears: BoardSquare[] = [];
  for (const a of arrived) {
    if (!paired.has(key(a.sq))) appears.push(a.sq);
  }

  const fades: BoardFade<P>[] = [];
  for (let i = 0; i < missing.length; i++) {
    if (!claimed.has(i)) fades.push({ at: missing[i].sq, piece: missing[i].piece });
  }

  // Left unpaired on both sides at the same square: nothing travelled, the
  // occupant was replaced. Reversi's whole move is made of these.
  const changes: BoardSquare[] = [];
  const fadedAt = new Set(fades.map((f) => key(f.at)));
  const stillAppearing: BoardSquare[] = [];
  for (const sq of appears) {
    if (fadedAt.has(key(sq))) changes.push(sq);
    else stillAppearing.push(sq);
  }
  const changedAt = new Set(changes.map(key));

  return {
    moves,
    fades: fades.filter((f) => !changedAt.has(key(f.at))),
    appears: stillAppearing,
    changes,
  };
}

/**
 * Pair each unclaimed arrival with the nearest unclaimed departure that
 * `matches` it. Nearest-first is what keeps two identical pieces from crossing
 * over each other.
 */
function pair<P>(
  arrived: Occupant<P>[],
  missing: Occupant<P>[],
  claimed: Set<number>,
  matches: (a: P, b: P) => boolean,
  out: BoardMove[],
  morphed: boolean,
): void {
  const taken = new Set(out.map((m) => key(m.to)));

  for (const a of arrived) {
    if (taken.has(key(a.sq))) continue;

    let bestIndex = -1;
    let bestDistance = Infinity;

    for (let i = 0; i < missing.length; i++) {
      if (claimed.has(i)) continue;
      const m = missing[i];
      // A piece cannot travel to the square it left; that pairing would be a
      // flip dressed up as a move.
      if (m.sq.row === a.sq.row && m.sq.col === a.sq.col) continue;
      if (!matches(m.piece, a.piece)) continue;

      const distance = distanceSq(m.sq, a.sq);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      claimed.add(bestIndex);
      taken.add(key(a.sq));
      out.push({ from: missing[bestIndex].sq, to: a.sq, morphed });
    }
  }
}

function distanceSq(a: BoardSquare, b: BoardSquare): number {
  const dr = a.row - b.row;
  const dc = a.col - b.col;
  return dr * dr + dc * dc;
}

function key(sq: BoardSquare): number {
  return sq.row * 100 + sq.col;
}

/** True when the plan has nothing to animate. */
export function isStaticTransition<P>(t: BoardTransition<P>): boolean {
  return (
    t.moves.length === 0 &&
    t.fades.length === 0 &&
    t.appears.length === 0 &&
    t.changes.length === 0
  );
}
