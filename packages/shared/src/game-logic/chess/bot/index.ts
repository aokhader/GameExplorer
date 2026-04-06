// Public API for chess bot

export { ChessBot, DIFFICULTY_PRESETS } from './minimax';
export type { BotConfig } from './minimax';
export { evaluatePosition } from './evaluation';

// Re-export for convenience
import { ChessBot, DIFFICULTY_PRESETS } from './minimax';
import type { ChessGameState } from '../../../types/chess.types';

/**
 * Convenience function to get bot move
 * @param gameState Current game state
 * @param difficulty Bot difficulty ('easy', 'medium', or 'hard')
 * @returns Best move or null if no legal moves
 */
export function getBotMove(
  gameState: ChessGameState,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
) {
  const bot = new ChessBot(difficulty);
  return bot.getBestMove(gameState);
}