// List of games to replay
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getGames, SavedGame } from '@gameexplorer/db';
import { useAuth } from '@/hooks/useAuth';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function ResultBadge({ game }: { game: SavedGame }) {
  const playerWon = game.result === game.player_color;
  const isDraw = game.result === 'draw';

  const label = isDraw ? 'Draw' : playerWon ? 'Win' : 'Loss';
  const colors = isDraw
    ? 'bg-surface-hover text-fg-subtle dark:bg-surface-muted dark:text-fg-muted'
    : playerWon
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors}`}>
      {label}
    </span>
  );
}

export default function ReplaysPage() {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (loading === false) return; // already loaded
    getGames(user?.id).then((data) => {
      setGames(data);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="min-h-screen bg-linear-to-br from-surface-hover to-surface-hover dark:from-surface dark:to-surface-alt pt-16">
      <div className="container mx-auto px-4 pt-8 max-w-3xl">
        {/* Back link */}
        <Link
          href="/chess"
          className="inline-flex items-center gap-2 text-fg-subtle dark:text-fg-muted hover:text-fg-subtle dark:hover:text-fg transition-colors text-sm mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>

        <h1 className="text-3xl font-bold text-fg-subtle dark:text-fg mb-8">Replays</h1>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/60 dark:bg-surface-alt/60 animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">♟</div>
            <p className="text-fg-subtle dark:text-fg-muted text-lg">No games yet</p>
            <Link
              href="/chess/bot"
              className="mt-6 inline-block px-6 py-3 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors"
            >
              Play your first game
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/chess/replays/${game.id}`}
                className="flex items-center gap-4 p-4 bg-white dark:bg-surface-alt rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 border border-border-strong dark:border-border"
              >
                {/* Color indicator */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${
                  game.player_color === 'white'
                    ? 'bg-surface-hover dark:bg-surface-muted'
                    : 'bg-surface-alt dark:bg-surface'
                }`}>
                  {game.player_color === 'white' ? '♔' : '♚'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-fg-subtle dark:text-fg capitalize">
                      vs {game.opponent}
                    </span>
                    <span className="text-fg-muted dark:text-fg-subtle text-xs">·</span>
                    <span className="text-fg-subtle dark:text-fg-muted text-xs capitalize">
                      {game.difficulty ?? 'unknown'}
                    </span>
                  </div>
                  <div className="text-xs text-fg-muted dark:text-fg-subtle">
                    {formatDate(game.created_at)} at {formatTime(game.created_at)}
                    {' · '}
                    {game.moves.length} moves
                  </div>
                </div>

                <ResultBadge game={game} />

                <svg className="w-4 h-4 text-fg-muted dark:text-fg-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
