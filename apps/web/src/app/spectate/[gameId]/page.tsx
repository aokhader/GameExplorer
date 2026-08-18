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
import type { ChessGameState, CheckersGameState, ReversiGameState, ReversiColor, ClockSnapshot } from '@gameexplorer/shared';

function formatMs(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Stable no-op for the read-only boards — an inline `() => {}` would give the
// memoized boards a new onMove identity on every re-render.
const noop = () => {};

// Self-contained smooth countdown between server clock_sync ticks. The 100 ms
// interval lives here (not in the page) so each tick re-renders one badge, not
// the whole page + board — the page-level version kept the main thread busy at
// 10 Hz and pushed INP on this route to ~1.5 s.
//
// Callers re-key this on `clockSyncedAt`, so a new server sync remounts the
// badge and re-seeds `ms` from the fresh base value. Between syncs the active
// side counts down locally; `Date.now()` is read only inside the interval
// callback, never during render.
function ClockBadge({ color, clocks, clockSyncedAt, running }: {
  color: 'white' | 'black';
  clocks: ClockSnapshot | null;
  clockSyncedAt: number;
  running: boolean;
}) {
  const baseMs = color === 'white' ? clocks?.white_ms ?? 0 : clocks?.black_ms ?? 0;
  const active = clocks?.active_color === color;
  const countdown = running && active; // only the side to move ticks down
  const [ms, setMs] = useState(baseMs);

  useEffect(() => {
    if (!countdown) return;
    const id = setInterval(() => {
      setMs(Math.max(0, baseMs - (Date.now() - clockSyncedAt)));
    }, 100);
    return () => clearInterval(id);
  }, [countdown, baseMs, clockSyncedAt]);

  return (
    <span className={`px-3 py-1 rounded font-mono text-lg ${active ? 'bg-fg text-surface' : 'bg-surface-muted text-fg-muted'}`}>
      {formatMs(ms)}
    </span>
  );
}

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

  // The per-second countdown now lives inside <ClockBadge>, so a tick
  // re-renders only that badge — not this page and its board.

  if (loading || !user) return null;

  const gt          = gameType;
  const state       = gameState;
  const ended       = gameStatus === 'ended';
  const endData     = gameEndData;

  return (
    <div className="relative min-h-screen text-fg flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">👁 Spectating</h1>
          <Link href="/spectate" className="text-fg-muted hover:text-fg text-sm">← Leave</Link>
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
              <ClockBadge key={`black-${clockSyncedAt}`} color="black" clocks={clocks} clockSyncedAt={clockSyncedAt} running={gameStatus === 'active'} />
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
              <ClockBadge key={`white-${clockSyncedAt}`} color="white" clocks={clocks} clockSyncedAt={clockSyncedAt} running={gameStatus === 'active'} />
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
