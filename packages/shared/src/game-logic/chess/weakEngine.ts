// Minimax-based weak chess engine to simulate low-ELO play (~600–1200)

import type { ChessGameState, Color, Position, PieceType } from '../../types/chess.types';
import { ChessEngine } from './engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Difficulty = 'beginner' | 'easy' | 'medium';

interface DifficultyConfig {
  /** Minimax search depth */
  depth: number;
  /**
   * Probability [0–1] of ignoring the engine and playing a uniformly random
   * legal move. This is the single most effective lever for very-low ELOs:
   * real 600-rated players don't just think shallowly — they actively hang
   * pieces due to inattention.
   */
  blunderChance: number;
  /**
   * Gaussian noise (±centipawns) added to every leaf evaluation. Keeps the
   * engine from playing perfectly within its search window.
   */
  evalNoise: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  // ~600 Elo — misses almost everything, frequent random blunders
  beginner: { depth: 1, blunderChance: 0.40, evalNoise: 150 },
  // ~900 Elo — sees one-move tactics, still makes mistakes
  easy:     { depth: 2, blunderChance: 0.15, evalNoise:  80 },
  // ~1100–1200 Elo — consistent but beatable; hand off to Stockfish above this
  medium:   { depth: 3, blunderChance: 0.05, evalNoise:  30 },
};

// ---------------------------------------------------------------------------
// Piece-square tables (white's perspective, rank 1 = index 0)
// These nudge the engine toward natural development without deep search.
// ---------------------------------------------------------------------------

