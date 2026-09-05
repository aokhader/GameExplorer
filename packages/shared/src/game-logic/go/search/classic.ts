/**
 * The original Go backend: MCTS with uniformly random playouts and plain UCT.
 *
 * **Its job is now the benchmark.** It shipped with Go in August 2026 and was
 * the only engine until board sizes arrived; the pattern backend beside it is
 * what plays real games today. It is kept, exported and tested because a "the
 * new engine is stronger" claim needs something to be stronger *than* — the
 * bot-vs-bot harness plays the two against each other over fixed seeds and
 * fails if the new one does not win a clear majority. That is a real regression
 * gate, and it is also why this file cannot quietly rot the way unused code
 * does.
 *
 * The one piece of Go knowledge here is `isEye` — random play must not fill its
 * own eyes, or every group it builds dies during the playout and the result
 * carries no information. Every Monte-Carlo Go program since the 1990s has this
 * exclusion; without it the bot is not weak, it is random. What it lacks, and
 * what the pattern backend adds, is any knowledge of *shape*: on 81 points
 * uniform playouts still carry a usable signal, but on 361 they mostly do not,
 * which is precisely why 13×13 and 19×19 needed a second engine rather than a
 * bigger budget.
 */

import type { GoGameState } from '../types';
import {
  BLACK,
  EMPTY,
  WHITE,
  createRandom,
  createScratch,
  geometryFor,
  indexToPosition,
  isEye,
  opponentOf,
  playFast,
  positionToIndex,
  scoreFast,
  toFastBoard,
  type FastBoard,
  type Geometry,
  type Scratch,
} from '../fastBoard';
import {
  SEARCH_CEILING_MS,
  SLICE_MS,
  abortError,
  yieldToHost,
  type GoSearch,
  type GoSearchOptions,
  type GoSearchResult,
} from './types';

/**
 * One uniformly random legal move that is not an own eye, applied to the board.
 * Returns the point played, or −1 when the player has nothing left but to pass.
 *
 * The partial Fisher–Yates over `scratch.order` gives a uniform choice with an
 * early exit: a legal point is usually found in the first few draws, and the
 * full scan only happens when the board is nearly finished.
 */
function randomMove(
  board: FastBoard,
  geo: Geometry,
  color: number,
  random: () => number,
  scratch: Scratch,
): number {
  const order = scratch.order;
  const n = geo.points;

  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (n - i));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;

    const idx = order[i];
    if (board[idx] !== EMPTY) continue;
    if (isEye(board, geo, idx, color)) continue;
    if (playFast(board, geo, idx, color, scratch)) return idx;
  }
  return -1;
}

/**
 * Play the position out at random and return the final area difference
 * (black − white), komi excluded.
 *
 * The move cap is what guarantees termination: playouts skip the superko test,
 * so a ko could in principle be recaptured forever. In practice random play
 * exhausts the board long before the cap, which is set well above the longest
 * sensible game.
 */
function playout(
  board: FastBoard,
  geo: Geometry,
  colorToMove: number,
  random: () => number,
  scratch: Scratch,
): number {
  let color = colorToMove;
  let passes = 0;
  const cap = geo.points * 3;

  for (let move = 0; move < cap && passes < 2; move++) {
    const played = randomMove(board, geo, color, random, scratch);
    passes = played === -1 ? passes + 1 : 0;
    color = opponentOf(color);
  }

  return scoreFast(board, geo, scratch);
}

/** A move index of −1 means "pass"; the root carries −2, which is never played. */
const PASS = -1;
const ROOT = -2;

interface Node {
  move: number;
  /** Whose turn it is AT this node. The player who moved INTO it is the other. */
  colorToMove: number;
  visits: number;
  /** Wins for the player who moved into this node — the value its parent maximises. */
  wins: number;
  children: Node[];
  /** Pseudo-legal candidates not yet expanded; null until first needed. */
  untried: number[] | null;
  parent: Node | null;
}

function createNode(move: number, colorToMove: number, parent: Node | null): Node {
  return { move, colorToMove, visits: 0, wins: 0, children: [], untried: null, parent };
}

/**
 * Empty points that are not an own eye — the moves worth considering.
 *
 * Only *pseudo*-legal: a point that turns out to be self-capture is discovered
 * when it is applied and simply dropped. Testing all 81 points properly at every
 * expansion would cost more than it saves.
 */
