/**
 * The Go backend that plays real games: MCTS with a shaped playout policy and
 * RAVE.
 *
 * Two changes from `classic.ts`, and both are needed for the same reason — a
 * bigger board.
 *
 * **The playout knows some Go** (`policy.ts`). A Monte-Carlo search has no
 * evaluation function; the playout *is* the evaluation. Uniform random play
 * gives a usable signal on 81 points and mostly noise on 361, because a random
 * game on a big board never resolves any of the fights that decide it.
 *
 * **RAVE** — all-moves-as-first. The plain UCT in `classic.ts` learns about a
 * move only from the playouts that begin with it, so on a board with 361 legal
 * moves it has barely sampled the position at any budget a phone can afford.
 * RAVE also credits every move *played later in the simulation*, on the
 * observation that in Go a good point is usually still a good point a few moves
 * later. It is wrong in detail and enormously useful early, so its weight decays
 * as real visits accumulate — that is the whole of the β schedule below.
 *
 * What is deliberately NOT here is **tree reuse between moves**. It is the
 * standard next gain, and it does not fit: `getBestGoMove` is a pure function of
 * a state, the caller can rewind the timeline to any earlier position, and a
 * seeded game must replay identically. A cache keyed on a position the user can
 * jump around in buys a few percent and costs the determinism the tests and the
 * bot-vs-bot harness are built on.
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
  type FastBoard,
  type Geometry,
} from '../fastBoard';
import { FULL_POLICY, createLocalBuffer, policyPlayout, type PolicyOptions } from './policy';
import {
  SEARCH_CEILING_MS,
  SLICE_MS,
  abortError,
  yieldToHost,
  type GoSearch,
  type GoSearchOptions,
  type GoSearchResult,
} from './types';

/** A move index of −1 means "pass"; the root carries −2, which is never played. */
const ROOT = -2;

/**
 * Visits a node collects before its children are created.
 *
 * Expanding one child per visit (what `classic.ts` does) starves RAVE, which
 * needs every sibling present to rank them. Expanding all of them at the first
 * visit would allocate 361 nodes for a position the search may never return to.
 * Waiting a few visits is the usual compromise: the tree stays small and every
 * node that matters is fully expanded.
 */
const EXPAND_AFTER = 8;

/**
 * UCT exploration weight — far lower than the 1.4 that plain UCT uses, and
 * deliberately so.
 *
 * With RAVE, *ordering unvisited moves is RAVE's job*: a move nobody has tried
 * still has an estimate, borrowed from every simulation it appeared in. An
 * explicit exploration term on top of that spreads visits evenly across all the
 * children and the tree never deepens past one ply.
 *
 * **Zero is measured, not assumed.** On a position with a three-stone group in
 * atari — where there is exactly one right move — the search found it, over
 * eight seeds at 3,000 playouts:
 *
 * ```
 *   explore 0     7/8      explore 0.06   5/8
 *   explore 0.03  5/8      explore 0.1    4/8
 *   explore 0.3   2/8      explore 1.4    1/8   (the textbook UCT constant)
 * ```
 *
 * That is the standard MC-RAVE finding rather than a surprise, but it is a
 * tuning knob and it is exposed as one: `PatternSearchTuning.explore`.
 */
const DEFAULT_EXPLORE = 0;

/**
 * RAVE decay. From the minimum-MSE schedule of Gelly & Silver:
 * `β = r / (n + r + 4·b²·n·r)` with `b ≈ 0.05`.
 *
 * At `n = 0` it is 1 — a move never actually tried is judged purely on where it
 * appeared in other simulations, which is exactly the ordering RAVE exists to
 * provide. By a thousand real visits it is under a tenth, and the estimate is
 * the honest one again.
 */
const RAVE_BIAS = 4 * 0.05 * 0.05;

/**
 * Value given to a child with no real visits yet and no RAVE evidence either.
 *
 * Slightly below even on purpose: an untried move should be looked at, but not
 * ahead of a sibling that has already proved itself roughly even.
 */
const FIRST_PLAY_URGENCY = 0.45;

/**
 * How much of a node's value comes from the *margin* rather than the result.
 *
 * A pure win-rate search is indifferent between winning by three points and
 * winning by forty, and once it is winning nearly every playout it becomes
 * indifferent between all its moves — including between taking a group in atari
 * and playing somewhere irrelevant. That is textbook MCTS behaviour and it
 * reads to a player as a bot that has stopped trying.
 *
 * Blending in a squashed score margin fixes it without changing what the search
 * is for: at 0.15 the win/loss term still moves the value by 0.85 and the margin
 * by at most 0.15, so the bot never prefers a bigger win to a safer one — it
 * only breaks ties, which is exactly where the problem was.
 *
 * (This is the cheap version of what a modern neural engine gets from a real
 * score head. Recorded because it is the first thing a KataGo backend would
 * replace.)
 */