const PST: Record<PieceType, number[][]> = {
  pawn: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  knight: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  bishop: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  rook: [
    [ 0,  0,  0,  5,  5,  0,  0,  0],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  queen: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  king: [
    [ 20, 30, 10,  0,  0, 10, 30, 20],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
  ],
};

const PIECE_VALUE: Record<PieceType, number> = {
  pawn:   100,
  knight: 320,
  bishop: 330,
  rook:   500,
  queen:  900,
  king:     0, // King value not counted — its safety comes from check/checkmate
};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Static evaluation of a position from White's perspective (positive = good for white).
 * Combines material count with piece-square table bonuses.
 */
function evaluate(state: ChessGameState, noise: number): number {
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col];
      if (!piece) continue;

      const material = PIECE_VALUE[piece.type];
      // PST is always indexed from white's perspective (row 0 = rank 1)
      const pstRow = piece.color === 'white' ? row : 7 - row;
      const positional = PST[piece.type][pstRow][col];
      const value = material + positional;

      score += piece.color === 'white' ? value : -value;
    }
  }

  // Add small random noise to break ties non-deterministically
  if (noise > 0) {
    score += (Math.random() * 2 - 1) * noise;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Move ordering (improves alpha-beta pruning efficiency)
// ---------------------------------------------------------------------------

function scoreMove(
  state: ChessGameState,
  move: { from: Position; to: Position },
): number {
  const { board } = state;
  const attacker = board[charToRow(move.from[1])][charToCol(move.from[0])];
  const victim   = board[charToRow(move.to[1])][charToCol(move.to[0])];

  if (attacker && victim) {
    // MVV-LVA: Most Valuable Victim – Least Valuable Attacker
    return PIECE_VALUE[victim.type] - PIECE_VALUE[attacker.type] / 10;
  }
  return 0;
}

function charToRow(rank: string): number { return parseInt(rank) - 1; }
function charToCol(file: string): number { return file.charCodeAt(0) - 97; }

function orderMoves(
  state: ChessGameState,
  moves: { from: Position; to: Position }[],
): { from: Position; to: Position }[] {
  return [...moves].sort((a, b) => scoreMove(state, b) - scoreMove(state, a));
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
// ---------------------------------------------------------------------------

const CHECKMATE_SCORE = 100_000;

function minimax(
  state: ChessGameState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  noise: number,
): number {
  // Terminal node: checkmate / stalemate / draw
  if (state.isCheckmate) {
    // The side that just moved delivered checkmate.
    // isMaximizing = whose turn it is NOW (i.e. they are mated).
    return isMaximizing ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
  }
  if (state.isStalemate || state.isDraw) return 0;

  // Leaf node
  if (depth === 0) return evaluate(state, noise);

  const moves = orderMoves(state, ChessEngine.getAllLegalMoves(state));

  if (isMaximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const next = ChessEngine.executeMove(state, move.from, move.to, false, 'queen');
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false, noise));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break; // Beta cut-off
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const next = ChessEngine.executeMove(state, move.from, move.to, false, 'queen');
      best = Math.min(best, minimax(next, depth - 1, alpha, beta, true, noise));
      beta = Math.min(beta, best);
      if (beta <= alpha) break; // Alpha cut-off
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WeakEngineMove {
  from: Position;
  to: Position;
  /** If the move is a pawn promotion, which piece to promote to */
  promotion?: PieceType;
}

/**
 * Returns the best move for the current side to move, weakened according to
 * the chosen difficulty.
 *
 * Usage:
 *   const move = getBestMoveWeak(gameState, 'beginner');
 *   // then: ChessEngine.validateMove(gameState, move.from, move.to, false, move.promotion)
 */
export function getBestMoveWeak(
  state: ChessGameState,
  difficulty: Difficulty,
): WeakEngineMove {
  const config = DIFFICULTY_CONFIG[difficulty];
  const color: Color = state.currentTurn;
  const legalMoves = ChessEngine.getAllLegalMoves(state);

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available — game should already be over.');
  }

  // Blunder: play a random legal move
  if (Math.random() < config.blunderChance) {
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return withPromotion(state, move);
  }

  const isMaximizing = color === 'white';
  let bestMove = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  const orderedMoves = orderMoves(state, legalMoves);

  for (const move of orderedMoves) {
    const next = ChessEngine.executeMove(state, move.from, move.to, false, 'queen');
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

  return withPromotion(state, bestMove);
}

// ---------------------------------------------------------------------------
// Continuous ELO-based engine (400 – 1399)
// ---------------------------------------------------------------------------

/**
 * Calibration bands for ELO-based play.
 * Each entry: [eloLo, eloHi, depth, blunderChanceLo, blunderChanceHi, noiseLo, noiseHi]
 *
 * Depth is the main lever for ELO jumps; blunderChance and evalNoise are
 * interpolated linearly within each band for smooth in-band scaling.
 *
 * Calibration rationale:
 *   depth 1 (400–750)   — one-ply look-ahead, frequent hanging pieces     ≈ 400–700 ELO
 *   depth 2 (750–1050)  — two-ply, basic tactics spotted                  ≈ 750–1050 ELO
 *   depth 3 (1050–1280) — three-ply, consistent one-movers caught         ≈ 1050–1280 ELO
 *   depth 4 (1280–1400) — four-ply, most simple tactics handled           ≈ 1280–1399 ELO
 */
const ELO_BANDS: [number, number, number, number, number, number, number][] = [
  //  lo    hi   d  blunderLo  blunderHi  noiseLo  noiseHi
  [  400,  750,  1,   0.70,      0.22,     280,      95  ],
  [  750, 1050,  2,   0.18,      0.05,      90,      38  ],
  [ 1050, 1280,  3,   0.04,      0.01,      32,      12  ],
  [ 1280, 1400,  4,   0.010,     0.004,     10,       4  ],
];

interface EloConfig { depth: number; blunderChance: number; evalNoise: number }

function eloToConfig(elo: number): EloConfig {
  const e = Math.max(400, Math.min(1399, elo));
  for (const [lo, hi, depth, blLo, blHi, nLo, nHi] of ELO_BANDS) {
    if (e >= lo && e < hi) {
      const t = (e - lo) / (hi - lo);
      return {
        depth,
        blunderChance: blLo + t * (blHi - blLo),
        evalNoise:     nLo  + t * (nHi  - nLo),
      };
    }
  }
  // Fallback to depth-4 top end
  return { depth: 4, blunderChance: 0.004, evalNoise: 4 };
}

/**
 * Returns the best move calibrated to `targetElo` (400–1399).
 * For ELO ≥ 1400 use Stockfish with UCI_Elo.
 */
export function getBestMoveElo(
  state: ChessGameState,
  targetElo: number,
): WeakEngineMove {
  const config = eloToConfig(targetElo);
  const color: Color = state.currentTurn;
  const legalMoves = ChessEngine.getAllLegalMoves(state);

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available — game should already be over.');
  }

  if (Math.random() < config.blunderChance) {
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return withPromotion(state, move);
  }

  const isMaximizing = color === 'white';
  let bestMove = legalMoves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const move of orderMoves(state, legalMoves)) {
    const next = ChessEngine.executeMove(state, move.from, move.to, false, 'queen');
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

  return withPromotion(state, bestMove);
}

// ---------------------------------------------------------------------------

/** Detect if a move is a pawn promotion and default to queen. */
function withPromotion(
  state: ChessGameState,
  move: { from: Position; to: Position },
): WeakEngineMove {
  const fromCoords = { row: charToRow(move.from[1]), col: charToCol(move.from[0]) };
  const piece = state.board[fromCoords.row][fromCoords.col];
  const toRow = charToRow(move.to[1]);

  const isPromotion =
    piece?.type === 'pawn' &&
    ((piece.color === 'white' && toRow === 7) ||
     (piece.color === 'black' && toRow === 0));

  return {
    from: move.from,
    to: move.to,
    promotion: isPromotion ? 'queen' : undefined,
  };
}