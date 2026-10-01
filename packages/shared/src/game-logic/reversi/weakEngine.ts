import type { ReversiGameState } from './types';
import {
  runSearch,
  runSearchSliced,
  type ShouldPause,
  type SlicedSearchOptions,
} from '../../utils/slicedSearch';
import { ReversiEngine } from './engine';
import { boardToBits, flips, legalMoves, popcount, squareIndex, type SquareSet } from './bitboard';

// ---------------------------------------------------------------------------
// ELO configuration bands
// ---------------------------------------------------------------------------

const ELO_BANDS: [number, number, number, number, number, number, number][] = [
  //  lo    hi   depth  blunderLo  blunderHi  noiseLo  noiseHi
  [  400,  700,    1,     0.55,      0.22,      50,       20  ],
  [  700, 1000,    2,     0.22,      0.08,      25,       10  ],
  [ 1000, 1300,    3,     0.08,      0.03,      12,        4  ],
  [ 1300, 1600,    4,     0.03,      0.005,      5,        1  ],
  [ 1600, 2000,    5,     0.005,     0.00,       2,        0  ],
];

interface EloConfig { depth: number; blunderChance: number; evalNoise: number }

/** Exported for `weakEngine.equivalence.test.ts`; not part of the package API. */
export function eloToConfig(elo: number): EloConfig {
  const e = Math.max(400, Math.min(2000, elo));
  for (const [lo, hi, depth, blLo, blHi, nLo, nHi] of ELO_BANDS) {
    if (e >= lo && e <= hi) {
      const t = hi > lo ? (e - lo) / (hi - lo) : 0;
      return {
        depth,
        blunderChance: blLo + t * (blHi - blLo),
        evalNoise:     nLo  + t * (nHi  - nLo),
      };
    }
  }
  return { depth: 5, blunderChance: 0, evalNoise: 0 };
}

// ---------------------------------------------------------------------------
// Positional weight table
// Classic Reversi heuristic: corners are enormously valuable; C-squares
// (diagonally adjacent to corners) are bad; edges are good; centre is neutral.
// ---------------------------------------------------------------------------

/** Exported for `weakEngine.equivalence.test.ts`; not part of the package API. */
export const POSITION_WEIGHTS: number[][] = [
  [ 4, -3,  2,  2,  2,  2, -3,  4],
  [-3, -4, -1, -1, -1, -1, -4, -3],
  [ 2, -1,  1,  0,  0,  1, -1,  2],
  [ 2, -1,  0,  1,  1,  0, -1,  2],
  [ 2, -1,  0,  1,  1,  0, -1,  2],
  [ 2, -1,  1,  0,  0,  1, -1,  2],
  [-3, -4, -1, -1, -1, -1, -4, -3],
  [ 4, -3,  2,  2,  2,  2, -3,  4],
];

/** A disc's positional worth by square index (`bitboard.ts`), in the units `evaluate` adds. */
const SQUARE_VALUE: number[] = POSITION_WEIGHTS.flat().map((w) => w * 10);

// ---------------------------------------------------------------------------
// Static evaluation
// ---------------------------------------------------------------------------

const WIN_SCORE = 100_000;

/**
 * A position the game has not ended in, Black-positive like the whole search.
 *
 * `positional` (each disc's square weight, Black's minus White's) and
 * `discDiff` are kept up to date move by move instead of being recounted here.
 * Both are whole numbers, so they sum to exactly what a recount gives.
 */
function evaluate(
  positional: number,
  discDiff: number,
  blackMoves: number,
  whiteMoves: number,
  noise: number,
): number {
  // Mobility: having more moves than the opponent is good
  const mobility = (blackMoves + whiteMoves > 0)
    ? 100 * (blackMoves - whiteMoves) / (blackMoves + whiteMoves)
    : 0;

  const score = positional + mobility * 0.5 + discDiff * 2;

  if (noise > 0) return score + (Math.random() * 2 - 1) * noise;
  return score;
}

