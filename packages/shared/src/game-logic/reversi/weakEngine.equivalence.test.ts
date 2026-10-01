/**
 * The bit-set search must be the search it replaced, draw for draw.
 *
 * `weakEngine.ts` used to search on `ReversiGameState`, through the same
 * `ReversiEngine` and `getAllLegalPositions` the game uses. It now searches on
 * bit sets, a hundred-odd times faster, and nothing about what it plays may
 * change: web's e2e suite replays bot lines from a seeded `Math.random`, and
 * the eval noise is drawn at each leaf in visiting order, so a search that
 * visited one leaf more, or in another order, would play a different line.
 *
 * So the old search is kept below, verbatim apart from its plumbing, as the
 * spec. Each test seeds `Math.random`, runs both, and compares the move and the
 * number of draws, or the review's exact score.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { boardToBits, flips, legalMoves, type SquareSet } from './bitboard';
import { ReversiEngine } from './engine';
import { getAllLegalPositions, getFlips } from './moves';
import type { ReversiGameState } from './types';
import { coordinatesToPosition } from './utils';
import {
  analyzeReversiPosition,
  eloToConfig,
  getBestReversiMove,
  POSITION_WEIGHTS,
} from './weakEngine';

// ---------------------------------------------------------------------------
// The reference: the state-based search, as it was before the bit sets
// ---------------------------------------------------------------------------

function referenceEvaluate(state: ReversiGameState, noise: number): number {
  if (state.isGameOver) {
    if (state.winner === 'black') return 100_000;
    if (state.winner === 'white') return -100_000;
    return 0;
  }

  let positional = 0;
  let discDiff = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const disc = state.board[row][col];
      if (!disc) continue;
      const w = POSITION_WEIGHTS[row][col] * 10;
      if (disc.color === 'black') { positional += w; discDiff++; }
      else                        { positional -= w; discDiff--; }
    }
  }

  const blackMoves = getAllLegalPositions(state.board, 'black').length;
  const whiteMoves = getAllLegalPositions(state.board, 'white').length;
  const mobility = (blackMoves + whiteMoves > 0)
    ? 100 * (blackMoves - whiteMoves) / (blackMoves + whiteMoves)
    : 0;

  const score = positional + mobility * 0.5 + discDiff * 2;

  if (noise > 0) return score + (Math.random() * 2 - 1) * noise;
  return score;
}

function referenceMinimax(
  state: ReversiGameState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  noise: number,
): number {
  if (state.isGameOver || depth === 0) return referenceEvaluate(state, noise);

  const moves = ReversiEngine.getAllLegalMoves(state);

  if (moves.length === 0) {
    const passed = ReversiEngine.executePass(state);
    if (passed.isGameOver) return referenceEvaluate(passed, noise);
    return referenceMinimax(passed, depth - 1, alpha, beta, !isMaximizing, noise);
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (const pos of moves) {
      const next = ReversiEngine.executeMove(state, pos);
      const score = referenceMinimax(next, depth - 1, alpha, beta, false, noise);
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const pos of moves) {
      const next = ReversiEngine.executeMove(state, pos);
      const score = referenceMinimax(next, depth - 1, alpha, beta, true, noise);
      best = Math.min(best, score);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** The root of the old search: best square for `depth` and `noise`, first one on ties. */
function referenceRoot(
  state: ReversiGameState,
  depth: number,
  noise: number,
): { position: string; score: number } {
  const legalMoves = ReversiEngine.getAllLegalMoves(state);
  const isMaximizing = state.currentTurn === 'black';
  let bestPos = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const pos of legalMoves) {
    const next = ReversiEngine.executeMove(state, pos);
    const score = referenceMinimax(next, depth - 1, -Infinity, Infinity, !isMaximizing, noise);
    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }
  return { position: bestPos, score: bestScore };
}

function referenceBestMove(state: ReversiGameState, targetElo: number): string {
  const config = eloToConfig(targetElo);
  const legalMoves = ReversiEngine.getAllLegalMoves(state);
  if (config.blunderChance > 0 && Math.random() < config.blunderChance) {
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
  }
  return referenceRoot(state, config.depth, config.evalNoise).position;
}

// ---------------------------------------------------------------------------
// Positions and a pinned Math.random
// ---------------------------------------------------------------------------

/** mulberry32 over a counter — any fixed sequence will do. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Swapped in by hand rather than with `vi.spyOn`, which records every call:
 * a depth-5 search with noise draws hundreds of thousands of times.
 */
