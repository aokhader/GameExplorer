// Server-authoritative persistence of multiplayer results to Supabase.
//
// Writes the same `user_ratings` and `games` rows the web client writes for
// bot/training games (packages/db), but with the service-role key so results
// are recorded for BOTH players regardless of whether their browsers are
// still open when the game ends.
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';
import { LIMITS } from '@finesse/shared';
import type { GameType, GameResult, GameOutcome, EndReason } from '@finesse/shared';
import type { GameSession } from './gameSession.service';

const DEFAULT_RATING  = 1200;

interface RatingRow {
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

function outcomeFor(result: GameResult, color: 'white' | 'black'): GameOutcome {
  if (result === 'draw') return 'draw';
  return (result === 'white_wins') === (color === 'white') ? 'win' : 'loss';
}

/** Serialise moveHistory the same way packages/db does, per game type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMoves(gameType: GameType, state: any): unknown[] {
  const history: any[] = state?.moveHistory ?? [];
  if (gameType === 'chess') {
    return history.map(m => ({
      from: m.from, to: m.to, piece: m.piece, capturedPiece: m.capturedPiece,
      isCastling: m.isCastling, castlingSide: m.castlingSide,
      promotion: m.promotion, isCheck: m.isCheck, isCheckmate: m.isCheckmate,
    }));
  }
  if (gameType === 'checkers') {
    return history.map(m => ({
      from: m.from, to: m.to, path: m.path, captures: m.captures,
      isKingPromotion: m.isKingPromotion,
    }));
  }
  return history.map(m => ({ position: m.position, flipped: m.flipped, color: m.color }));
}

/** Oldest-first prune beyond LIMITS.GAMES_PER_TYPE per game type — mirrors packages/db, never throws. */
async function pruneOldGames(userId: string, gameType: GameType): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data, error } = await supabaseAdmin
      .from('games')
      .select('id')
      .eq('user_id', userId)
      .eq('game_type', gameType)
      .order('created_at', { ascending: true });
    if (error || !data || data.length <= LIMITS.GAMES_PER_TYPE) return;
    const toDelete = data.slice(0, data.length - LIMITS.GAMES_PER_TYPE).map((g: { id: string }) => g.id);
    await supabaseAdmin.from('games').delete().in('id', toDelete);
  } catch {
    // Non-critical — never let pruning break the persist flow
  }
}

export const persistenceService = {
  /** Current rating for matchmaking/scoring — server-side, never client-supplied. */
  async getRating(userId: string, gameType: GameType): Promise<number> {
    if (!supabaseAdmin) return DEFAULT_RATING;
    try {
      const { data } = await supabaseAdmin
        .from('user_ratings')
        .select('rating')
        .eq('user_id', userId)
        .eq('game_type', gameType)
        .single();
      return data?.rating ?? DEFAULT_RATING;
    } catch {
      return DEFAULT_RATING;
    }
  },

  /**
   * Authoritative display name for a user, from the profiles table. Used so the
   * name shown to opponents/spectators can't be spoofed via a client payload.
   * Returns null when unavailable (falls back to the client-supplied name).
   */
  async getUsername(userId: string): Promise<string | null> {
    if (!supabaseAdmin) return null;
    try {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();
      return (data as { username?: string } | null)?.username ?? null;
    } catch {
      return null;
    }
  },

  /** Games played in a game type — drives the ELO K-factor. Server-side only. */
  async getGamesPlayed(userId: string, gameType: GameType): Promise<number> {
    if (!supabaseAdmin) return 0;
    try {
      const { data } = await supabaseAdmin
        .from('user_ratings')
        .select('games_played')
        .eq('user_id', userId)
        .eq('game_type', gameType)
        .single();
      return (data as { games_played?: number } | null)?.games_played ?? 0;
    } catch {
      return 0;
    }
  },

  async upsertRating(
    userId: string,
    gameType: GameType,
    newRating: number,
    outcome: GameOutcome,
  ): Promise<void> {
    if (!supabaseAdmin) return;
    const { data } = await supabaseAdmin
      .from('user_ratings')
      .select('*')
      .eq('user_id', userId)
      .eq('game_type', gameType)
      .single();

    const current: RatingRow = (data as RatingRow | null) ?? {
      user_id: userId, game_type: gameType, rating: DEFAULT_RATING,
      games_played: 0, wins: 0, losses: 0, draws: 0,
      peak_rating: DEFAULT_RATING, updated_at: new Date().toISOString(),
    };

    const updated: RatingRow = {
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

    const { error } = await supabaseAdmin
      .from('user_ratings')
      .upsert(updated, { onConflict: 'user_id,game_type' });
    if (error) logger.error(`Failed to upsert rating for ${userId}/${gameType}:`, error);
  },

  /**
   * Persists a finished multiplayer game for both players: rating upserts
   * (rated games only) and one `games` row per player. Called from
   * gameSessionService.endGame before Redis state is torn down.
   */
  async persistGameResult(opts: {
    session: GameSession;
    result: GameResult;
    reason: EndReason;
    rated: boolean;
    white: { ratingBefore: number; ratingAfter: number };
    black: { ratingBefore: number; ratingAfter: number };
  }): Promise<void> {
    if (!supabaseAdmin) return;
    const { session, result, reason, rated, white, black } = opts;

    let state: unknown = null;
    try { state = JSON.parse(session.state); } catch { /* keep null */ }
    const moves = serializeMoves(session.gameType, state);
    const winnerColor: 'white' | 'black' | 'draw' =
      result === 'white_wins' ? 'white' : result === 'black_wins' ? 'black' : 'draw';

    const players = [
      { id: session.whiteId, color: 'white' as const, opponent: session.blackUsername, ratings: white },
      { id: session.blackId, color: 'black' as const, opponent: session.whiteUsername, ratings: black },
    ];

    if (rated) {
      await Promise.all(players.map(p =>
        this.upsertRating(p.id, session.gameType, p.ratings.ratingAfter, outcomeFor(result, p.color)),
      ));
    }

    const rows = players.map(p => ({
      game_type: session.gameType,
      player_color: p.color,
      opponent: p.opponent,
      result: winnerColor,
      end_reason: reason,
      user_id: p.id,
      mode: rated ? 'rated' : 'casual',
      ...(rated ? { rating_before: p.ratings.ratingBefore, rating_after: p.ratings.ratingAfter } : {}),
      moves,
    }));

    const { error } = await supabaseAdmin.from('games').insert(rows);
    if (error) {
      logger.error('Failed to save multiplayer game records:', error);
      return;
    }

    await Promise.all(players.map(p => pruneOldGames(p.id, session.gameType)));
  },
};
