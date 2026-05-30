// Game Queries
import { supabase } from './client';
import type { NewGame, SavedGame } from './types';
import type { ChessGameState, Color, CheckersGameState, CheckersColor, ReversiGameState, ReversiColor } from '@gameexplorer/shared';

export interface SaveGameOptions {
  mode?: 'casual' | 'rated';
  rating_before?: number;
  rating_after?: number;
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
): Promise<SavedGame | null> {
  const newGame: NewGame = {
    game_type: 'checkers',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId ?? null,
    mode: 'casual',
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

  return data as SavedGame;
}

export async function saveReversiGame(
  gameState: ReversiGameState,
  playerColor: ReversiColor,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
): Promise<SavedGame | null> {
  const newGame: NewGame = {
    game_type: 'reversi',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId ?? null,
    mode: 'casual',
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