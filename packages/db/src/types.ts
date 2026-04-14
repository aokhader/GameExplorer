import type { Move, Color } from '@gameexplorer/shared';

// What we store per move — Move from shared + FEN snapshot after the move
export interface StoredMove {
  from: string;
  to: string;
  piece: Move['piece'];
  capturedPiece?: Move['capturedPiece'];
  isCastling?: boolean;
  castlingSide?: Move['castlingSide'];
  promotion?: Move['promotion'];
  isCheck?: boolean;
  isCheckmate?: boolean;
}

export type GameResult = 'white' | 'black' | 'draw';

export interface SavedGame {
  id: string;
  created_at: string;
  player_color: Color;
  opponent: string;
  result: GameResult;
  moves: StoredMove[];
  difficulty?: string;
  user_id: string | null;
}

// What we send to Supabase on insert (no id/created_at, those are auto-generated)
export type NewGame = Omit<SavedGame, 'id' | 'created_at'>;