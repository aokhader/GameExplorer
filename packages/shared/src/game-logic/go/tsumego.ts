/**
 * A life-and-death solver: can this group be killed, or can it live?
 *
 * **Why this exists.** The puzzle validation suite proves a solution is forced
 * by asking an engine for the best move and refusing anything else — that is
 * the property that makes hand-authoring safe, and it needs a *synchronous* and
 * *exact* answer. Go's playing engine is neither: it is Monte-Carlo tree search,
 * asynchronous, and its verdict on a whole board is a statistical estimate that
 * would sometimes be wrong. So a Go puzzle could not be gated the way a chess or
 * checkers puzzle is.
 *
 * Life and death is the way through. "Is this group dead?" is only undecidable
 * on an open board; inside an enclosed region it is a small, finite, perfect
 * information game, and exhaustive search settles it exactly. That is also what
 * tsumego *is* — every classical problem states its own boundary. So the puzzle
 * carries the region with it, and the search never has to consider the rest of
 * the board.
 *
 * **What it is exact about.** Within `region`, with both sides free to play
 * anywhere in it or to pass, the answer is complete: no depth limit, no
 * evaluation function, no heuristic move ordering that could miss a line. The
 * two approximations are stated where they are made — the ko rule is the simple
 * one rather than positional superko (`koPointAfter`), and a repetition inside
 * the search is scored as survival (`PENDING`). Both are the conventional
 * choices for a tsumego solver, and both are why the authored problem set stays
 * off ko.
 *
 * It is also the second consumer of `benson.ts`: the moment the defending group
 * is unconditionally alive the fight is over, and that cutoff is what keeps the
 * search small enough to run inside a test suite.
 */

import type { GoBoard, GoColor, GoGameState } from './types';
import { boardKey, getOpponentColor, getStoneAt, positionToCoordinates } from './utils';
import { getGroup, playStone } from './moves';
import { passAliveChains } from './benson';

/** The pass, in `winningMoves`. Points are always a letter and a digit. */
export const TSUMEGO_PASS = 'pass';

export interface TsumegoSpec {
  /**
   * Every point either side may play in — the boundary of the problem. Points
   * outside it are off-limits to both players, which is what stands in for "the
   * rest of the board is settled and irrelevant".
   *
   * Occupied points belong in here too: a stone captured mid-fight leaves a
   * point that both sides may then play on.
   */
  region: readonly string[];
  /** Any stone of the group whose life is at stake. */
  target: string;
  /** What the side to move is trying to achieve. */
  goal: 'kill' | 'live';
}

export interface TsumegoResult {
  /** True when the side to move can force `goal` against any defence. */
  solved: boolean;
  /**
   * Every first move that forces it — the pass included, as `TSUMEGO_PASS`.
   *
   * A singleton here is the proof a puzzle's key move is unique, which is the
   * property the validation suite is built on.
   */
  winningMoves: string[];
  /** Positions visited. Reported so a test can see a problem growing. */
  nodes: number;
}

export interface TsumegoOptions {
  /**
   * Positions to visit before giving up.
   *
   * This is a guard against a mis-authored region, not a search budget. A
   * problem whose boundary is drawn too wide is an authoring mistake, and the
   * solver must say so loudly rather than return a half-searched verdict that
   * the validation suite would then trust.
   */
  nodeLimit?: number;
}

const DEFAULT_NODE_LIMIT = 400_000;

/** Sentinel for a position currently on the search path. See `resolve`. */
const PENDING = 2;

class NodeLimitExceeded extends Error {}

/**
 * The point the opponent may not immediately play, under the simple ko rule:
 * the move took exactly one stone, and the stone that took it stands alone with
 * a single liberty. Anything else cannot be recreated in one move.
 */
function koPointAfter(
  board: GoBoard,
  position: string,
  captures: readonly string[],
  size: number,
): string | null {
  if (captures.length !== 1) return null;
  const group = getGroup(board, position, size);
  if (!group || group.stones.length !== 1 || group.liberties.length !== 1) return null;
  return captures[0];
}

