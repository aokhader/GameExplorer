/**
 * A player's numbers, from their saved games and their two rating rows per game:
 * the **Practice level** (bots and rated practice) and the online **Rating**.
 * They are separate ladders (security audit v2, GX-04 — see `RATING_COPY`), so
 * each row's rating change is credited to the ladder its opponent belongs to.
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
import { DEFAULT_RATING } from '@gameexplorer/shared';
import { isBotOpponent } from './gameHistory';

/** The rated games, in the order every surface lists them. */
export const RATED_GAME_TYPES: readonly GameType[] = ['chess', 'checkers', 'reversi', 'go'];

/** One ladder's numbers for one game. */
export interface LadderStats {
  rating: number;
  peak: number;
  /** Games counted on the row. Zero means the number is the untouched default. */
  ratedGames: number;
  /** The change from the most recent saved game on this ladder, if there was one. */
  lastDelta: number | null;
}

export interface GameTypeStats {
  type: GameType;
  /** Practice level — rated bot and practice games. */
  practice: LadderStats;
  /** Rating — rated online games. Go has no online mode, so it stays untouched there. */
  online: LadderStats;
  /** Saved games of this type, rated or not, bot or online. */
  savedGames: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  /** Whole percent; 0 with no games. */
  winRate: number;
  /** Consecutive wins ending with the most recent game. */
  currentStreak: number;
  bestStreak: number;
  /** Highest Practice level peak across the games, or 0 when none has moved. */
  topPracticeLevel: number;
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

type RatingRows = Partial<Record<GameType, UserRating>>;

function ladder(row: UserRating | undefined, rows: readonly GameListItem[]): LadderStats {
  const last = rows.find((g) => ratingDelta(g) !== null);
  return {
    rating: row?.rating ?? DEFAULT_RATING,
    peak: row?.peak_rating ?? 0,
    ratedGames: row?.games_played ?? 0,
    lastDelta: last ? ratingDelta(last) : null,
  };
}

/**
 * @param games Newest first, as `getGames` returns them.
 * @param practice Practice level rows (`getPracticeRatings`). Missing entries count as unplayed.
 * @param online Rating rows (`getUserRatings`). Missing entries count as unplayed.
 */
export function summarizePlayer(
  games: readonly GameListItem[],
  practice: RatingRows,
  online: RatingRows = {},
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
    const ofType = games.filter((g) => gameTypeOf(g) === type);
    perGame[type] = {
      type,
      practice: ladder(practice[type], ofType.filter((g) => isBotOpponent(g.opponent))),
      online: ladder(online[type], ofType.filter((g) => !isBotOpponent(g.opponent))),
      savedGames: ofType.length,
    };
  }

  const topPracticeLevel = Math.max(
    0,
    ...RATED_GAME_TYPES.map((t) => (perGame[t].practice.ratedGames > 0 ? perGame[t].practice.peak : 0)),
  );

  return {
    gamesPlayed: games.length,
    wins,
    winRate: games.length > 0 ? Math.round((wins / games.length) * 100) : 0,
    currentStreak,
    bestStreak,
    topPracticeLevel,
    perGame,
  };
}