const realRandom = Math.random;
let draws = 0;
function seedRandom(seed: number) {
  const random = seeded(seed);
  draws = 0;
  Math.random = () => {
    draws++;
    return random();
  };
}

/**
 * A position `plies` random moves into a game (passing when it must). Late
 * ones matter as much as open ones: they are where the search meets passes and
 * finished games inside the tree.
 */
function randomPosition(seed: number, plies: number): ReversiGameState {
  const random = seeded(seed);
  let s = ReversiEngine.newGame();
  for (let i = 0; i < plies && !s.isGameOver; i++) {
    const moves = ReversiEngine.getAllLegalMoves(s);
    s = moves.length === 0
      ? ReversiEngine.executePass(s)
      : ReversiEngine.executeMove(s, moves[Math.floor(random() * moves.length)]);
  }
  return s;
}

const PLIES = [0, 4, 9, 14, 20, 26, 31, 36, 40, 44, 47, 50, 52, 54, 56, 58];
const POSITIONS = PLIES.flatMap((plies, i) => [
  randomPosition(100 + i, plies),
  randomPosition(200 + i, plies),
]);
const PLAYABLE = POSITIONS.filter((s) => ReversiEngine.getAllLegalMoves(s).length > 0);

function squaresOf(set: SquareSet): string[] {
  const out: string[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const on = sq < 32 ? (set.lo >>> sq) & 1 : (set.hi >>> (sq - 32)) & 1;
    if (on) out.push(coordinatesToPosition({ row: sq >> 3, col: sq & 7 }));
  }
  return out;
}

// ---------------------------------------------------------------------------

describe('bit sets agree with moves.ts', () => {
  it('on every legal move and every flip, for both sides', () => {
    for (const s of POSITIONS) {
      const { black, white } = boardToBits(s.board);
      for (const [color, p, o] of [['black', black, white], ['white', white, black]] as const) {
        const out: SquareSet = { lo: 0, hi: 0 };
        legalMoves(p.lo, p.hi, o.lo, o.hi, out);
        // Same squares, and listed in the same order.
        expect(squaresOf(out)).toEqual(getAllLegalPositions(s.board, color));

        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            if (s.board[row][col]) continue;
            const pos = coordinatesToPosition({ row, col });
            flips(row * 8 + col, p.lo, p.hi, o.lo, o.hi, out);
            expect(squaresOf(out).sort()).toEqual([...getFlips(s.board, pos, color)].sort());
          }
        }
      }
    }
  });
});

describe('the bit-set search is the state-based search', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  it('review scores and squares match exactly, depths 1 to 4', () => {
    for (const [i, s] of POSITIONS.entries()) {
      // Depth 4 (review's default) on every fourth position: it is the slow one.
      for (let depth = 1; depth <= (i % 4 === 0 ? 4 : 3); depth++) {
        const got = analyzeReversiPosition(s, depth);
        if (s.isGameOver || ReversiEngine.getAllLegalMoves(s).length === 0) {
          // Handled before any search, by code both versions share.
          continue;
        }
        const want = referenceRoot(s, depth, 0);
        expect(got.bestMove?.position).toBe(want.position);
        expect(Object.is(got.score, -want.score)).toBe(true);
      }
    }
  });

  it('the bot plays the same square after the same draws, in every band', () => {
    // Bands: depth 1 (400–700), 2, 3, 4, 5 with noise (1600–1999), and 2000,
    // which has neither noise nor blunders.
    const elos = [450, 650, 800, 1100, 1250, 1400, 1550, 1700, 1999, 2000];
    let compared = 0;
    for (const [i, s] of PLAYABLE.entries()) {
      // The old search takes seconds at depth 5 in an open midgame, so depths 4
      // and 5 run in full where it is quick: the opening, and the last sixteen
      // empty squares, which is where passes and finished games turn up inside
      // the tree. In between, depth 4 on every other position.
      const { black, white } = ReversiEngine.getDiscCounts(s);
      const empties = 64 - black - white;
      const quick = empties >= 56 || empties <= 16;
      const bands = elos.filter((e) => quick || e < 1300 || (e === 1400 && i % 2 === 0));
      for (const elo of bands) {
        const seed = i * 31 + elo;
        seedRandom(seed);
        const want = referenceBestMove(s, elo);
        const wantDraws = draws;

        seedRandom(seed);
        const got = getBestReversiMove(s, elo).position;
        Math.random = realRandom;

        expect([got, draws]).toEqual([want, wantDraws]);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(150);
  });
});