export function solveTsumego(
  state: GoGameState,
  spec: TsumegoSpec,
  options: TsumegoOptions = {},
): TsumegoResult {
  const { size } = state;
  const nodeLimit = options.nodeLimit ?? DEFAULT_NODE_LIMIT;

  const targetStone = getStoneAt(state.board, spec.target);
  if (targetStone === null) {
    throw new Error(`Tsumego target '${spec.target}' is an empty point`);
  }
  // Annotated rather than inferred: `resolve` closes over this, and a narrowed
  // union does not survive into a hoisted function declaration.
  const defender: GoColor = targetStone;
  const attacker = getOpponentColor(defender);

  const mover: GoColor = spec.goal === 'kill' ? attacker : defender;
  if (state.currentTurn !== mover) {
    throw new Error(
      `Tsumego goal '${spec.goal}' needs ${mover} to move, but it is ${state.currentTurn}'s turn`,
    );
  }

  const region = [...new Set(spec.region)];
  const { row: targetRow, col: targetCol } = positionToCoordinates(spec.target);

  let nodes = 0;
  const memo = new Map<string, number>();
  /**
   * Benson's verdict per distinct board, keyed separately from the search memo.
   *
   * The unconditional-life test is by far the most expensive thing at a node —
   * it rebuilds every chain and every enclosed region — and it depends on the
   * board alone, not on whose turn it is, how many passes have run, or the ko
   * point. Keying it on the position collapses the four search states that share
   * a board into one call, which is the difference between this solver running
   * inside a test suite and not.
   */
  const aliveMemo = new Map<string, boolean>();

  /**
   * Does the defending group survive, with `turn` to move?
   *
   * Returns a 0/1 boolean as a number so the same map can hold `PENDING`.
   * Written as one recursive predicate rather than a negamax over scores
   * because the question genuinely is binary — a group lives or it does not,
   * and there is no partial credit to propagate.
   */
  function resolve(board: GoBoard, turn: GoColor, passes: number, ko: string | null): number {
    // The group is gone. Nothing later can bring it back.
    if (board[targetRow][targetCol] !== defender) return 0;

    if (++nodes > nodeLimit) {
      throw new NodeLimitExceeded(
        `Tsumego search exceeded ${nodeLimit} positions — region of ${region.length} points is too wide to settle`,
      );
    }

    const position = boardKey(board);

    // Unconditionally alive: the attacker could play forever and not take it.
    let alive = aliveMemo.get(position);
    if (alive === undefined) {
      alive = passAliveChains(board, size, defender).has(spec.target);
      aliveMemo.set(position, alive);
    }
    if (alive) return 1;

    // Both sides passed with the group still standing. The attacker had every
    // move in the region available and declined them all, so it survives —
    // which is also how a seki comes out of this search correctly.
    if (passes >= 2) return 1;

    const key = `${position}|${turn}|${passes}|${ko ?? '-'}`;
    const seen = memo.get(key);
    if (seen !== undefined) {
      // A repetition. The attacker has not made progress going round the loop,
      // so the group is treated as having survived — the standard reading of
      // "no result" in a life-and-death problem.
      return seen === PENDING ? 1 : seen;
    }
    memo.set(key, PENDING);

    const defending = turn === defender;
    // The defender needs one line that survives; the attacker needs every line
    // to die. Passing is a real option for both.
    let lives = defending ? 0 : 1;

    for (const point of region) {
      const { row, col } = positionToCoordinates(point);
      if (board[row][col] !== null) continue;
      if (point === ko) continue;

      const played = playStone(board, point, turn, size);
      if (!played) continue;

      const nextKo = koPointAfter(played.board, point, played.captures, size);
      const outcome = resolve(played.board, getOpponentColor(turn), 0, nextKo);

      if (defending ? outcome === 1 : outcome === 0) {
        lives = defending ? 1 : 0;
        break;
      }
    }

    if (defending ? lives === 0 : lives === 1) {
      const outcome = resolve(board, getOpponentColor(turn), passes + 1, null);
      if (defending ? outcome === 1 : outcome === 0) lives = defending ? 1 : 0;
    }

    memo.set(key, lives);
    return lives;
  }

  /** The outcome `goal` is asking for, as `resolve` reports it. */
  const wanted = spec.goal === 'live' ? 1 : 0;
  const winningMoves: string[] = [];

  for (const position of region) {
    const { row, col } = positionToCoordinates(position);
    if (state.board[row][col] !== null) continue;

    const played = playStone(state.board, position, mover, size);
    if (!played) continue;

    const ko = koPointAfter(played.board, position, played.captures, size);
    if (resolve(played.board, getOpponentColor(mover), 0, ko) === wanted) {
      winningMoves.push(position);
    }
  }

  if (resolve(state.board, getOpponentColor(mover), 1, null) === wanted) {
    winningMoves.push(TSUMEGO_PASS);
  }

  return { solved: winningMoves.length > 0, winningMoves, nodes };
}

/**
 * `solveTsumego`, but a region too wide to settle answers "not solved" instead
 * of throwing.
 *
 * The throw is right for authoring — a puzzle whose boundary is drawn wrong must
 * fail the build. It is wrong for dead-stone detection, which runs on whatever
 * position two players happened to pass on and has to degrade to "not proven"
 * rather than crash the screen.
 */
export function tryTsumego(
  state: GoGameState,
  spec: TsumegoSpec,
  options: TsumegoOptions = {},
): TsumegoResult | null {
  try {
    return solveTsumego(state, spec, options);
  } catch (error) {
    if (error instanceof NodeLimitExceeded) return null;
    throw error;
  }
}
