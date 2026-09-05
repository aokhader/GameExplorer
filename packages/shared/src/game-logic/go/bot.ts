/**
 * The Go bot: the ELO ladder, the pass decision, and which search backend runs.
 *
 * **Why not the minimax the other three games use.** Chess, checkers and
 * reversi are all searched by `weakEngine.ts`: alpha-beta over a hand-written
 * static evaluation. Neither half of that works in Go. The branching factor is
 * 81 at move one against chess's ~35, and far worse, there is no cheap static
 * evaluation to prune on — a stone's value depends on whether the group it
 * belongs to will live, which is a whole-board question that a material count
 * cannot answer. Counting stones on the board is close to meaningless in Go.
 *
 * Monte-Carlo tree search sidesteps both problems by never evaluating a position
 * at all. It plays the game out to the end, where scoring IS trivial and exact,
 * and lets the average result of thousands of playouts stand in for the
 * evaluation. Strength then scales with the number of playouts, which is what
 * the ELO bands below buy.
 *
 * **Two backends live behind `GoSearch`** (`search/types.ts`). `pattern` plays
 * every real game: shaped playouts plus RAVE, which is what made 13×13 and
 * 19×19 worth offering at all. `classic` is the original uniform-playout engine,
 * kept because the bot-vs-bot harness measures the new one against it — a
 * strength claim needs something to be stronger than.
 *
 * The searches run on a flat `Uint8Array` board (`fastBoard.ts`), not on
 * `GoGameState`. This module is the only part that speaks both.
 */

import { GoEngine } from './engine';
import type { GoColor, GoGameState } from './types';
import { randomSeed } from '../../utils/rng';
import {
  BLACK,
  WHITE,
  createRandom,
  createScratch,
  geometryFor,
  isEye,
  positionToIndex,
  scoreFast,
  toFastBoard,
} from './fastBoard';
import { classicSearch } from './search/classic';
import { patternSearch } from './search/pattern';
import type { GoSearch } from './search/types';

export { classicSearch } from './search/classic';
export { patternSearch, tunedPatternSearch, DEFAULT_TUNING } from './search/pattern';
export type { PatternSearchTuning } from './search/pattern';
export { FULL_POLICY, UNIFORM_POLICY } from './search/policy';
export type { PolicyOptions } from './search/policy';
export type { GoSearch, GoSearchOptions, GoSearchResult } from './search/types';

/**
 * The backend every shipped game plays through.
 *
 * A constant rather than a setting: two players on the same tier must be facing
 * the same engine, or the rating attached to that tier means nothing.
 */
export const GO_SEARCH: GoSearch = patternSearch;

/** The benchmark opponent — see `search/classic.ts`. Never plays a real game. */
export const GO_REFERENCE_SEARCH: GoSearch = classicSearch;

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
 * tiers beginner-weak: a search this shaped still captures and connects at 30
 * playouts, which reads as far too strong for a 400.
 *
 * **These numbers are lower than the ones Go shipped with, and the bot is much
 * stronger.** The shaped-playout engine wins every game against the original at
 * *four times its playout budget* — that is, at equal wall-clock time — so a
 * budget that used to buy a mediocre move now buys a good one. Rebuilding the
 * ladder around the new engine is the only honest option: capping it back down
 * to the old strength would mean shipping a worse bot on purpose.
 *
 * The consequence is stated rather than hidden: **a Go rating earned before
 * this change was earned against a weaker opponent.** Nothing is migrated,
 * because with the ladder rebuilt there is no correct number to migrate to.
 */
const ELO_BANDS: [number, number, number, number, number, number][] = [
  [ 400,  700,    20,   60, 0.55, 0.30],
  [ 700, 1000,    60,  180, 0.30, 0.14],
  [1000, 1300,   180,  600, 0.14, 0.05],
  [1300, 1600,   600, 1800, 0.05, 0.01],
  [1600, 2000,  1800, 4000, 0.01, 0.00],
];

const MIN_ELO = 400;
const MAX_ELO = 2000;

