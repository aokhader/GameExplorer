import type { Move, Color, EndReason } from '@gameexplorer/shared';

// What we store per chess move
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

// What we store per checkers move
export interface CheckersStoredMove {
  from: string;
  to: string;
  path: string[];
  captures: string[];
  isKingPromotion?: boolean;
}

// What we store per reversi move
export interface ReversiStoredMove {
  position: string | null; // null = pass
  flipped: string[];
  color: 'black' | 'white';
}

export type GameResult = 'white' | 'black' | 'draw';
export type GameType = 'chess' | 'checkers' | 'reversi';

export interface SavedGame {
  id: string;
  created_at: string;
  game_type?: GameType;
  player_color: Color;
  opponent: string;
  result: GameResult;
  // Chess games: StoredMove[]. Checkers games: CheckersStoredMove[] stored as JSONB.
  // Use game_type to discriminate at the call site.
  moves: StoredMove[];
  difficulty?: string;
  user_id: string | null;
  mode?: 'casual' | 'rated';
  rating_before?: number;
  rating_after?: number;
  // How the game ended. Set for multiplayer games; NULL for legacy/bot rows.
  end_reason?: EndReason;
}

// What we send to Supabase on insert (no id/created_at, those are auto-generated)
export type NewGame = Omit<SavedGame, 'id' | 'created_at'>;