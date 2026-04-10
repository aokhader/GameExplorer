// List of games to replay
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getGames, SavedGame } from '@gameexplorer/db';

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
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
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

  useEffect(() => {
    getGames().then((data) => {
      setGames(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/chess"
            className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Replays</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/60 dark:bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">♟</div>
            <p className="text-slate-500 dark:text-slate-400 text-lg">No games yet</p>
            <Link
              href="/chess/bot"
              className="mt-6 inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
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
                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 border border-slate-100 dark:border-slate-700"
              >
                {/* Color indicator */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${
                  game.player_color === 'white'
                    ? 'bg-slate-100 dark:bg-slate-700'
                    : 'bg-slate-800 dark:bg-slate-900'
                }`}>
                  {game.player_color === 'white' ? '♔' : '♚'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">
                      vs {game.opponent}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">·</span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs capitalize">
                      {game.difficulty ?? 'unknown'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDate(game.created_at)} at {formatTime(game.created_at)}
                    {' · '}
                    {game.moves.length} moves
                  </div>
                </div>

                <ResultBadge game={game} />

                <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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