const SCORE_WEIGHT = 0.15;

interface Node {
  move: number;
  /** Whose turn it is AT this node. The player who moved INTO it is the other. */
  colorToMove: number;
  visits: number;
  /**
   * Playouts won by the player who moved into this node. Reported as the win
   * rate, and kept separate from `value` so the number the training hint and
   * review show is a real win rate rather than a blended utility.
   */
  wins: number;
  /** Blended win-and-margin utility for that player — what the parent maximises. */
  value: number;
  /** All-moves-as-first counts for the same player. */
  raveVisits: number;
  raveValue: number;
  /** Null until the node has earned expansion; empty array means "no moves". */
  children: Node[] | null;
  parent: Node | null;
}

function createNode(move: number, colorToMove: number, parent: Node | null): Node {
  return {
    move,
    colorToMove,
    visits: 0,
    wins: 0,
    value: 0,
    raveVisits: 0,
    raveValue: 0,
    children: null,
    parent,
  };
}

/**
 * Empty points that are not an own eye — the moves worth considering.
 *
 * Only *pseudo*-legal: a point that turns out to be self-capture is discovered
 * when it is applied and simply dropped.
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

/** UCT blended with RAVE — see `RAVE_BIAS`. */
function selectChild(node: Node, explore: number): Node {
  const logVisits = Math.log(Math.max(node.visits, 1));
  let best = node.children![0];
  let bestValue = -Infinity;

  for (const child of node.children!) {
    const n = child.visits;
    const r = child.raveVisits;

    const q = n > 0 ? child.value / n : FIRST_PLAY_URGENCY;
    const qr = r > 0 ? child.raveValue / r : q;
    const beta = r > 0 ? r / (n + r + RAVE_BIAS * n * r) : 0;

    // `n + 1` rather than `n`: an unvisited child gets the largest bonus any
    // child can get, without the infinity a bare `1/n` would produce.
    const value = (1 - beta) * q + beta * qr + explore * Math.sqrt(logVisits / (n + 1));

    if (value > bestValue) {
      bestValue = value;
      best = child;
    }
  }
  return best;
}

export interface PatternSearchTuning {
  policy: PolicyOptions;
  /** Off means plain UCT, which is how the strength gate isolates RAVE's share. */
  rave: boolean;
  /** UCT exploration weight — see `DEFAULT_EXPLORE`. */
  explore: number;
}

export const DEFAULT_TUNING: PatternSearchTuning = {
  policy: FULL_POLICY,
  rave: true,
  explore: DEFAULT_EXPLORE,
};