function candidateMoves(board: FastBoard, geo: Geometry, color: number): number[] {
  const moves: number[] = [];
  for (let idx = 0; idx < geo.points; idx++) {
    if (board[idx] !== EMPTY) continue;
    if (isEye(board, geo, idx, color)) continue;
    moves.push(idx);
  }
  return moves;
}

/** Standard UCT: exploitation + `C · sqrt(ln N / n)`. */
const UCT_C = 1.4;

function selectChild(node: Node): Node {
  let best = node.children[0];
  let bestValue = -Infinity;
  const logVisits = Math.log(node.visits);

  for (const child of node.children) {
    const value = child.wins / child.visits + UCT_C * Math.sqrt(logVisits / child.visits);
    if (value > bestValue) {
      bestValue = value;
      best = child;
    }
  }
  return best;
}

/** Credit the playout back up the path, each node from its own mover's view. */
function backpropagate(node: Node | null, winner: number): void {
  let current = node;
  while (current) {
    current.visits++;
    if (opponentOf(current.colorToMove) === winner) current.wins++;
    current = current.parent;
  }
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

async function runSearch(
  state: GoGameState,
  candidates: readonly string[],
  iterations: number,
  options: GoSearchOptions,
): Promise<GoSearchResult> {
  const geo = geometryFor(state.size);
  const rootBoard = toFastBoard(state);
  const rootColor = state.currentTurn === 'black' ? BLACK : WHITE;
  // The caller always supplies a seed (see `bot.ts`); the fallback exists only
  // so a backend is never the thing that decides what "unseeded" means.
  const random = createRandom(options.seed ?? 1);
  const scratch = createScratch(geo.points);
  for (let i = 0; i < geo.points; i++) scratch.order[i] = i;

  const root = createNode(ROOT, rootColor, null);
  root.untried = candidates.map(position => positionToIndex(position, state.size));

  const board = new Uint8Array(geo.points);
  let leadTotal = 0;
  let leadSamples = 0;
  const searchStart = Date.now();
  let sliceStart = searchStart;

  for (let iteration = 0; iteration < iterations; iteration++) {
    board.set(rootBoard);
    let node = root;
    let color = rootColor;

    // 1. Selection — descend by UCT while the node is fully expanded.
    while ((node.untried === null || node.untried.length === 0) && node.children.length > 0) {
      node = selectChild(node);
      if (node.move !== PASS) playFast(board, geo, node.move, color, scratch);
      color = opponentOf(color);
    }

    // 2. Expansion — one new child, dropping any candidate that proves illegal.
    if (node.untried === null) node.untried = candidateMoves(board, geo, color);
    while (node.untried.length > 0) {
      const pick = Math.floor(random() * node.untried.length);
      const move = node.untried[pick];
      node.untried[pick] = node.untried[node.untried.length - 1];
      node.untried.pop();

      if (!playFast(board, geo, move, color, scratch)) continue; // self-capture

      const child = createNode(move, opponentOf(color), node);
      node.children.push(child);
      node = child;
      color = opponentOf(color);
      break;
    }

    // 3. Simulation.
    const lead = playout(board, geo, color, random, scratch);
    leadTotal += lead;
    leadSamples++;

    // 4. Backpropagation. Komi decides the winner, so a half-point loss counts
    //    as a loss — which is the whole point of a fractional komi.
    backpropagate(node, lead > state.komi ? BLACK : WHITE);

    if (Date.now() - sliceStart >= SLICE_MS) {
      if (options.signal?.aborted) throw abortError();
      await yieldToHost();
      sliceStart = Date.now();
      if (sliceStart - searchStart >= SEARCH_CEILING_MS) break;
    }
  }

  // Most-visited rather than best win rate: a child with one lucky playout can
  // top the rate, but only a genuinely good move accumulates visits.
  let best = root.children[0];
  for (const child of root.children) {
    if (!best || child.visits > best.visits) best = child;
  }

  // No child at all means every candidate was illegal on application — take the
  // first candidate rather than returning nothing.
  if (!best) {
    return { position: candidates[0], winRate: 0.5, scoreLead: 0 };
  }

  return {
    position: indexToPosition(best.move, state.size),
    winRate: best.wins / best.visits,
    scoreLead: leadSamples > 0 ? leadTotal / leadSamples - state.komi : -state.komi,
  };
}

export const classicSearch: GoSearch = {
  id: 'classic',
  label: 'Uniform-playout MCTS (the original engine, kept as the benchmark)',
  search: (state, candidates, options) =>
    runSearch(state, candidates, options.iterations, options),
};
