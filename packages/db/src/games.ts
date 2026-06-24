// Game Queries
import { supabase } from './client';
import type { NewGame, SavedGame } from './types';
import type { ChessGameState, Color, CheckersGameState, CheckersColor, ReversiGameState, ReversiColor } from '@gameexplorer/shared';

export interface SaveGameOptions {
  mode?: 'casual' | 'rated';
  rating_before?: number;
  rating_after?: number;
}

const MAX_STORED_GAMES = 80;

/**
 * Deletes the oldest games for a user when they exceed MAX_STORED_GAMES.
 * Called automatically after every save — fire-and-forget, never throws.
 */
async function pruneOldGames(userId: string): Promise<void> {
  try {
    // Fetch all game IDs ordered oldest first
    const { data, error } = await supabase
      .from('games')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data || data.length <= MAX_STORED_GAMES) return;

    const toDelete = data.slice(0, data.length - MAX_STORED_GAMES).map((g: { id: string }) => g.id);
    await supabase.from('games').delete().in('id', toDelete);
  } catch {
    // Non-critical — never let pruning break the save flow
  }
}

export async function saveGame(
  gameState: ChessGameState,
  playerColor: Color,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  const newGame: NewGame = {
    game_type: 'chess',
    player_color: playerColor,
    opponent: 'stockfish',
    result,
    difficulty,
    user_id: userId ?? null,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    moves: gameState.moveHistory.map(m => ({
      from: m.from,
      to: m.to,
      piece: m.piece,
      capturedPiece: m.capturedPiece,
      isCastling: m.isCastling,
      castlingSide: m.castlingSide,
      promotion: m.promotion,
      isCheck: m.isCheck,
      isCheckmate: m.isCheckmate,
    })),
  };

  const { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  if (error) {
    console.error('Failed to save game:', error);
    return null;
  }

  if (userId) pruneOldGames(userId);
  return data as SavedGame;
}

export async function getGames(userId?: string): Promise<SavedGame[]> {
  let query = supabase.from('games').select('*').order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch games:', error);
    return [];
  }

  return data as SavedGame[];
}

export async function saveCheckersGame(
  gameState: CheckersGameState,
  playerColor: CheckersColor,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  const newGame: NewGame = {
    game_type: 'checkers',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId ?? null,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moves: gameState.moveHistory.map(m => ({
      from: m.from,
      to: m.to,
      path: m.path,
      captures: m.captures,
      isKingPromotion: m.isKingPromotion,
    })) as any,
  };

  const { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  if (error) {
    console.error('Failed to save checkers game:', error);
    return null;
  }

  if (userId) pruneOldGames(userId);
  return data as SavedGame;
}

export async function saveReversiGame(
  gameState: ReversiGameState,
  playerColor: ReversiColor,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  const newGame: NewGame = {
    game_type: 'reversi',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId ?? null,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moves: gameState.moveHistory.map(m => ({
      position: m.position,
      flipped:  m.flipped,
      color:    m.color,
    })) as any,
  };

  const { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  if (error) {
    console.error('Failed to save reversi game:', error);
    return null;
  }

  if (userId) pruneOldGames(userId);
  return data as SavedGame;
}

export async function getGameById(id: string): Promise<SavedGame | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch game:', error);
    return null;
  }

  return data as SavedGame;
}