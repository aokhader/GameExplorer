import { describe, expect, it, vi } from 'vitest';

// Types only at runtime, but the barrel builds a Supabase client on import.
vi.mock('@gameexplorer/db', () => ({}));

import type { GameListItem, UserRating } from '@gameexplorer/db';
import { summarizePlayer } from '../game/playerStats';

let id = 0;
function row(overrides: Partial<GameListItem>): GameListItem {
  id += 1;
  return {
    id: String(id),
    created_at: '2026-09-01T00:00:00Z',
    game_type: 'chess',
    player_color: 'white',
    opponent: 'bot',
    result: 'white',
    user_id: 'u1',
    move_count: 20,
    ...overrides,
  };
}

const rating = (game_type: UserRating['game_type'], value: number, games: number, peak = value): UserRating => ({
  user_id: 'u1',
  game_type,
  rating: value,
  games_played: games,
  wins: 0,
  losses: 0,
  draws: 0,
  peak_rating: peak,
  updated_at: '',
});

describe('summarizePlayer', () => {
  it('has nothing to say about a player with no games', () => {
    const stats = summarizePlayer([], {});
    expect(stats).toMatchObject({ gamesPlayed: 0, winRate: 0, currentStreak: 0, bestStreak: 0, topRating: 0 });
    expect(stats.perGame.go).toMatchObject({ rating: 1200, ratedGames: 0, lastDelta: null });
  });

  it('counts the current streak from the newest game and the best one anywhere', () => {
    // Newest first: W W L W W W L
    const games = [
      row({}),
      row({}),
      row({ result: 'black' }),
      row({}),
      row({}),
      row({}),
      row({ result: 'draw' }),
    ];
    expect(summarizePlayer(games, {})).toMatchObject({
      gamesPlayed: 7,
      wins: 5,
      winRate: 71,
      currentStreak: 2,
      bestStreak: 3,
    });
  });

  it("gives each game its latest rating change, reading untyped rows as chess", () => {
    const games = [
      row({ game_type: 'go', rating_before: 1100, rating_after: 1112 }),
      row({ game_type: undefined, mode: 'casual' }),
      row({ game_type: undefined, rating_before: 1250, rating_after: 1240 }),
      row({ game_type: 'chess', rating_before: 1200, rating_after: 1250 }),
    ];
    const stats = summarizePlayer(games, {
      chess: rating('chess', 1240, 2, 1250),
      go: rating('go', 1112, 1),
    });
    expect(stats.perGame.chess).toMatchObject({ rating: 1240, lastDelta: -10, savedGames: 3, ratedGames: 2 });
    expect(stats.perGame.go.lastDelta).toBe(12);
    expect(stats.perGame.checkers.lastDelta).toBeNull();
  });

  it("does not call an untouched default a top rating", () => {
    // `getUserRatings` returns a 1200 row for every game never played rated.
    const untouched = summarizePlayer([row({})], {
      chess: rating('chess', 1200, 0),
      checkers: rating('checkers', 1200, 0),
    });
    expect(untouched.topRating).toBe(0);

    const played = summarizePlayer([row({})], {
      chess: rating('chess', 1180, 4, 1260),
      checkers: rating('checkers', 1200, 0),
    });
    expect(played.topRating).toBe(1260);
  });
});
