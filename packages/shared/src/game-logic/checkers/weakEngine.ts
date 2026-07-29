import type { CheckersGameState } from './types';
import { CheckersEngine } from './engine';

// ---------------------------------------------------------------------------
// ELO configuration bands
// ---------------------------------------------------------------------------

// Checkers is a solved game (perfect play = draw), so the practical ceiling is
// around 2000 — beyond that the bot plays near-perfectly.
const ELO_BANDS: [number, number, number, number, number, number, number][] = [
  //  lo    hi   depth  blunderLo  blunderHi  noiseLo  noiseHi
  [  400,  700,    1,     0.60,      0.25,      60,       25  ],
  [  700, 1000,    2,     0.25,      0.10,      30,       12  ],
  [ 1000, 1300,    3,     0.10,      0.04,      15,        6  ],
  [ 1300, 1600,    4,     0.04,      0.01,       8,        3  ],
  [ 1600, 2000,    5,     0.01,      0.00,       3,        0  ],
];

interface EloConfig { depth: number; blunderChance: number; evalNoise: number }

function eloToConfig(elo: number): EloConfig {
  const e = Math.max(400, Math.min(2000, elo));
  for (const [lo, hi, depth, blLo, blHi, nLo, nHi] of ELO_BANDS) {
    if (e >= lo && e < hi) {
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
// Static evaluation
// ---------------------------------------------------------------------------

const MAN_VALUE  = 100;
const KING_VALUE = 160;

// Positional bonus: centre squares are more valuable
const POSITIONAL_BONUS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 2, 2, 2, 2, 2, 0],
  [0, 2, 4, 4, 4, 4, 2, 0],
  [0, 2, 4, 6, 6, 4, 2, 0],
  [0, 2, 4, 6, 6, 4, 2, 0],
  [0, 2, 4, 4, 4, 4, 2, 0],
  [0, 2, 2, 2, 2, 2, 2, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

function evaluate(state: CheckersGameState, noise: number): number {
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col];
      if (!piece) continue;

      const material = piece.type === 'king' ? KING_VALUE : MAN_VALUE;
      // Small bonus for pieces on the back row (anchor row, harder for opponent to promote)
      const backRowBonus =
        (piece.color === 'white' && row === 0) ||
        (piece.color === 'black' && row === 7)
          ? 8
          : 0;
      const positional = POSITIONAL_BONUS[row][col];
      const value = material + backRowBonus + positional;

      score += piece.color === 'white' ? value : -value;
    }
  }

  if (noise > 0) score += (Math.random() * 2 - 1) * noise;

  return score;
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
// ---------------------------------------------------------------------------

const CHECKMATE_SCORE = 100_000;

function minimax(
  state: CheckersGameState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  noise: number,
): number {
  if (state.isGameOver) {
    if (state.winner === null) return 0; // draw
    return state.winner === 'white' ? CHECKMATE_SCORE : -CHECKMATE_SCORE;
  }
  if (depth === 0) return evaluate(state, noise);

  const moves = CheckersEngine.getAllLegalMoves(state);
  if (moves.length === 0) {
    return isMaximizing ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
  }

  // Prioritise captures for better pruning
  const ordered = [...moves].sort((a, b) => b.captures.length - a.captures.length);

  if (isMaximizing) {
    let best = -Infinity;
    for (const move of ordered) {
      const next = CheckersEngine.executeMove(state, move);
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false, noise));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of ordered) {
      const next = CheckersEngine.executeMove(state, move);
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

export interface CheckersBotMove {
  from: string;
  to: string;
}

/**
 * Returns the best move calibrated to `targetElo` (400–2000).
 */
export function getBestCheckersMove(
  state: CheckersGameState,
  targetElo: number,
): CheckersBotMove {
  const config = eloToConfig(targetElo);
  const legalMoves = CheckersEngine.getAllLegalMoves(state);

  if (legalMoves.length === 0) {
    throw new Error('No legal moves — game should already be over');
  }

  if (config.blunderChance > 0 && Math.random() < config.blunderChance) {
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return { from: move.from, to: move.to };
  }

  const isMaximizing = state.currentTurn === 'white';
  let bestMove = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  const ordered = [...legalMoves].sort((a, b) => b.captures.length - a.captures.length);

  for (const move of ordered) {
    const next = CheckersEngine.executeMove(state, move);
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
      bestMove = move;
    }
  }

  return { from: bestMove.from, to: bestMove.to };
}

/** A scored look at one position — what game review needs, unlike the bot. */
export interface CheckersPositionEval {
  /**
   * White-positive: > 0 means White stands better. Roughly centipawn-scaled —
   * a man is worth 100 — so the same "how much did that move cost" thresholds
   * chess review uses carry over.
   */
  score: number;
  /** Best move for the side to move, or null in a finished position. */
  bestMove: CheckersBotMove | null;
  /** True when the score is a decided result rather than a heuristic. */
  terminal: boolean;
}

/**
 * Full-strength search returning the SCORE as well as the move — the review
 * counterpart to `getBestCheckersMove`, which deliberately hides both (it
 * blunders and adds noise on purpose to hit a target ELO).
 *
 * No blunder chance and no eval noise: review has to be reproducible, or the
 * same position would grade differently each time you opened it.
 */
export function analyzeCheckersPosition(
  state: CheckersGameState,
  depth = 4,
): CheckersPositionEval {
  if (state.isGameOver) {
    const score = state.winner === null ? 0 : state.winner === 'white' ? CHECKMATE_SCORE : -CHECKMATE_SCORE;
    return { score, bestMove: null, terminal: true };
  }

  const legalMoves = CheckersEngine.getAllLegalMoves(state);
  if (legalMoves.length === 0) {
    // No move = loss for the side to move, the same rule minimax applies.
    const score = state.currentTurn === 'white' ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
    return { score, bestMove: null, terminal: true };
  }

  const isMaximizing = state.currentTurn === 'white';
  const ordered = [...legalMoves].sort((a, b) => b.captures.length - a.captures.length);

  let bestMove = ordered[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const move of ordered) {
    const next = CheckersEngine.executeMove(state, move);
    const score = minimax(next, depth - 1, -Infinity, Infinity, !isMaximizing, 0);
    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    score: bestScore,
    bestMove: { from: bestMove.from, to: bestMove.to },
    terminal: Math.abs(bestScore) >= CHECKMATE_SCORE,
  };
}
