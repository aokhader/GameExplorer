/**
 * The Go bot — Monte-Carlo tree search with random playouts.
 *
 * **Why not the minimax the other three games use.** Chess, checkers and
 * reversi are all searched by `weakEngine.ts`: alpha-beta over a hand-written
 * static evaluation. Neither half of that works in Go. The branching factor is
 * 81 at move one against chess's ~35, so the tree is out of reach at any useful
 * depth; and far worse, there is no cheap static evaluation to prune on — a
 * stone's value depends on whether the group it belongs to will live, which is
 * a whole-board question that a material count or a positional weight table
 * cannot answer. Counting stones on the board is close to meaningless in Go.
 *
 * MCTS sidesteps both problems by never evaluating a position at all. It plays
 * the game out at random to the end, where scoring IS trivial and exact, and
 * lets the average result of thousands of such playouts stand in for the
 * evaluation. Strength then scales with the number of playouts, which is what
 * the ELO bands below buy.
 *
 * **The one piece of Go knowledge here** is `isEye` — random play must not fill
 * its own eyes, or every group it builds dies during the playout and the result
 * carries no information. Every Monte-Carlo Go program since the 1990s has this
 * exclusion; without it the bot is not weak, it is random.
 *
 * The search runs on a flat `Uint8Array` board, not on `GoGameState`: a playout
 * is ~60–120 moves and a search is thousands of playouts, so cloning an
 * immutable 9×9 array of strings per move would dominate the runtime entirely.
 * The engine remains the authority on what is legal at the ROOT (including
 * superko, which playouts deliberately ignore — see `playout`).
 */

import { GoEngine } from './engine';
import type { GoColor, GoGameState } from './types';
import { randomSeed } from '../../utils/rng';
import { coordinatesToPosition, positionToCoordinates } from './utils';

// ---------------------------------------------------------------------------
// Flat board representation
// ---------------------------------------------------------------------------

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

type FastBoard = Uint8Array;

/** Precomputed adjacency for one board size — built once, shared by every search. */
interface Geometry {
  size: number;
  points: number;
  /** `points × 4`, off-board entries are −1. */
  neighbors: Int16Array;
  neighborCount: Uint8Array;
  diagonals: Int16Array;
  diagonalCount: Uint8Array;
}

const GEOMETRY_CACHE = new Map<number, Geometry>();

