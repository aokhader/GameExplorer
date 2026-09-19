// List of games to replay
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getGames } from '@/lib/db';
import type { GameListItem } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { ChessPiece } from '@gameexplorer/ui';
import { EmptyState, Skeleton } from '@/components/ui';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function ResultBadge({ game }: { game: GameListItem }) {
  const playerWon = game.result === game.player_color;
  const isDraw = game.result === 'draw';

  const label = isDraw ? 'Draw' : playerWon ? 'Win' : 'Loss';
  const colors = isDraw
    ? 'bg-white/10 text-fg-muted'
    : playerWon
    ? 'bg-success/15 text-success-hover'
    : 'bg-danger/10 text-danger-hover';

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors}`}>
      {label}
    </span>
  );
}

export default function ReplaysPage() {
  const [games, setGames] = useState<GameListItem[]>([]);
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
    <div className="min-h-svh pt-16">
      <div className="container mx-auto px-4 pt-8 max-w-3xl">
        {/* Back link */}
        <Link
          href="/chess"
          className="inline-flex items-center gap-2 text-fg-muted hover:text-fg transition-colors text-sm mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>

        <h1 className="text-3xl font-bold text-fg mb-8">Replays</h1>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <EmptyState
            icon="film-strip"
            title="No games yet"
            body="Your finished chess games show up here, ready to replay move by move."
            className="py-24"
            action={
              <Link
                href="/chess/bot"
                className="touch-target motion-control motion-safe:active:scale-[0.98] inline-block px-6 py-3 rounded-xl bg-accent text-on-accent font-semibold hover:brightness-110"
              >
                Play your first game
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/chess/replays/${game.id}`}
                className="flex items-center gap-4 p-4 bg-white/[0.04] rounded-xl border border-white/10 motion-control motion-safe:active:scale-[0.98] hover:bg-white/[0.07] hover:border-white/20 transition-all hover:-translate-y-0.5"
              >
                {/* Color indicator — which side you played. Takes the theme's own
                    piece fills so the swatch matches the board, and always sets a
                    contrasting glyph color: inheriting `text-fg` put dark-on-dark
                    on the black swatch under a light theme. */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 border border-white/10 ${
                  game.player_color === 'white'
                    ? 'bg-[var(--gx-chess-piece-white-1,#ffffff)] text-[var(--gx-chess-piece-black-2,#293350)]'
                    : 'bg-[var(--gx-chess-piece-black-2,#293350)] text-[var(--gx-chess-piece-white-1,#ffffff)]'
                }`}>
                  <ChessPiece type="king" color={game.player_color === 'white' ? 'white' : 'black'} size={26} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-fg capitalize">
                      vs {game.opponent}
                    </span>
                    <span className="text-fg-subtle text-xs">·</span>
                    <span className="text-fg-muted text-xs capitalize">
                      {game.difficulty ?? 'unknown'}
                    </span>
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {formatDate(game.created_at)} at {formatTime(game.created_at)}
                    {' · '}
                    {game.move_count} moves
                  </div>
                </div>

                <ResultBadge game={game} />

                <svg className="w-4 h-4 text-fg-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
