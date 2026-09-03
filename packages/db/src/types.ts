import type { Move, Color, EndReason } from '@finesse/shared';

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

// What we store per go move
export interface GoStoredMove {
  position: string | null; // null = pass
  color: 'black' | 'white';
  /** Stones this move removed from the board. */
  captures: string[];
}

export type GameResult = 'white' | 'black' | 'draw';
/**
 * NOTE: deliberately wider than the multiplayer `GameType` in
 * `@finesse/shared/types/socket.types` — Go is saved and rated locally but
 * has no online mode, so the socket protocol must not accept it.
 */
export type GameType = 'chess' | 'checkers' | 'reversi' | 'go';

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

// List-view shape returned by getGames: everything except the heavy `moves`
// JSONB, plus a server-computed move count (generated column; see
// project-docs/sql-queries/supabase-latency-phase-c.sql). Full moves come from
// getGameById when a single game is actually replayed.
export type GameListItem = Omit<SavedGame, 'moves'> & { move_count: number };