'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiFetch';
import { Skeleton } from '@/components/ui';

interface LiveGame {
  gameId:      string;
  gameType:    'chess' | 'checkers' | 'reversi';
  timeControl: string;
  white:       { username: string; rating: number };
  black:       { username: string; rating: number };
  moveCount:   number;
}

const GAME_ICON: Record<LiveGame['gameType'], string> = {
  chess: '♟', checkers: '⛀', reversi: '◑',
};

export default function SpectateLobby() {
  const router = useRouter();
  const [gameId, setGameId] = useState('');
  const [games, setGames]   = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const loadGames = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ games: LiveGame[] }>('/games/live');
      setGames(data.games);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load games');
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
    <div className="relative min-h-screen text-fg pt-16 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6 mt-6">
          <h1 className="text-2xl font-bold">👁 Watch Live Games</h1>
          <Link href="/" className="text-fg-muted hover:text-white text-sm">← Home</Link>
        </div>

        {/* Live games list */}
        <div className="bg-surface-alt rounded-2xl p-6 shadow-2xl mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Live now {games.length > 0 && <span className="text-fg-muted">({games.length})</span>}</h2>
            <button onClick={loadGames} className="text-sm text-fg-muted hover:text-white">↻ Refresh</button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[58px] w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-danger-hover py-8 text-center">{error}</p>
          ) : games.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-4xl mb-3">🍿</div>
              <p className="text-sm text-fg-muted">No live games right now.</p>
              <Link href="/chess/play" className="mt-3 inline-block text-sm text-accent hover:underline">
                Start one yourself
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {games.map(g => (
                <button key={g.gameId} onClick={() => router.push(`/spectate/${g.gameId}`)}
                  className="w-full flex items-center justify-between bg-surface-muted hover:bg-surface-hover rounded-lg px-4 py-3 text-left transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{GAME_ICON[g.gameType]}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {g.white.username} ({g.white.rating}) <span className="text-fg-muted">vs</span> {g.black.username} ({g.black.rating})
                      </div>
                      <div className="text-xs text-fg-muted capitalize">{g.gameType} · {g.timeControl} · {g.moveCount} moves</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-accent rounded text-sm font-semibold shrink-0 ml-2">Watch</span>
                </button>
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
              className="flex-1 min-w-0 bg-surface-muted rounded px-3 py-2 outline-none" />
            <button onClick={() => gameId && router.push(`/spectate/${gameId}`)} disabled={!gameId}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded font-semibold">Watch</button>
          </div>
        </div>
      </div>
    </div>
  );
}
