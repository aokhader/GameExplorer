// Minimax algorithm with alpha-beta pruning for chess AI

import type { ChessGameState, Position, Move } from '../../../types/chess.types';
import { ChessEngine } from '../engine';
import { evaluatePosition } from './evaluation';

/**
 * Bot difficulty settings
 */
export interface BotConfig {
  depth: number;           // How many moves ahead to look
  timeLimit?: number;      // Max time in milliseconds (optional)
  randomness?: number;     // 0-1, adds variety to moves (0 = deterministic)
}

/**
 * Difficulty presets
 */
export const DIFFICULTY_PRESETS: Record<string, BotConfig> = {
  easy: {
    depth: 1,
    randomness: 0.3,
  },
  medium: {
    depth: 3,
    randomness: 0.1,
  },
  hard: {
    depth: 5,
    randomness: 0,
    timeLimit: 5000, // 5 seconds max
  },
};

/**
 * Result of minimax search
 */
interface MinimaxResult {
  score: number;
  bestMove: { from: Position; to: Position } | null;
  nodesSearched: number;
  depth: number;
}

/**
 * Chess Bot using Minimax with Alpha-Beta Pruning
 */
export class ChessBot {
  private config: BotConfig;
  private nodesSearched: number = 0;
  private startTime: number = 0;
  private timeLimit: number = Infinity;

  constructor(difficulty: 'easy' | 'medium' | 'hard' | BotConfig) {
    if (typeof difficulty === 'string') {
      this.config = DIFFICULTY_PRESETS[difficulty];
    } else {
      this.config = difficulty;
    }
  }

  /**
   * Get the best move for the current position
   */
  getBestMove(gameState: ChessGameState): { from: Position; to: Position } | null {
    this.nodesSearched = 0;
    this.startTime = Date.now();
    this.timeLimit = this.config.timeLimit || Infinity;

    const isMaximizing = gameState.currentTurn === 'white';
    const result = this.minimax(
      gameState,
      this.config.depth,
      -Infinity,
      Infinity,
      isMaximizing
    );

    // Add randomness if configured
    if (this.config.randomness && this.config.randomness > 0) {
      return this.addRandomness(gameState, result.bestMove);
    }

    console.log(`Bot searched ${this.nodesSearched} positions in ${Date.now() - this.startTime}ms`);
    
    return result.bestMove;
  }

  /**
   * Minimax algorithm with alpha-beta pruning
   * 
   * @param gameState Current game state
   * @param depth Remaining depth to search
   * @param alpha Best score for maximizing player
   * @param beta Best score for minimizing player
   * @param isMaximizing True if maximizing (white), false if minimizing (black)
   */
  private minimax(
    gameState: ChessGameState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): MinimaxResult {
    this.nodesSearched++;

    // Check time limit
    if (Date.now() - this.startTime > this.timeLimit) {
      return {
        score: evaluatePosition(gameState),
        bestMove: null,
        nodesSearched: this.nodesSearched,
        depth: 0,
      };
    }

    // Base case: reached max depth or game over
    if (depth === 0 || gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) {
      return {
        score: evaluatePosition(gameState),
        bestMove: null,
        nodesSearched: this.nodesSearched,
        depth: 0,
      };
    }

    const legalMoves = ChessEngine.getAllLegalMoves(gameState);

    // No legal moves (shouldn't happen if game state is correct)
    if (legalMoves.length === 0) {
      return {
        score: evaluatePosition(gameState),
        bestMove: null,
        nodesSearched: this.nodesSearched,
        depth: 0,
      };
    }

    // Order moves for better alpha-beta pruning
    const orderedMoves = this.orderMoves(gameState, legalMoves);

    let bestMove: { from: Position; to: Position } | null = null;

    if (isMaximizing) {
      // Maximizing player (White)
      let maxScore = -Infinity;

      for (const move of orderedMoves) {
        const result = ChessEngine.validateMove(gameState, move.from, move.to);
        
        if (!result.valid || !result.resultingState) continue;

        const evalResult = this.minimax(
          result.resultingState,
          depth - 1,
          alpha,
          beta,
          false
        );

        if (evalResult.score > maxScore) {
          maxScore = evalResult.score;
          bestMove = move;
        }

        alpha = Math.max(alpha, evalResult.score);

        // Beta cutoff (pruning)
        if (beta <= alpha) {
          break;
        }
      }

      return {
        score: maxScore,
        bestMove,
        nodesSearched: this.nodesSearched,
        depth,
      };
    } else {
      // Minimizing player (Black)
      let minScore = Infinity;

      for (const move of orderedMoves) {
        const result = ChessEngine.validateMove(gameState, move.from, move.to);
        
        if (!result.valid || !result.resultingState) continue;

        const evalResult = this.minimax(
          result.resultingState,
          depth - 1,
          alpha,
          beta,
          true
        );

        if (evalResult.score < minScore) {
          minScore = evalResult.score;
          bestMove = move;
        }

        beta = Math.min(beta, evalResult.score);

        // Alpha cutoff (pruning)
        if (beta <= alpha) {
          break;
        }
      }

      return {
        score: minScore,
        bestMove,
        nodesSearched: this.nodesSearched,
        depth,
      };
    }
  }

  /**
   * Order moves to improve alpha-beta pruning efficiency
   * Better moves first = more cutoffs = faster search
   */
  private orderMoves(
    gameState: ChessGameState,
    moves: { from: Position; to: Position }[]
  ): { from: Position; to: Position }[] {
    // Simple move ordering heuristics:
    // 1. Captures first (higher value pieces first)
    // 2. Center control
    // 3. Other moves

    const scoredMoves = moves.map(move => {
      let score = 0;
      
      const result = ChessEngine.validateMove(gameState, move.from, move.to, true);
      if (!result.valid || !result.resultingState) return { move, score: -Infinity };

      // Prioritize captures
      const lastMove = result.resultingState.moveHistory[result.resultingState.moveHistory.length - 1];
      if (lastMove?.capturedPiece) {
        const pieceValues: Record<string, number> = {
          pawn: 10,
          knight: 30,
          bishop: 30,
          rook: 50,
          queen: 90,
          king: 0,
        };
        score += pieceValues[lastMove.capturedPiece.type] || 0;
      }

      // Prioritize center squares (e4, d4, e5, d5)
      const centerSquares = ['e4', 'd4', 'e5', 'd5'];
      if (centerSquares.includes(move.to)) {
        score += 5;
      }

      // Prioritize checks
      if (result.resultingState.isCheck) {
        score += 20;
      }

      return { move, score };
    });

    // Sort by score (highest first)
    scoredMoves.sort((a, b) => b.score - a.score);

    return scoredMoves.map(sm => sm.move);
  }

  /**
   * Add randomness to move selection for lower difficulties
   */
  private addRandomness(
    gameState: ChessGameState,
    bestMove: { from: Position; to: Position } | null
  ): { from: Position; to: Position } | null {
    if (!bestMove) return null;

    const randomChance = this.config.randomness || 0;
    
    // Sometimes pick a random legal move instead of best move
    if (Math.random() < randomChance) {
      const legalMoves = ChessEngine.getAllLegalMoves(gameState);
      if (legalMoves.length > 0) {
        const randomIndex = Math.floor(Math.random() * legalMoves.length);
        return legalMoves[randomIndex];
      }
    }

    return bestMove;
  }

  /**
   * Get statistics about the last search
   */
  getStats() {
    return {
      nodesSearched: this.nodesSearched,
      timeElapsed: Date.now() - this.startTime,
      nodesPerSecond: Math.round(this.nodesSearched / ((Date.now() - this.startTime) / 1000)),
    };
  }
}