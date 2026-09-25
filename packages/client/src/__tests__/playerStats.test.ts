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
    expect(stats).toMatchObject({ gamesPlayed: 0, winRate: 0, currentStreak: 0, bestStreak: 0, topPracticeLevel: 0 });
    expect(stats.perGame.go.practice).toMatchObject({ rating: 1200, ratedGames: 0, lastDelta: null });
    expect(stats.perGame.chess.online).toMatchObject({ rating: 1200, ratedGames: 0, lastDelta: null });
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
    expect(stats.perGame.chess.savedGames).toBe(3);
    expect(stats.perGame.chess.practice).toMatchObject({ rating: 1240, lastDelta: -10, ratedGames: 2 });
    expect(stats.perGame.go.practice.lastDelta).toBe(12);
    expect(stats.perGame.checkers.practice.lastDelta).toBeNull();
  });

  it('credits each rating change to the ladder its opponent belongs to', () => {
    // Newest first. The newest chess row is an online game; the Practice level's
    // last change must still be the older bot game's, and vice versa.
    const games = [
      row({ opponent: 'rival', rating_before: 1300, rating_after: 1290 }),
      row({ opponent: 'stockfish', rating_before: 1500, rating_after: 1516 }),
      row({ opponent: 'rival', rating_before: 1280, rating_after: 1300 }),
    ];
    const stats = summarizePlayer(
      games,
      { chess: rating('chess', 1516, 12, 1530) },
      { chess: rating('chess', 1290, 2, 1300) },
    );
    expect(stats.perGame.chess.practice).toMatchObject({ rating: 1516, peak: 1530, ratedGames: 12, lastDelta: 16 });
    expect(stats.perGame.chess.online).toMatchObject({ rating: 1290, peak: 1300, ratedGames: 2, lastDelta: -10 });
    // The online peak is never the practice headline.
    expect(stats.topPracticeLevel).toBe(1530);
  });

  it("does not call an untouched default a top practice level", () => {
    // `getPracticeRatings` returns a 1200 row for every game never played rated.
    const untouched = summarizePlayer([row({})], {
      chess: rating('chess', 1200, 0),
      checkers: rating('checkers', 1200, 0),
    });
    expect(untouched.topPracticeLevel).toBe(0);

    const played = summarizePlayer([row({})], {
      chess: rating('chess', 1180, 4, 1260),
      checkers: rating('checkers', 1200, 0),
    });
    expect(played.topPracticeLevel).toBe(1260);
  });
});
