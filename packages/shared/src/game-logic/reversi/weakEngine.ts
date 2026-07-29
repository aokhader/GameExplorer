import type { ReversiGameState } from './types';
import { ReversiEngine } from './engine';
import { getAllLegalPositions } from './moves';

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

function eloToConfig(elo: number): EloConfig {
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

const POSITION_WEIGHTS: number[][] = [
  [ 4, -3,  2,  2,  2,  2, -3,  4],
  [-3, -4, -1, -1, -1, -1, -4, -3],
  [ 2, -1,  1,  0,  0,  1, -1,  2],
  [ 2, -1,  0,  1,  1,  0, -1,  2],
  [ 2, -1,  0,  1,  1,  0, -1,  2],
  [ 2, -1,  1,  0,  0,  1, -1,  2],
  [-3, -4, -1, -1, -1, -1, -4, -3],
  [ 4, -3,  2,  2,  2,  2, -3,  4],
];

// ---------------------------------------------------------------------------
// Static evaluation
// ---------------------------------------------------------------------------

function evaluate(state: ReversiGameState, noise: number): number {
  if (state.isGameOver) {
    const counts = ReversiEngine.getDiscCounts(state);
    if (state.winner === 'black')  return  100_000;
    if (state.winner === 'white')  return -100_000;
    return 0;
  }

  let positional = 0;
  let discDiff   = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const disc = state.board[row][col];
      if (!disc) continue;
      const w = POSITION_WEIGHTS[row][col] * 10;
      if (disc.color === 'black') { positional += w; discDiff++; }
      else                        { positional -= w; discDiff--; }
    }
  }

  // Mobility: having more moves than the opponent is good
  const blackMoves = getAllLegalPositions(state.board, 'black').length;
  const whiteMoves = getAllLegalPositions(state.board, 'white').length;
  const mobility = (blackMoves + whiteMoves > 0)
    ? 100 * (blackMoves - whiteMoves) / (blackMoves + whiteMoves)
    : 0;

  const score = positional + mobility * 0.5 + discDiff * 2;

  if (noise > 0) return score + (Math.random() * 2 - 1) * noise;
  return score;
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
// ---------------------------------------------------------------------------

const WIN_SCORE = 100_000;

function minimax(
  state: ReversiGameState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  noise: number,
): number {
  if (state.isGameOver || depth === 0) return evaluate(state, noise);

  const moves = ReversiEngine.getAllLegalMoves(state);

  if (moves.length === 0) {
    // Must pass — recurse with pass state
    const passed = ReversiEngine.executePass(state);
    if (passed.isGameOver) return evaluate(passed, noise);
    return minimax(passed, depth - 1, alpha, beta, !isMaximizing, noise);
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (const pos of moves) {
      const next = ReversiEngine.executeMove(state, pos);
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false, noise));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const pos of moves) {
      const next = ReversiEngine.executeMove(state, pos);
      best = Math.min(best, minimax(next, depth - 1, alpha, beta, true, noise));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
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
  const config = eloToConfig(targetElo);
  const legalMoves = ReversiEngine.getAllLegalMoves(state);

  if (legalMoves.length === 0) {
    throw new Error('No legal moves — caller should handle pass');
  }

  // Blunder: play a random legal move
  if (config.blunderChance > 0 && Math.random() < config.blunderChance) {
    return { position: legalMoves[Math.floor(Math.random() * legalMoves.length)] };
  }

  const isMaximizing = state.currentTurn === 'black';
  let bestPos = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const pos of legalMoves) {
    const next = ReversiEngine.executeMove(state, pos);
    const score = minimax(
      next,
      config.depth - 1,
      -Infinity,
      Infinity,
      !isMaximizing,
      config.evalNoise,
    );
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

  const isMaximizing = state.currentTurn === 'black';
  let bestPos = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const pos of legalMoves) {
    const next = ReversiEngine.executeMove(state, pos);
    const score = minimax(next, depth - 1, -Infinity, Infinity, !isMaximizing, 0);
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