/** A finished game, won by whoever has more discs. */
function finalScore(discDiff: number): number {
  if (discDiff > 0) return  WIN_SCORE;
  if (discDiff < 0) return -WIN_SCORE;
  return 0;
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
//
// The search runs on bit sets (`bitboard.ts`), not on `ReversiGameState`.
// Copying a state — its board once per flipped disc, its whole move history —
// and asking `getAllLegalPositions` four times at every node was nearly all of
// its time.
//
// It is still the same search, and has to stay so: the same move, and the same
// `Math.random` draws in the same order (the eval noise, drawn at each leaf),
// because web's e2e suite replays bot lines from a seeded `Math.random`. So
// moves are tried in the order `getAllLegalPositions` lists them, under the
// same windows, with the same pass handling and the same evaluation.
// `weakEngine.equivalence.test.ts` holds it to the state-based search.
// ---------------------------------------------------------------------------

/** Where `legalMoves` and `flips` leave a result; read straight after the call. */
const bits: SquareSet = { lo: 0, hi: 0 };

/**
 * The position `playMove` leads to, seen from the side now to move: `p` their
 * discs, `o` the other side's, `m` their legal moves. Read before the next
 * `playMove` overwrites it.
 */
const next = { pl: 0, ph: 0, ol: 0, oh: 0, ml: 0, mh: 0, positional: 0, discDiff: 0, value: 0 };

/**
 * Play `square` for the side to move (`p`; Black when `black`) and leave the
 * position it leads to in `next`.
 *
 * Returns true when the search stops there — the game is over, or `depth` is
 * used up — with its score in `next.value`; false when it is to be searched
 * `depth` plies deeper. This is `ReversiEngine.executeMove` plus the top of
 * the old minimax: game over when neither side can move (a full board is one
 * case of that), and a leaf scored right here, so its noise is drawn when the
 * old search drew it.
 */
function playMove(
  pl: number,
  ph: number,
  ol: number,
  oh: number,
  black: boolean,
  positional: number,
  discDiff: number,
  square: number,
  depth: number,
  noise: number,
): boolean {
  flips(square, pl, ph, ol, oh, bits);
  const fl = bits.lo;
  const fh = bits.hi;
  // The mover gains the square and the flipped discs; the other side loses them.
  const ql = pl | fl | (square < 32 ? 1 << square : 0);
  const qh = ph | fh | (square < 32 ? 0 : 1 << (square - 32));
  const rl = ol & ~fl;
  const rh = oh & ~fh;

  // A placed disc counts once; a flipped one moves from their column to ours.
  let gain = SQUARE_VALUE[square];
  let discs = 1;
  for (let f = fl; f !== 0; f &= f - 1) {
    gain += 2 * SQUARE_VALUE[31 - Math.clz32(f & -f)];
    discs += 2;
  }
  for (let f = fh; f !== 0; f &= f - 1) {
    gain += 2 * SQUARE_VALUE[63 - Math.clz32(f & -f)];
    discs += 2;
  }
  positional = black ? positional + gain : positional - gain;
  discDiff = black ? discDiff + discs : discDiff - discs;

  // The other side is to move now.
  legalMoves(rl, rh, ql, qh, bits);
  const ml = bits.lo;
  const mh = bits.hi;
  next.pl = rl;
  next.ph = rh;
  next.ol = ql;
  next.oh = qh;
  next.ml = ml;
  next.mh = mh;
  next.positional = positional;
  next.discDiff = discDiff;

  if (depth !== 0 && (ml | mh) !== 0) return false;

  // A leaf, or they must pass: either way the mover's own moves now count.
  legalMoves(ql, qh, rl, rh, bits);
  const moverMoves = popcount(bits.lo) + popcount(bits.hi);
  if ((ml | mh) === 0 && moverMoves === 0) {
    next.value = finalScore(discDiff);
    return true;
  }
  if (depth !== 0) return false;

  const theirMoves = popcount(ml) + popcount(mh);
  next.value = black
    ? evaluate(positional, discDiff, moverMoves, theirMoves, noise)
    : evaluate(positional, discDiff, theirMoves, moverMoves, noise);
  return true;
}

/**
 * The search, as a generator that can pause at any interior node — see
 * `utils/slicedSearch.ts`. `minimax` below runs it without pausing.
 *
 * The position is one `playMove` left in `next`: not over, `depth` plies still
 * to go, `black` to move — which is also whether this node maximises.
 * `passes` is the passes in a row that led here.
 */
function* minimaxSteps(
  pl: number,
  ph: number,
  ol: number,
  oh: number,
  ml: number,
  mh: number,
  black: boolean,
  positional: number,
  discDiff: number,
  passes: number,
  depth: number,
  alpha: number,
  beta: number,
  noise: number,
  shouldPause: ShouldPause,
): Generator<void, number, void> {
  if (shouldPause()) yield;

  if ((ml | mh) === 0) {
    // Must pass — recurse on the same discs with the other side to move
    if (passes + 1 >= 2) return finalScore(discDiff);
    legalMoves(ol, oh, pl, ph, bits);
    const nl = bits.lo;
    const nh = bits.hi;
    if (depth === 1) {
      const theirMoves = popcount(nl) + popcount(nh);
      return black
        ? evaluate(positional, discDiff, 0, theirMoves, noise)
        : evaluate(positional, discDiff, theirMoves, 0, noise);
    }
    return yield* minimaxSteps(
      ol, oh, pl, ph, nl, nh, !black, positional, discDiff, passes + 1,
      depth - 1, alpha, beta, noise, shouldPause,
    );
  }

  // Squares in index order — a1, b1, …, h8 — as `getAllLegalPositions` lists them.
  let restLo = ml;
  let restHi = mh;
  let best = black ? -Infinity : Infinity;
  while ((restLo | restHi) !== 0) {
    let square: number;
    if (restLo !== 0) {
      square = 31 - Math.clz32(restLo & -restLo);
      restLo &= restLo - 1;
    } else {
      square = 63 - Math.clz32(restHi & -restHi);
      restHi &= restHi - 1;
    }

    const score = playMove(pl, ph, ol, oh, black, positional, discDiff, square, depth - 1, noise)
      ? next.value
      : yield* minimaxSteps(
          next.pl, next.ph, next.ol, next.oh, next.ml, next.mh, !black,
          next.positional, next.discDiff, 0, depth - 1, alpha, beta, noise, shouldPause,
        );

    if (black) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** A game state as the search sees it. */
interface SearchRoot {
  pl: number;
  ph: number;
  ol: number;
  oh: number;
  black: boolean;
  positional: number;
  discDiff: number;
}

function searchRoot(state: ReversiGameState): SearchRoot {
  const { black, white } = boardToBits(state.board);
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
  const blackToMove = state.currentTurn === 'black';
  const [p, o] = blackToMove ? [black, white] : [white, black];
  return { pl: p.lo, ph: p.hi, ol: o.lo, oh: o.hi, black: blackToMove, positional, discDiff };
}

/** The score after the side to move in `root` plays `position`, searched `depth` plies on. */
function* moveScoreSteps(
  root: SearchRoot,
  position: string,
  depth: number,
  noise: number,
  shouldPause: ShouldPause,
): Generator<void, number, void> {
  const { pl, ph, ol, oh, black, positional, discDiff } = root;
  if (playMove(pl, ph, ol, oh, black, positional, discDiff, squareIndex(position), depth, noise)) {
    return next.value;
  }
  return yield* minimaxSteps(
    next.pl, next.ph, next.ol, next.oh, next.ml, next.mh, !black,
    next.positional, next.discDiff, 0, depth, -Infinity, Infinity, noise, shouldPause,
  );
}

function moveScore(root: SearchRoot, position: string, depth: number, noise: number): number {
  return runSearch((shouldPause) => moveScoreSteps(root, position, depth, noise, shouldPause));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReversiiBotMove {
  position: string;
}

export function getBestReversiMove(
  state: ReversiGameState,
  targetElo: number,
): ReversiiBotMove {
  return runSearch((shouldPause) => bestMoveSteps(state, targetElo, shouldPause));
}

/**
 * `getBestReversiMove`, run a few milliseconds at a time so the thread it shares
 * with the UI keeps answering (see `utils/slicedSearch.ts`). The bot and hint
 * use it on mobile and on web. Same square for the same `Math.random` draws.
 */
export function getBestReversiMoveSliced(
  state: ReversiGameState,
  targetElo: number,
  options?: SlicedSearchOptions,
): Promise<ReversiiBotMove> {
  return runSearchSliced((shouldPause) => bestMoveSteps(state, targetElo, shouldPause), options);
}

function* bestMoveSteps(
  state: ReversiGameState,
  targetElo: number,
  shouldPause: ShouldPause,
): Generator<void, ReversiiBotMove, void> {
  const config = eloToConfig(targetElo);
  const legalMoves = ReversiEngine.getAllLegalMoves(state);

  if (legalMoves.length === 0) {
    throw new Error('No legal moves — caller should handle pass');
  }

  // Blunder: play a random legal move
  if (config.blunderChance > 0 && Math.random() < config.blunderChance) {
    return { position: legalMoves[Math.floor(Math.random() * legalMoves.length)] };
  }

  const root = searchRoot(state);
  const isMaximizing = root.black;
  let bestPos = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const pos of legalMoves) {
    const score = yield* moveScoreSteps(root, pos, config.depth - 1, config.evalNoise, shouldPause);
    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return { position: bestPos };
}

/** A scored look at one position — what game review needs, unlike the bot. */
export interface ReversiPositionEval {
  /**
   * WHITE-positive: > 0 means White stands better. Note this is the negation of
   * what `evaluate`/`minimax` work in (they maximise for Black, who moves
   * first) — normalised here so every game's review speaks the same sign
   * convention. The scale is positional, not discs: a corner is worth ~40.
   */
  score: number;
  /** Best square for the side to move, or null when it must pass / is over. */
  bestMove: ReversiiBotMove | null;
  /** True when the score is a decided result rather than a heuristic. */
  terminal: boolean;
}

/**
 * Full-strength search returning the SCORE as well as the square — the review
 * counterpart to `getBestReversiMove`, which deliberately hides both (it
 * blunders and adds noise on purpose to hit a target ELO).
 *
 * No blunder chance and no eval noise: review has to be reproducible, or the
 * same position would grade differently each time you opened it.
 */
export function analyzeReversiPosition(
  state: ReversiGameState,
  depth = 4,
): ReversiPositionEval {
  if (state.isGameOver) {
    const score = state.winner === null ? 0 : state.winner === 'white' ? WIN_SCORE : -WIN_SCORE;
    return { score, bestMove: null, terminal: true };
  }

  const legalMoves = ReversiEngine.getAllLegalMoves(state);
  if (legalMoves.length === 0) {
    // Must pass — score the position the turn actually lands on, so a forced
    // pass doesn't read as a blunder by the player who had no choice.
    const passed = ReversiEngine.executePass(state);
    const after = analyzeReversiPosition(passed, depth);
    return { score: after.score, bestMove: null, terminal: after.terminal };
  }

  const root = searchRoot(state);
  const isMaximizing = root.black;
  let bestPos = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const pos of legalMoves) {
    const score = moveScore(root, pos, depth - 1, 0);
    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return {
    // Black-maximising → White-positive.
    score: -bestScore,
    bestMove: { position: bestPos },
    terminal: Math.abs(bestScore) >= WIN_SCORE,
  };
}
