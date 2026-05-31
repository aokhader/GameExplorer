import { supabase } from './client';
import type { GameOutcome } from '@gameexplorer/shared';
import type { GameType } from './types';

export interface UserRating {
  user_id: string;
  game_type: GameType;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  peak_rating: number;
  updated_at: string;
}

const DEFAULT_RATING = 1200;

function defaultRating(userId: string, gameType: GameType): UserRating {
  return {
    user_id: userId,
    game_type: gameType,
    rating: DEFAULT_RATING,
    games_played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    peak_rating: DEFAULT_RATING,
    updated_at: new Date().toISOString(),
  };
}

/** Fetch a user's rating row for a specific game type. Returns a default 1200 object if no row exists yet. */
export async function getUserRating(userId: string, gameType: GameType = 'chess'): Promise<UserRating> {
  const { data, error } = await supabase
    .from('user_ratings')
    .select('*')
    .eq('user_id', userId)
    .eq('game_type', gameType)
    .single();

  if (error || !data) return defaultRating(userId, gameType);
  return data as UserRating;
}

/**
 * Upsert a user's rating after a completed game.
 * Increments the appropriate win/loss/draw counter and updates peak_rating.
 * Returns the updated row.
 */
export async function upsertUserRating(
  userId: string,
  newRating: number,
  outcome: GameOutcome,
  gameType: GameType = 'chess',
): Promise<UserRating> {
  // Fetch current row first so we can increment counters properly
  const current = await getUserRating(userId, gameType);

  const updated: UserRating = {
    user_id: userId,
    game_type: gameType,
    rating: newRating,
    games_played: current.games_played + 1,
    wins: current.wins + (outcome === 'win' ? 1 : 0),
    losses: current.losses + (outcome === 'loss' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
    peak_rating: Math.max(current.peak_rating, newRating),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_ratings')
    .upsert(updated, { onConflict: 'user_id,game_type' })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to upsert user rating:', error);
    return updated; // return the computed value even if DB write failed
  }

  return data as UserRating;
}
