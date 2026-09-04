/**
 * Which stones are dead, once both players have passed.
 *
 * This is what seeds the review screen, and the standard it is held to is
 * **proof, not opinion**. A group is only marked when the solver can show it
 * cannot be saved: the group is sealed into a region small enough to search
 * exhaustively, and the opponent has a forced kill inside it. Anything else —
 * a group with room to run, a region too wide to settle, a position that was
 * never really finished — comes back unmarked.
 *
 * That asymmetry is deliberate. An unmarked dead group costs the player the
 * points it is standing on, which is exactly what the game did before this
 * feature existed, and it can be fixed by resuming play and capturing it. A
 * *wrongly* marked live group hands away a group that was never in danger, and
 * against a bot there is no opponent to object. So when the answer is unclear
 * the review says nothing and lets the board settle it.
 *
 * The two limits behind that are honest and testable: `MAX_REGION_POINTS`
 * refuses a region too big to be a life-and-death problem in the first place,
 * and the solver's own node limit catches the rest (`tryTsumego` degrades to
 * null rather than throwing, which is the whole reason that variant exists).
 */

import { GoEngine } from './engine';
import type { GoGameState } from './types';
import { coordinatesToPosition, getOpponentColor, getStoneAt } from './utils';
import { neighborPositions } from './moves';
import { passAliveChains } from './benson';
import { tryTsumego } from './tsumego';

/**
 * The widest sealed region this will try to settle.
 *
 * A real life-and-death shape is small — a corner, an eye space, a pocket
 * inside someone's framework. A region of forty points is not a group that is
 * dead, it is a group with somewhere to live, and searching it exhaustively
 * would cost far more than the answer is worth on a screen the player is
 * waiting on.
 */
export const MAX_REGION_POINTS = 18;

/** Positions the review is allowed to spend settling one group. */
export const DEAD_STONE_NODE_LIMIT = 30_000;

/**
 * Every stone that can be proved dead in the position as it stands, sorted.
 *
 * Intended for a board both players have just passed on. It is safe to call on
 * any position — an unfinished board simply has nothing provable on it — but
 * the answer is only *meaningful* at the end of a game.
 */
export function detectDeadStones(state: GoGameState): string[] {
  const { board, size } = state;

  const passAlive = {
    black: passAliveChains(board, size, 'black'),
    white: passAliveChains(board, size, 'white'),
  };

  const dead: string[] = [];
  const settled = new Set<string>();

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = board[row][col];
      if (color === null) continue;

      const start = coordinatesToPosition({ row, col });
      if (settled.has(start)) continue;

      // A group with two real eyes is never up for discussion.
      if (passAlive[color].has(start)) {
        for (const stone of chainStones(state, start)) settled.add(stone);
        continue;
      }

      const opponent = getOpponentColor(color);
      const region = sealedRegion(state, start, color);
      const chain = chainStones(state, start);
      for (const stone of chain) settled.add(stone);

      if (region === null || region.length > MAX_REGION_POINTS) continue;

      const verdict = tryTsumego(
        { ...state, currentTurn: opponent },
        { region, target: start, goal: 'kill' },
        { nodeLimit: DEAD_STONE_NODE_LIMIT },
      );
      if (verdict?.solved) dead.push(...chain);
    }
  }

  return dead.sort();
}

/** The stones connected to `position`, by colour. */
function chainStones(state: GoGameState, position: string): string[] {
  const { board, size } = state;
  const color = getStoneAt(board, position);
  if (color === null) return [];

  const stones: string[] = [];
  const seen = new Set<string>([position]);
  const queue = [position];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    stones.push(current);
    for (const neighbor of neighborPositions(current, size)) {
      if (seen.has(neighbor)) continue;
      if (getStoneAt(board, neighbor) !== color) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return stones;
}

/**
 * The region a group is sealed into: every point reachable from it without
 * crossing an enemy stone.
 *
 * By maximality everything on this region's border is an enemy stone, so it is
 * the natural boundary of the fight — the same boundary a tsumego diagram draws
 * with its frame. Returns null when the region reaches a point with no enemy
 * neighbour anywhere, meaning the group is not sealed in at all.
 */
function sealedRegion(state: GoGameState, position: string, color: GoGameState['currentTurn']): string[] | null {
  const { board, size } = state;
  const opponent = getOpponentColor(color);

  const points: string[] = [];
  const seen = new Set<string>([position]);
  const queue = [position];
  let touchesOpponent = false;

  while (queue.length > 0) {
    const current = queue.pop() as string;
    points.push(current);

    for (const neighbor of neighborPositions(current, size)) {
      if (getStoneAt(board, neighbor) === opponent) {
        touchesOpponent = true;
        continue;
      }
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }

    // Bail early rather than flooding half the board to discover it is too big.
    if (points.length > MAX_REGION_POINTS) return null;
  }

  return touchesOpponent ? points : null;
}

/**
 * Toggle the chain at `position` between dead and alive, returning the new mark
 * set (sorted, so the review's state has one canonical form).
 *
 * A chain is marked as a whole — a group lives or dies together, and half a
 * group coming off the board would produce a score no Go player would
 * recognise. `validMarks` does that expansion and also refuses an
 * unconditionally alive group, so a tap on a group with two real eyes returns
 * the marks unchanged and the screen can say why.
 *
 * Lives here rather than in either screen because both platforms need exactly
 * this, and "what does tapping a stone during the review do" is a rule, not a
 * presentation detail.
 */
export function toggleDeadChain(
  state: GoGameState,
  dead: readonly string[],
  position: string,
): string[] {
  const chain = GoEngine.validMarks(state, [position]);
  if (chain.length === 0) return [...dead];

  const marks = new Set(dead);
  const alreadyDead = chain.every(stone => marks.has(stone));
  for (const stone of chain) {
    if (alreadyDead) marks.delete(stone);
    else marks.add(stone);
  }
  return [...marks].sort();
}
