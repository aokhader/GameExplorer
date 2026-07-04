'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChessBoard }    from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { CheckersBoard } from '@/components/checkers/CheckersBoard';
import { ReversiBoard }  from '@/components/reversi/ReversiBoard';
import { useSocket }     from '@/hooks/useSocket';
import { useAuth }       from '@/hooks/useAuth';
import { useGameStore }  from '@/stores/gameStore';
import { useSocketStore } from '@/stores/socketStore';
import type { ChessGameState, CheckersGameState, ReversiGameState, ReversiColor } from '@gameexplorer/shared';

function formatMs(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Stable no-op for the read-only boards — an inline `() => {}` would give the
// memoized boards a new onMove identity on every 100 ms clock re-render.
const noop = () => {};

export default function SpectatePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId;
  const { user, loading } = useAuth();
  const { emit, connected } = useSocket();
  const socket = useSocketStore(s => s.socket);
  // Field-level selectors: this page re-renders every 100 ms while clocks run,
  // so it should only subscribe to what it actually renders.
  const gameType      = useGameStore(s => s.gameType);
  const gameState     = useGameStore(s => s.gameState);
  const opponent      = useGameStore(s => s.opponent);
  const clocks        = useGameStore(s => s.clocks);
  const clockSyncedAt = useGameStore(s => s.clockSyncedAt);
  const gameStatus    = useGameStore(s => s.status);
  const gameEndData   = useGameStore(s => s.gameEndData);
  const resetGame     = useGameStore(s => s.reset);
  const [displayClocks, setDisplayClocks] = useState({ white: 0, black: 0 });
  const clockRef  = useRef<NodeJS.Timeout | null>(null);
  const joinedRef = useRef(false);

  // Auth guard — spectating still requires an authenticated socket.
  useEffect(() => {
    if (!loading && !user) redirect(`/auth/signin?next=/spectate/${gameId}`);
  }, [user, loading, gameId]);

  // Join / leave the spectate room.
  useEffect(() => {
    if (!connected || !socket || joinedRef.current) return;
    joinedRef.current = true;
    resetGame();
    emit('spectate', { gameId });
    return () => {
      emit('leave_spectate', { gameId });
      resetGame();
      joinedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, socket, gameId]);

  // Smooth local clock countdown between server clock_sync ticks.
  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    if (!clocks || gameStatus !== 'active') {
      setDisplayClocks({ white: clocks?.white_ms ?? 0, black: clocks?.black_ms ?? 0 });
      return;
    }
    const syncedAt = clockSyncedAt;
    const base     = clocks;
    clockRef.current = setInterval(() => {
      const elapsed = Date.now() - syncedAt;
      const wMs = base.active_color === 'white' ? Math.max(0, base.white_ms - elapsed) : base.white_ms;
      const bMs = base.active_color === 'black' ? Math.max(0, base.black_ms - elapsed) : base.black_ms;
      setDisplayClocks({ white: wMs, black: bMs });
    }, 100);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [clocks, clockSyncedAt, gameStatus]);

  if (loading || !user) return null;

  const gt          = gameType;
  const state       = gameState;
  const activeColor = clocks?.active_color;
  const ended       = gameStatus === 'ended';
  const endData     = gameEndData;

  return (
    <div className="relative min-h-screen text-fg pt-16 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👁 Spectating</h1>
          <Link href="/spectate" className="text-fg-muted hover:text-white text-sm">← Leave</Link>
        </div>

        {!state ? (
          <div className="text-center py-20 text-fg-muted">
            {connected ? 'Loading game…' : 'Connecting…'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Black player (top) */}
            <div className="flex items-center justify-between bg-surface-alt rounded-lg px-4 py-2">
              <span className="font-semibold">⚫ {opponent?.username ?? 'Black'} ({opponent?.rating ?? '—'})</span>
              <span className={`px-3 py-1 rounded font-mono text-lg ${activeColor === 'black' ? 'bg-white text-fg-subtle' : 'bg-surface-muted text-fg-muted'}`}>{formatMs(displayClocks.black)}</span>
            </div>

            {/* Read-only board (pointer-events disabled) */}
            <div className="relative pointer-events-none select-none">
              {gt === 'chess'    && <ChessBoard    gameState={state as ChessGameState}    onMove={noop} playerColor="white" />}
              {gt === 'checkers' && <CheckersBoard gameState={state as CheckersGameState} onMove={noop} playerColor="white" />}
              {gt === 'reversi'  && <ReversiBoard  gameState={state as ReversiGameState}  onMove={noop} playerColor={'white' as ReversiColor} />}
            </div>

            {/* White player (bottom) */}
            <div className="flex items-center justify-between bg-surface-alt rounded-lg px-4 py-2">
              <span className="font-semibold">⚪ White</span>
              <span className={`px-3 py-1 rounded font-mono text-lg ${activeColor === 'white' ? 'bg-white text-fg-subtle' : 'bg-surface-muted text-fg-muted'}`}>{formatMs(displayClocks.white)}</span>
            </div>
          </div>
        )}

        {ended && endData && (
          <div className="mt-4 bg-surface-alt rounded-xl p-4 text-center">
            <p className="text-lg font-semibold">
              {endData.result === 'draw' ? 'Draw' : endData.result === 'white_wins' ? '⚪ White wins' : '⚫ Black wins'}
            </p>
            <p className="text-sm text-fg-muted capitalize">{endData.reason.replace(/_/g, ' ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