/**
 * Playout budgets scale DOWN as the board grows, which looks backwards and is
 * not.
 *
 * A playout is a whole game, so it costs what the board costs: measured at
 * 1,000 playouts on desktop Node, one search takes 0.38 s at 9×9, 0.79 s at
 * 13×13 and 1.93 s at 19×19. Holding the budget fixed would put a 19×19 move
 * five times over the ceiling, and `SEARCH_CEILING_MS` would silently truncate
 * it — so a tier would mean one thing on a small board and something else on a
 * big one, which is exactly what the ceiling exists to prevent.
 *
 * Scaling the ladder instead keeps every tier's *thinking time* roughly equal
 * across sizes and makes the cost visible in one number. The bot is genuinely
 * weaker on a big board as a result. That is true of the technique, not just of
 * this implementation, and it is why **only 9×9 is rated.**
 */
const SIZE_BUDGET_SCALE: readonly (readonly [size: number, scale: number])[] = [
  [9, 1],
  [13, 0.5],
  [19, 0.25],
];

function budgetScale(size: number): number {
  for (const [boardSize, scale] of SIZE_BUDGET_SCALE) {
    if (size <= boardSize) return scale;
  }
  return 0.2;
}

export function goEloToConfig(elo: number, size = 9): GoBotConfig {
  const clamped = Math.max(MIN_ELO, Math.min(MAX_ELO, elo));
  const scale = budgetScale(size);

  for (const [lo, hi, iterLo, iterHi, randLo, randHi] of ELO_BANDS) {
    if (clamped >= lo && clamped <= hi) {
      const t = hi > lo ? (clamped - lo) / (hi - lo) : 0;
      return {
        // Never below 10: a search with nothing to search is not a weak bot, it
        // is the first legal move on the board.
        iterations: Math.max(10, Math.round((iterLo + t * (iterHi - iterLo)) * scale)),
        randomChance: randLo + t * (randHi - randLo),
      };
    }
  }
  return { iterations: Math.round(6000 * scale), randomChance: 0 };
}

/**
 * Playouts the hint and the position analyser use — the engine's best effort at
 * 9×9, scaled down for bigger boards the same way the ladder is.
 */
export const GO_ANALYSIS_ITERATIONS = 4000;

/** The analyser's budget for a board of this size. */
export function goAnalysisIterations(size: number): number {
  return Math.max(50, Math.round(GO_ANALYSIS_ITERATIONS * budgetScale(size)));
}
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
  // Not `isGameOver`: two passes open the dead-stone review, where the game
  // is not over but nobody is to move. The bot must sit that out too.
  if (state.phase !== 'playing') throw new Error('The board is being counted — no move to make');

  const candidates = rootCandidates(state);
  if (shouldPass(state, candidates)) return { position: null };

  const config = goEloToConfig(targetElo, state.size);
  // The move number is mixed into the blunder seed on purpose. A caller that
  // passes a fixed seed (the tests, the bot-vs-bot harness) would otherwise get
  // the same first draw at every move of the game, so the "blunder now?" verdict
  // would never change — the same stuck-jitter bug the Liquidate bot harness
  // turned up, where a derived value keyed only off things that don't move.
  const random = createRandom((options.seed ?? randomSeed()) + state.moveHistory.length * 0x9e3779b9);

  if (config.randomChance > 0 && random() < config.randomChance) {
    return { position: candidates[Math.floor(random() * candidates.length)] };
  }

  const result = await GO_SEARCH.search(state, candidates, {
    // Resolved here, not defaulted inside the backend: a backend that invented
    // its own fallback would make every unseeded game identical, which is a
    // bug with no symptom until someone plays twice.
    iterations: config.iterations,
    seed: options.seed ?? randomSeed(),
    signal: options.signal,
  });
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
  if (state.phase !== 'playing') {
    const { lead } = GoEngine.score(state);
    return { position: null, winRate: lead > 0 ? 1 : 0, scoreLead: lead };
  }

  const candidates = rootCandidates(state);
  if (candidates.length === 0) {
    const { lead } = GoEngine.score(state);
    return { position: null, winRate: 0.5, scoreLead: lead };
  }

  return GO_SEARCH.search(state, candidates, {
    iterations: options.iterations ?? goAnalysisIterations(state.size),
    seed: options.seed ?? randomSeed(),
    signal: options.signal,
  });
}


/** Exported for the tests — the primitives the engine's behaviour is pinned on. */
export const __testing = {
  geometryFor,
  toFastBoard,
  isEye,
  positionToIndex,
  scoreFast,
  createScratch,
  rootCandidates,
  shouldPass,
  BLACK,
  WHITE,
};
