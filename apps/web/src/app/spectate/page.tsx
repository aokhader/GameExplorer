'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { GameIcon } from '@/components/game/GameIcon';
import { Icon } from '@gameexplorer/ui';

interface LiveGame {
  gameId:      string;
  gameType:    'chess' | 'checkers' | 'reversi';
  timeControl: string;
  white:       { username: string; rating: number };
  black:       { username: string; rating: number };
  moveCount:   number;
}

export default function SpectateLobby() {
  const router = useRouter();
  const [gameId, setGameId] = useState('');
  const [games, setGames]   = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // The error clears on the next success rather than at the start of every
  // attempt, so a list that keeps failing on its five-second refresh shows one
  // steady error instead of replaying its entrance each time. It never shows the
  // exception's own message, which named the code's problem, not the visitor's.
  const loadGames = useCallback(async () => {
    try {
      const data = await apiFetch<{ games: LiveGame[] }>('/games/live');
      setGames(data.games);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGames();
    const t = setInterval(loadGames, 5000); // refresh the live list periodically
    return () => clearInterval(t);
  }, [loadGames]);

  return (
    <div className="relative min-h-svh text-fg pt-16 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6 mt-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Icon name="eye" className="text-fg-muted" /> Watch Live Games</h1>
          <Link href="/" className="inline-flex min-h-11 items-center px-2 text-fg-muted hover:text-fg text-sm">← Home</Link>
        </div>

        {/* Live games list */}
        <div className="bg-surface-alt rounded-2xl p-6 shadow-2xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Live now {games.length > 0 && <span className="text-fg-muted">({games.length})</span>}</h2>
            <button onClick={loadGames} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-fg-muted hover:text-fg"><Icon name="arrows-clockwise" /> Refresh</button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[58px] w-full rounded-lg" />
              ))}
            </div>
          ) : failed ? (
            <ErrorState
              title="Couldn't load live games"
              body="The list tries again every few seconds."
              onRetry={loadGames}
              className="py-8"
            />
          ) : games.length === 0 ? (
            <EmptyState
              icon="popcorn"
              title="No live games right now"
              body="Online games show up here while they are being played."
              className="py-8"
              action={
                <Link href="/chess/play" className="text-sm text-accent hover:underline">
                  Start one yourself
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {games.map(g => (
                // <Link> (not a button+router.push) so Next prefetches the
                // /spectate/[gameId] route JS when the row enters the viewport —
                // the chunk statically imports all three boards + engine code,
                // so on-click download+compile was the spectate INP cost.
                <Link key={g.gameId} href={`/spectate/${g.gameId}`}
                  className="touch-target motion-control motion-safe:active:scale-[0.98] w-full flex items-center justify-between bg-surface-muted hover:bg-surface-hover rounded-lg px-4 py-3 text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl inline-flex items-center"><GameIcon game={g.gameType} /></span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {g.white.username} ({g.white.rating}) <span className="text-fg-muted">vs</span> {g.black.username} ({g.black.rating})
                      </div>
                      <div className="text-xs text-fg-muted capitalize">{g.gameType} · {g.timeControl} · {g.moveCount} moves</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-accent rounded text-sm font-semibold shrink-0 ml-2">Watch</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Manual game-id entry (e.g. a spectate link shared by a player) */}
        <div className="bg-surface-alt rounded-2xl p-6 shadow-2xl">
          <p className="text-sm text-fg-muted mb-3">Have a game ID? Enter it to watch directly.</p>
          <div className="flex gap-2">
            <input value={gameId} onChange={e => setGameId(e.target.value.trim())}
              onKeyDown={e => e.key === 'Enter' && gameId && router.push(`/spectate/${gameId}`)}
              placeholder="game id…"
              className="flex-1 min-w-0 min-h-11 bg-surface-muted rounded px-3 py-2 outline-none" />
            <button onClick={() => gameId && router.push(`/spectate/${gameId}`)} disabled={!gameId}
              className="min-h-11 px-4 py-2 bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 rounded font-semibold motion-control motion-safe:active:scale-[0.98]">Watch</button>
          </div>
        </div>
      </div>
    </div>
  );
}
