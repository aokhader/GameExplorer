'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublicProfile, getGames, getUserRating, supabase } from '@gameexplorer/db';
import type { AuthUser, Profile, SavedGame, UserRating } from '@gameexplorer/db';
import { useRouter } from 'next/navigation';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function ResultBadge({ game, userId }: { game: SavedGame; userId: string }) {
  const playerWon = game.result === game.player_color;
  const isDraw = game.result === 'draw';
  const label = isDraw ? 'Draw' : playerWon ? 'Win' : 'Loss';
  const colors = isDraw
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
    : playerWon
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm text-center">
      <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Pick<Profile, 'id' | 'username' | 'created_at'> | null>(null);
  const [games, setGames] = useState<SavedGame[]>([]);
  const [rating, setRating] = useState<UserRating | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/auth/signin');
          return;
        }
        setUser({ id: user.id, email: user.email! });

        const [profileData, gamesData, ratingData] = await Promise.all([
          getPublicProfile(user.id),
          getGames(user.id),
          getUserRating(user.id),
        ]);

        setProfile(profileData);
        setGames(gamesData);
        setRating(ratingData);
        setLoading(false);
    }

    loadUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-slate-400 dark:text-slate-500">Loading profile...</div>
      </div>
    );
  }

  if (!user || !profile) {
    return null; // redirect is in flight
  }

  const wins = games.filter(g => g.result === g.player_color).length;
  const losses = games.filter(g => g.result !== g.player_color && g.result !== 'draw').length;
  const draws = games.filter(g => g.result === 'draw').length;
  const winRate = games.length > 0 ? Math.round((wins / games.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 pt-16">
      <div className="container mx-auto px-4 pt-8 pb-8 max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors text-sm mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Home
        </Link>
        {/* Avatar + username */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {profile.username[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {profile.username}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Member since {formatDate(profile.created_at)}
            </p>
          </div>
        </div>

        {/* Training rating */}
        {rating && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-5 mb-6 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Training Rating
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-slate-800 dark:text-slate-100">
                  {rating.rating}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Peak: {rating.peak_rating}
                </span>
              </div>
            </div>
            <div className="text-right text-sm text-slate-500 dark:text-slate-400 space-y-0.5">
              <div>{rating.games_played} rated game{rating.games_played !== 1 ? 's' : ''}</div>
              <div>{rating.wins}W / {rating.losses}L / {rating.draws}D</div>
              {rating.games_played < 30 && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  Provisional ({30 - rating.games_played} left)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <StatCard label="Games" value={games.length} />
          <StatCard label="Wins" value={wins} />
          <StatCard label="Losses" value={losses} />
          <StatCard label="Win rate" value={`${winRate}%`} />
        </div>

        {/* Game history */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Recent games</h2>
            <Link
              href="/chess/replays"
              className="text-xs text-blue-500 hover:underline"
            >
              View all
            </Link>
          </div>

          {games.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2">♟</div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">No games played yet</p>
              <Link
                href="/chess/bot"
                className="mt-3 inline-block text-blue-500 hover:underline text-sm"
              >
                Play your first game
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {games.slice(0, 10).map((game) => (
                <Link
                  key={game.id}
                  href={`/chess/replays/${game.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${
                    game.player_color === 'white'
                      ? 'bg-slate-100 dark:bg-slate-700'
                      : 'bg-slate-800 dark:bg-slate-900'
                  }`}>
                    {game.player_color === 'white' ? '♔' : '♚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">
                      vs {game.opponent}
                      <span className="text-slate-400 dark:text-slate-500 font-normal ml-1.5 text-xs capitalize">
                        · {game.difficulty}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {formatDate(game.created_at)} · {game.moves.length} moves
                    </div>
                  </div>
                  <ResultBadge game={game} userId={user.id} />
                  <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}