function geometryFor(size: number): Geometry {
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

function opponentOf(color: number): number {
  return color === BLACK ? WHITE : BLACK;
}

/**
 * Scratch buffers reused across every flood fill in a search.
 *
 * `marks` holds a monotonically increasing stamp per point instead of a boolean
 * that would have to be cleared: a fill just bumps the stamp, so visiting is
 * O(1) and resetting is free.
 */
interface Scratch {
  marks: Int32Array;
  stamp: number;
  stones: Int16Array;
  stack: Int16Array;
  order: Int16Array;
}

function createScratch(points: number): Scratch {
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
function groupHasLiberty(board: FastBoard, geo: Geometry, start: number, scratch: Scratch): boolean {
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
function collectGroup(
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
function playFast(board: FastBoard, geo: Geometry, idx: number, color: number, scratch: Scratch): boolean {
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
function isEye(board: FastBoard, geo: Geometry, idx: number, color: number): boolean {
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
function scoreFast(board: FastBoard, geo: Geometry, scratch: Scratch): number {
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

// ---------------------------------------------------------------------------
// Playouts
// ---------------------------------------------------------------------------

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
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// ---------------------------------------------------------------------------
// Monte-Carlo tree search
// ---------------------------------------------------------------------------

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
// ELO bands
// ---------------------------------------------------------------------------

interface GoBotConfig {
  /** MCTS iterations — one tree descent plus one playout each. */
  iterations: number;
  /** Chance of ignoring the search and playing a random legal point instead. */
  randomChance: number;
}

/**
 * `[lo, hi, iterationsLo, iterationsHi, randomLo, randomHi]`, interpolated
 * within the band exactly as the other three games' bands are.
 *
 * Strength in MCTS is bought with playouts, so the ladder is a playout budget
 * rather than a search depth. The random-move share is what makes the bottom
 * tiers beginner-weak: at 60 playouts the search is already poor, but it still
 * captures and connects, which reads as far too strong for a 400.
 */
const ELO_BANDS: [number, number, number, number, number, number][] = [
  [ 400,  700,    40,  120, 0.55, 0.30],
  [ 700, 1000,   120,  400, 0.30, 0.14],
  [1000, 1300,   400, 1200, 0.14, 0.05],
  [1300, 1600,  1200, 3000, 0.05, 0.01],
  [1600, 2000,  3000, 6000, 0.01, 0.00],
];

const MIN_ELO = 400;
const MAX_ELO = 2000;

/**
 * Hard ceiling on one search, whatever the iteration budget says.
 *
 * The budget is deliberately the *primary* limit rather than a time slice: a
 * tier has to mean the same strength on a laptop and on a mid-range Android, or
 * a rating earned against "Expert" means two different things. Measured at
 * ~100 µs an iteration on desktop Node, the top tier's 6,000 iterations is
 * ~0.6 s there and comfortably inside this ceiling on a phone several times
 * slower. The ceiling exists only so a device slower still degrades to a weaker
 * move instead of freezing.
 */
const SEARCH_CEILING_MS = 3000;

export function goEloToConfig(elo: number): GoBotConfig {
  const clamped = Math.max(MIN_ELO, Math.min(MAX_ELO, elo));
  for (const [lo, hi, iterLo, iterHi, randLo, randHi] of ELO_BANDS) {
    if (clamped >= lo && clamped <= hi) {
      const t = hi > lo ? (clamped - lo) / (hi - lo) : 0;
      return {
        iterations: Math.round(iterLo + t * (iterHi - iterLo)),
        randomChance: randLo + t * (randHi - randLo),
      };
    }
  }
  return { iterations: 10000, randomChance: 0 };
}

/** Playouts the hint and the position analyser use — the engine's best effort. */
export const GO_ANALYSIS_ITERATIONS = 6000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GoBotOptions {
  /**
   * Seed for reproducible play. Omitted → a fresh seed per call, so repeated
   * games differ; supplied → the same game every time, which is what the tests
   * and the bot-vs-bot harness rely on.
   */
  seed?: number;
  /**
   * Cancels the search. Structurally typed rather than `AbortSignal` so this
   * package keeps needing no DOM lib; a real `AbortSignal` satisfies it.
   */
  signal?: { aborted: boolean };
}

export interface GoBotMove {
  /** The point to play, or null to pass. */
  position: string | null;
}

export interface GoPositionEval extends GoBotMove {
  /** Win probability for the side to move, from the playouts. */
  winRate: number;
  /** Estimated final area lead for BLACK, komi included. Positive = black ahead. */
  scoreLead: number;
}

function abortError(): Error {
  const error = new Error('Go search aborted');
  error.name = 'AbortError';
  return error;
}

const SLICE_MS = 8;
const yieldToHost = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function toFastBoard(state: GoGameState): FastBoard {
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

function indexToPosition(idx: number, size: number): string {
  return coordinatesToPosition({ row: Math.floor(idx / size), col: idx % size });
}

function positionToIndex(position: string, size: number): number {
  const { row, col } = positionToCoordinates(position);
  return row * size + col;
}

/**
 * Should the bot end the game rather than keep playing?
 *
 * Two cases, and the split matters. If it has no move that is not an own eye,
 * it must pass — playing on could only fill its own territory or kill its own
 * groups. And if the opponent has just passed and the bot is ahead on the board
 * as it stands, passing *wins the game now*; playing on risks handing it back.
 * A bot that will not pass in a won position is the classic way a simple Go
 * program never finishes a game.
 */
function shouldPass(state: GoGameState, candidates: string[]): boolean {
  if (candidates.length === 0) return true;

  const last = state.moveHistory[state.moveHistory.length - 1];
  if (!last || last.position !== null) return false;

  const { lead } = GoEngine.score(state);
  return state.currentTurn === 'black' ? lead > 0 : lead < 0;
}

/**
 * The moves the bot will consider: legal by the full rules (the engine's list,
 * so superko is respected) and not an own eye.
 *
 * There is deliberately **no fallback** to the plain legal list when every legal
 * point is an own eye — that position means the bot is alive and has nothing
 * left to do, and it should pass. Filling the eye cannot gain a point (under
 * area scoring the point is already counted for it either way) and can lose the
 * whole group, which is the worst trade available on the board.
 */
function rootCandidates(state: GoGameState): string[] {
  const legal = GoEngine.getAllLegalMoves(state);
  if (legal.length === 0) return [];

  const geo = geometryFor(state.size);
  const board = toFastBoard(state);
  const color = state.currentTurn === 'black' ? BLACK : WHITE;
  return legal.filter(
    position => !isEye(board, geo, positionToIndex(position, state.size), color),
  );
}

async function search(
  state: GoGameState,
  candidates: string[],
  iterations: number,
  options: GoBotOptions,
): Promise<{ position: string; winRate: number; scoreLead: number }> {
  const geo = geometryFor(state.size);
  const rootBoard = toFastBoard(state);
  const rootColor = state.currentTurn === 'black' ? BLACK : WHITE;
  const random = createRandom(options.seed ?? randomSeed());
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

/**
 * The bot's move for a target rating, or a pass.
 *
 * Async and time-sliced: the search yields to the host every ~8 ms so neither
 * the browser's main thread nor React Native's JS thread ever loses a frame to
 * it. That is also why no Web Worker is needed for v1 — the same implementation
 * serves both platforms.
 */
export async function getBestGoMove(
  state: GoGameState,
  targetElo: number,
  options: GoBotOptions = {},
): Promise<GoBotMove> {
  if (state.isGameOver) throw new Error('Game is over — no move to make');

  const candidates = rootCandidates(state);
  if (shouldPass(state, candidates)) return { position: null };

  const config = goEloToConfig(targetElo);
  // The move number is mixed into the blunder seed on purpose. A caller that
  // passes a fixed seed (the tests, the bot-vs-bot harness) would otherwise get
  // the same first draw at every move of the game, so the "blunder now?" verdict
  // would never change — the same stuck-jitter bug the Liquidate bot harness
  // turned up, where a derived value keyed only off things that don't move.
  const random = createRandom((options.seed ?? randomSeed()) + state.moveHistory.length * 0x9e3779b9);

  if (config.randomChance > 0 && random() < config.randomChance) {
    return { position: candidates[Math.floor(random() * candidates.length)] };
  }

  const result = await search(state, candidates, config.iterations, options);
  return { position: result.position };
}

/**
 * The strongest move this engine can find, with its own assessment of the
 * position. Backs the training hint today; the eval numbers are there for the
 * review mode Go does not have yet.
 */
export async function analyzeGoPosition(
  state: GoGameState,
  options: GoBotOptions & { iterations?: number } = {},
): Promise<GoPositionEval> {
  if (state.isGameOver) {
    const { lead } = GoEngine.score(state);
    return { position: null, winRate: lead > 0 ? 1 : 0, scoreLead: lead };
  }

  const candidates = rootCandidates(state);
  if (candidates.length === 0) {
    const { lead } = GoEngine.score(state);
    return { position: null, winRate: 0.5, scoreLead: lead };
  }

  const result = await search(
    state,
    candidates,
    options.iterations ?? GO_ANALYSIS_ITERATIONS,
    options,
  );
  return result;
}

/** Exported for the tests — the eye rule the playout policy depends on. */
export const __testing = { geometryFor, toFastBoard, isEye, scoreFast, createScratch, BLACK, WHITE };
