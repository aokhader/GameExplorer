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
 * Fetch a user's ratings for several game types in ONE query (the profile page
 * previously issued three sequential-latency requests, one per game).
 * Game types without a row come back as the default 1200 object.
 */
export async function getUserRatings(
  userId: string,
  gameTypes: GameType[],
): Promise<Record<GameType, UserRating>> {
  const { data, error } = await supabase
    .from('user_ratings')
    .select('*')
    .eq('user_id', userId)
    .in('game_type', gameTypes);

  const rows = (!error && data ? data : []) as UserRating[];
  const result = {} as Record<GameType, UserRating>;
  for (const gt of gameTypes) {
    result[gt] = rows.find(r => r.game_type === gt) ?? defaultRating(userId, gt);
  }
  return result;
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
  // Preferred path: one atomic statement server-side (counters incremented in
  // SQL, so two games finishing at once can't lose an update — and it's one
  // round-trip instead of read-then-write).
  // Function defined in project-docs/sql-queries/supabase-latency-phase-c.sql.
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_game_result', {
    p_user_id:    userId,
    p_game_type:  gameType,
    p_new_rating: newRating,
    p_outcome:    outcome,
  });
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData[0] as UserRating;
  }

  // Fallback for databases where the function hasn't been created yet:
  // fetch current row first so we can increment counters properly.
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
