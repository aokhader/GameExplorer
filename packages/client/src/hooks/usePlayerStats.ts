import { useCallback, useEffect, useState } from 'react';
import { getGames, getPracticeRatings, getUserRatings, type GameListItem } from '@gameexplorer/db';
import { RATED_GAME_TYPES, summarizePlayer, type PlayerStats } from '../game/playerStats';

export interface UsePlayerStatsResult {
  stats: PlayerStats | null;
  /** The rows the stats came from, newest first — Profile lists them. */
  games: GameListItem[];
  loading: boolean;
  /** Set when the last load failed; the previous numbers, if any, stay shown. */
  error: boolean;
  refresh: () => void;
}

/**
 * Load a signed-in player's games, Practice levels and Ratings, and summarize them.
 *
 * A null `userId` loads nothing: a guest has no saved games or ratings, and the
 * surfaces say so rather than showing zeros that look like a record.
 *
 * A failed load is reported, not swallowed. Profile used to keep a spinner or an
 * empty page on a failed read with nothing to say why (`screen-archetypes.md`
 * §5); the launcher shows an inline error with a retry instead.
 */
export function usePlayerStats(userId: string | null): UsePlayerStatsResult {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!userId) {
      setStats(null);
      setGames([]);
      setLoading(false);
      setError(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      getGames(userId),
      getPracticeRatings(userId, [...RATED_GAME_TYPES]),
      getUserRatings(userId, [...RATED_GAME_TYPES]),
    ])
      .then(([rows, practice, online]) => {
        if (!active) return;
        setGames(rows);
        setStats(summarizePlayer(rows, practice, online));
        setError(false);
      })
      .catch((err) => {
        console.error('Failed to load player stats:', err);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, generation]);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  return { stats, games, loading, error, refresh };
}
