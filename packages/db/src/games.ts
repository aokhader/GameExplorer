// Game Queries
import { supabase } from './client';
import type { NewGame, SavedGame } from './types';
import type { ChessGameState, Color } from '@gameexplorer/shared';

export async function saveGame(
  gameState: ChessGameState,
  playerColor: Color,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string
): Promise<SavedGame | null> {
  const newGame: NewGame = {
    player_color: playerColor,
    opponent: 'stockfish',
    result,
    difficulty,
    user_id: userId ?? null,
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

export async function getGames(): Promise<SavedGame[]> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch games:', error);
    return [];
  }

  return data as SavedGame[];
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