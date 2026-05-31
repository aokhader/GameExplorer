'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublicProfile, getGames, getUserRating, supabase } from '@gameexplorer/db';
import type { AuthUser, Profile, SavedGame, UserRating, GameType } from '@gameexplorer/db';
import { useRouter } from 'next/navigation';

type Tab = 'all' | GameType;

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
  const [chessRating, setChessRating] = useState<UserRating | null>(null);
  const [checkersRating, setCheckersRating] = useState<UserRating | null>(null);
  const [reversiRating, setReversiRating] = useState<UserRating | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/auth/signin');
          return;
        }
        setUser({ id: user.id, email: user.email! });

        const [profileData, gamesData, chessRatingData, checkersRatingData, reversiRatingData] = await Promise.all([
          getPublicProfile(user.id),
          getGames(user.id),
          getUserRating(user.id, 'chess'),
          getUserRating(user.id, 'checkers'),
          getUserRating(user.id, 'reversi'),
        ]);

        setProfile(profileData);
        setGames(gamesData);
        setChessRating(chessRatingData);
        setCheckersRating(checkersRatingData);
        setReversiRating(reversiRatingData);
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

  const chessGames    = games.filter(g => !g.game_type || g.game_type === 'chess');
  const checkersGames = games.filter(g => g.game_type === 'checkers');
  const reversiGames  = games.filter(g => g.game_type === 'reversi');

  const tabGames: Record<Tab, SavedGame[]> = {
    all:      games,
    chess:    chessGames,
    checkers: checkersGames,
    reversi:  reversiGames,
  };

  const visibleGames = tabGames[activeTab];

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'all',      label: 'All',      count: games.length },
    { id: 'chess',    label: 'Chess',    count: chessGames.length },
    { id: 'checkers', label: 'Checkers', count: checkersGames.length },
    { id: 'reversi',  label: 'Reversi',  count: reversiGames.length },
  ];

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

        {/* Ratings */}
        <div className="mb-6 space-y-3">
          {[
            { label: 'Chess',    rating: chessRating },
            { label: 'Checkers', rating: checkersRating },
            { label: 'Reversi',  rating: reversiRating },
          ].map(({ label, rating }) => {
            if (!rating || rating.games_played === 0) return null;
            return (
              <div key={label} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                    {label}
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
            );
          })}
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <StatCard label="Games" value={games.length} />
          <StatCard label="Wins"   value={wins} />
          <StatCard label="Losses" value={losses} />
          <StatCard label="Win rate" value={`${winRate}%`} />
        </div>

        {/* Game history with tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Game rows */}
          {visibleGames.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2">
                {activeTab === 'checkers' ? '⛀' : activeTab === 'reversi' ? '⬤' : '♟'}
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {activeTab === 'all' ? 'No games played yet' : `No ${activeTab} games yet`}
              </p>
              <Link
                href={activeTab === 'checkers' ? '/checkers/bot' : activeTab === 'reversi' ? '/reversi/bot' : '/chess/bot'}
                className="mt-3 inline-block text-blue-500 hover:underline text-sm"
              >
                Play your first {activeTab === 'all' ? '' : activeTab + ' '}game
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {visibleGames.map((game) => {
                const gameType = game.game_type ?? 'chess';
                const isChess = gameType === 'chess';
                const replayHref = isChess ? `/chess/replays/${game.id}` : null;

                const gameLabel =
                  gameType === 'chess' ? 'Chess' :
                  gameType === 'checkers' ? 'Checkers' : 'Reversi';

                const gameIcon =
                  gameType === 'chess' ? '♟' :
                  gameType === 'checkers' ? '⬤' : '◑';

                const colorIsWhite = game.player_color === 'white';

                const inner = (
                  <>
                    {/* Game-type icon in a neutral pill */}
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0 select-none text-slate-700 dark:text-slate-200">
                      {gameIcon}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activeTab === 'all' && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">{gameLabel} ·</span>
                        )}
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">
                          vs {game.opponent}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600 text-xs">·</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 capitalize">{game.difficulty}</span>
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {formatDate(game.created_at)} · {game.moves.length} moves
                      </div>
                    </div>

                    {/* Color badge */}
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      colorIsWhite
                        ? 'bg-white dark:bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-slate-800 dark:bg-slate-900 text-slate-100 border-slate-600'
                    }`}>
                      {colorIsWhite ? 'White' : 'Black'}
                    </span>

                    <ResultBadge game={game} userId={user.id} />

                    {replayHref && (
                      <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </>
                );

                return replayHref ? (
                  <Link
                    key={game.id}
                    href={replayHref}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={game.id} className="flex items-center gap-3 px-4 py-3">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}