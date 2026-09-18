/**
 * A player's numbers, from their saved games and rating rows.
 *
 * Web's Profile and native's You tab each computed these inline — win rate, the
 * two streaks, top rating, each game's last rating change — as near-identical
 * copies. The launcher needs the same numbers, and a third copy is how a streak
 * comes to mean one thing on Home and another on Profile. So the arithmetic
 * lives here and every surface reads it (`project-docs/ux-fix-ideas.md` §4.3).
 *
 * Pure: the fetching is `hooks/usePlayerStats.ts`.
 */

import type { GameListItem, GameType, UserRating } from '@gameexplorer/db';

/** The rated games, in the order every surface lists them. */
export const RATED_GAME_TYPES: readonly GameType[] = ['chess', 'checkers', 'reversi', 'go'];

export interface GameTypeStats {
  type: GameType;
  rating: number;
  peak: number;
  /** Rated games counted on the rating row. Zero means the rating is the untouched default. */
  ratedGames: number;
  /** Saved games of this type, rated or not. */
  savedGames: number;
  /** The change from the most recent rated game of this type, if there was one. */
  lastDelta: number | null;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  /** Whole percent; 0 with no games. */
  winRate: number;
  /** Consecutive wins ending with the most recent game. */
  currentStreak: number;
  bestStreak: number;
  /** Highest peak across the rated games, or 0 when none has been played. */
  topRating: number;
  perGame: Record<GameType, GameTypeStats>;
}

/** A row's own rating change, or null for a casual or pre-rating row. */
export function ratingDelta(game: Pick<GameListItem, 'rating_before' | 'rating_after'>): number | null {
  if (game.rating_before == null || game.rating_after == null) return null;
  return game.rating_after - game.rating_before;
}

/** Rows written before `game_type` existed are chess — the only game there was. */
export function gameTypeOf(game: Pick<GameListItem, 'game_type'>): GameType {
  return game.game_type ?? 'chess';
}

const isWin = (g: Pick<GameListItem, 'result' | 'player_color'>) => g.result === g.player_color;

/**
 * @param games Newest first, as `getGames` returns them.
 * @param ratings Missing entries count as unplayed.
 */
export function summarizePlayer(
  games: readonly GameListItem[],
  ratings: Partial<Record<GameType, UserRating>>,
): PlayerStats {
  const wins = games.filter(isWin).length;

  let currentStreak = 0;
  for (const g of games) {
    if (isWin(g)) currentStreak++;
    else break;
  }
  // A run of consecutive wins is the same set scanned in either direction, so
  // the best streak works on the newest-first array as it is.
  let bestStreak = 0;
  let run = 0;
  for (const g of games) {
    run = isWin(g) ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const perGame = {} as Record<GameType, GameTypeStats>;
  for (const type of RATED_GAME_TYPES) {
    const row = ratings[type];
    const ofType = games.filter((g) => gameTypeOf(g) === type);
    const lastRated = ofType.find((g) => ratingDelta(g) !== null);
    perGame[type] = {
      type,
      rating: row?.rating ?? 1200,
      peak: row?.peak_rating ?? 0,
      ratedGames: row?.games_played ?? 0,
      savedGames: ofType.length,
      lastDelta: lastRated ? ratingDelta(lastRated) : null,
    };
  }

  const topRating = Math.max(
    0,
    ...RATED_GAME_TYPES.map((t) => (perGame[t].ratedGames > 0 ? perGame[t].peak : 0)),
  );

  return {
    gamesPlayed: games.length,
    wins,
    winRate: games.length > 0 ? Math.round((wins / games.length) * 100) : 0,
    currentStreak,
    bestStreak,
    topRating,
    perGame,
  };
}