async function runSearch(
  state: GoGameState,
  candidates: readonly string[],
  options: GoSearchOptions,
  tuning: PatternSearchTuning,
): Promise<GoSearchResult> {
  const geo = geometryFor(state.size);
  const rootBoard = toRootBoard(state, geo);
  const rootColor = state.currentTurn === 'black' ? BLACK : WHITE;
  // The caller always supplies a seed (see `bot.ts`); the fallback exists only
  // so a backend is never the thing that decides what "unseeded" means.
  const random = createRandom(options.seed ?? 1);
  const scratch = createScratch(geo.points);
  const local = createLocalBuffer();
  for (let i = 0; i < geo.points; i++) scratch.order[i] = i;

  // The real last move, so the policy has context from the very first playout
  // rather than starting every simulation blind.
  const rootLast = lastPlayedIndex(state);

  const root = createNode(ROOT, rootColor, null);
  root.children = candidates.map((position) =>
    createNode(positionToIndex(position, state.size), opponentOf(rootColor), root),
  );

  const board = new Uint8Array(geo.points);
  // First simulation in which each point was played, per colour. Stamped rather
  // than cleared: a search runs thousands of simulations and clearing two
  // 361-entry arrays each time would cost more than the statistics are worth.
  const playedBlack = new Int32Array(geo.points);
  const playedWhite = new Int32Array(geo.points);

  let leadTotal = 0;
  let leadSamples = 0;
  const searchStart = Date.now();
  let sliceStart = searchStart;

  for (let iteration = 1; iteration <= options.iterations; iteration++) {
    board.set(rootBoard);
    let node = root;
    let color = rootColor;
    let last = rootLast;

    const mark = (idx: number, played: number): void => {
      const stamps = played === BLACK ? playedBlack : playedWhite;
      if (stamps[idx] !== iteration) stamps[idx] = iteration;
    };

    // 1. Selection — descend while the node is expanded.
    while (node.children !== null && node.children.length > 0) {
      node = selectChild(node, tuning.explore);
      if (playFast(board, geo, node.move, color, scratch)) {
        mark(node.move, color);
        last = node.move;
      }
      color = opponentOf(color);
    }

    // 2. Expansion — a node earns children once it has been visited enough to
    //    be worth the allocation.
    if (node.children === null && node.visits >= EXPAND_AFTER) {
      node.children = candidateMoves(board, geo, color).map((move) =>
        createNode(move, opponentOf(color), node),
      );
    }

    // 3. Simulation.
    const lead = policyPlayout(
      board,
      geo,
      color,
      last,
      random,
      scratch,
      tuning.policy,
      local,
      mark,
    );
    leadTotal += lead;
    leadSamples++;

    // 4. Backpropagation. Komi decides the winner, so a half-point loss counts
    //    as a loss — which is the whole point of a fractional komi.
    const margin = lead - state.komi;
    const winner = margin > 0 ? BLACK : WHITE;
    // Black's utility: the result, nudged by how big it was. `tanh` over the
    // board's own edge length, so "a big margin" means something different on
    // 81 points and on 361.
    const blackValue =
      (1 - SCORE_WEIGHT) * (margin > 0 ? 1 : 0) +
      SCORE_WEIGHT * (0.5 + 0.5 * Math.tanh(margin / state.size));
    backpropagate(node, winner, blackValue, tuning.rave, iteration, playedBlack, playedWhite);

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
    if (child.visits > best.visits) best = child;
  }

  if (!best) {
    return { position: candidates[0], winRate: 0.5, scoreLead: 0 };
  }

  return {
    position: indexToPosition(best.move, state.size),
    winRate: best.visits > 0 ? best.wins / best.visits : 0.5,
    scoreLead: leadSamples > 0 ? leadTotal / leadSamples - state.komi : -state.komi,
  };
}

/**
 * Credit the simulation back up the path.
 *
 * The real statistics go to the nodes actually visited. The RAVE statistics go
 * to every *sibling* whose move was played later in the simulation by the same
 * player — that is the all-moves-as-first assumption, and it is why one playout
 * updates hundreds of estimates instead of one.
 */
function backpropagate(
  node: Node | null,
  winner: number,
  blackValue: number,
  rave: boolean,
  iteration: number,
  playedBlack: Int32Array,
  playedWhite: Int32Array,
): void {
  const whiteValue = 1 - blackValue;
  let current = node;

  while (current) {
    current.visits++;
    const mover = opponentOf(current.colorToMove);
    if (mover === winner) current.wins++;
    current.value += mover === BLACK ? blackValue : whiteValue;

    if (rave && current.children !== null) {
      // Children of this node are moves by `current.colorToMove`.
      const played = current.colorToMove === BLACK ? playedBlack : playedWhite;
      const childValue = current.colorToMove === BLACK ? blackValue : whiteValue;
      for (const child of current.children) {
        if (played[child.move] !== iteration) continue;
        child.raveVisits++;
        child.raveValue += childValue;
      }
    }

    current = current.parent;
  }
}

function toRootBoard(state: GoGameState, geo: Geometry): FastBoard {
  const board = new Uint8Array(geo.points);
  for (let row = 0; row < state.size; row++) {
    for (let col = 0; col < state.size; col++) {
      const stone = state.board[row][col];
      board[row * state.size + col] = stone === 'black' ? BLACK : stone === 'white' ? WHITE : EMPTY;
    }
  }
  return board;
}

/** The point the opponent just played, or −1 after a pass or at move one. */
function lastPlayedIndex(state: GoGameState): number {
  const last = state.moveHistory[state.moveHistory.length - 1];
  if (!last || last.position === null) return -1;
  return positionToIndex(last.position, state.size);
}

export const patternSearch: GoSearch = {
  id: 'pattern',
  label: 'Shaped-playout MCTS with RAVE',
  search: (state, candidates, options) => runSearch(state, candidates, options, DEFAULT_TUNING),
};

/** A backend with the knobs turned individually — the strength gate's handle. */
export function tunedPatternSearch(tuning: PatternSearchTuning): GoSearch {
  return {
    id: 'pattern',
    label: 'Shaped-playout MCTS (tuned)',
    search: (state, candidates, options) => runSearch(state, candidates, options, tuning),
  };
}
