import { supabase } from './client';
import { DEFAULT_RATING, type GameOutcome } from '@gameexplorer/shared';
import type { GameType } from './types';

/**
 * Two numbers per player per game, in two tables with the same columns:
 *
 * - **Rating** — `user_ratings`. Earned in rated online games and written only
 *   by the API, with the service-role key. The API reads it to pair players and
 *   to price *both* players' Elo change, so no client may write it: this module
 *   reads it and has no writer for it, on purpose (security audit v2, GX-04).
 * - **Practice level** — `practice_ratings`. Earned against bots and in
 *   training, computed on the device and written through `record_practice_result`,
 *   which only ever touches the caller's own row. Nothing on the server reads
 *   it, so a forged one harms only its owner.
 *
 * Both come back as a `UserRating` row; which table it came from is the name of
 * the function that fetched it.
 */
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

type RatingTable = 'user_ratings' | 'practice_ratings';

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

/**
 * One row, or the 1200 default when the player has none yet.
 *
 * A failed read *rejects* rather than passing for the default. A result is
 * written as an absolute number computed from this one, so a network blip that
 * read as "1200" would overwrite a real 1650 with a number derived from 1200.
 */
async function readRating(table: RatingTable, userId: string, gameType: GameType): Promise<UserRating> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('game_type', gameType)
    .maybeSingle();

  if (error) throw error;
  return (data as UserRating | null) ?? defaultRating(userId, gameType);
}

/** Several game types in one query. Types without a row come back as the default. */
async function readRatings(
  table: RatingTable,
  userId: string,
  gameTypes: GameType[],
): Promise<Record<GameType, UserRating>> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .in('game_type', gameTypes);

  if (error) throw error;
  const rows = (data ?? []) as UserRating[];
  const result = {} as Record<GameType, UserRating>;
  for (const gt of gameTypes) {
    result[gt] = rows.find(r => r.game_type === gt) ?? defaultRating(userId, gt);
  }
  return result;
}

/** A player's online Rating for one game. Read-only — the API writes it. */
export function getUserRating(userId: string, gameType: GameType = 'chess'): Promise<UserRating> {
  return readRating('user_ratings', userId, gameType);
}

/** A player's online Ratings for several games, in one query. */
export function getUserRatings(userId: string, gameTypes: GameType[]): Promise<Record<GameType, UserRating>> {
  return readRatings('user_ratings', userId, gameTypes);
}

/** A player's Practice level for one game — what bot and training games move. */
export function getPracticeRating(userId: string, gameType: GameType): Promise<UserRating> {
  return readRating('practice_ratings', userId, gameType);
}

/** A player's Practice levels for several games, in one query. */
export function getPracticeRatings(userId: string, gameTypes: GameType[]): Promise<Record<GameType, UserRating>> {
  return readRatings('practice_ratings', userId, gameTypes);
}

/**
 * Record a finished bot or training game: sets the signed-in player's Practice
 * level to `newRating` and bumps their record, in one atomic statement.
 *
 * There is no user id parameter because the database takes it from the session
 * — a call can only ever move the caller's own row. Rejects on any failure,
 * including a signed-out session, so the caller can surface a retry. There is
 * deliberately no fallback to a direct table write: clients have no write grant
 * on either table, and a silent fallback is how a failed save used to look like
 * a successful one.
 */
export async function recordPracticeResult(
  newRating: number,
  outcome: GameOutcome,
  gameType: GameType,
): Promise<UserRating> {
  const { data, error } = await supabase.rpc('record_practice_result', {
    p_game_type:  gameType,
    p_new_rating: newRating,
    p_outcome:    outcome,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as UserRating | null | undefined;
  if (!row) throw new Error('record_practice_result returned no row');
  return row;
}
