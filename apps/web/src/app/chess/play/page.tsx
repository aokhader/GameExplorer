'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { redirect }                  from 'next/navigation';
import Link                          from 'next/link';
import { ChessBoard }   from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { useSocket }    from '@/hooks/useSocket';
import { useAuth }      from '@/hooks/useAuth';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/stores/socketStore';
import type { Position, PieceType, TimeControl, GameOutcome } from '@gameexplorer/shared';
import { upsertUserRating, saveGame } from '@gameexplorer/db';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'bullet',    label: 'Bullet',    desc: '1 min'      },
  { id: 'blitz',     label: 'Blitz',     desc: '3 min +2s'  },
  { id: 'rapid',     label: 'Rapid',     desc: '10 min'     },
  { id: 'classical', label: 'Classical', desc: '30 min'     },
];

function formatMs(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Clock({ ms, active, danger }: { ms: number; active: boolean; danger: boolean }) {
  return (
    <div className={`px-4 py-2 rounded-lg font-mono text-2xl font-bold transition-colors ${
      active  ? 'bg-white text-slate-900 shadow-md' :
      danger  ? 'bg-red-600 text-white' :
      'bg-slate-700 text-slate-300'
    }`}>
      {formatMs(ms)}
    </div>
  );
}

export default function ChessPlayPage() {
  const { user, loading } = useAuth();
  const { emit, connected } = useSocket();
  const socket    = useSocketStore(s => s.socket);
  const gameStore = useGameStore();

  const [timeControl, setTimeControl] = useState<TimeControl>('blitz');
  const [rated,       setRated]       = useState(true);
  const [chatText,    setChatText]    = useState('');
  const [chatLog,     setChatLog]     = useState<{ userId: string; username: string; text: string }[]>([]);
  const [displayClocks, setDisplayClocks] = useState({ white: 0, black: 0 });
  const clockRef = useRef<NodeJS.Timeout | null>(null);

  // Derive gameType from store so setGame can receive it correctly
  useEffect(() => {
    if (gameStore.status === 'idle') gameStore.setQueued('chess');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) redirect('/auth/signin?next=/chess/play');
  }, [user, loading]);

  // Chat messages
  useEffect(() => {
    if (!socket) return;
    socket.on('chat_message', (d) => {
      if (d.gameId === gameStore.gameId) setChatLog(prev => [...prev, d]);
    });
    return () => { socket.off('chat_message'); };
  }, [socket, gameStore.gameId]);

  // Real-time clock countdown
  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    if (!gameStore.clocks || gameStore.status !== 'active') {
      setDisplayClocks({ white: gameStore.clocks?.white_ms ?? 0, black: gameStore.clocks?.black_ms ?? 0 });
      return;
    }
    const syncedAt  = gameStore.clockSyncedAt;
    const baseClocks = gameStore.clocks;

    clockRef.current = setInterval(() => {
      const elapsed = Date.now() - syncedAt;
      const wMs = baseClocks.active_color === 'white' ? Math.max(0, baseClocks.white_ms - elapsed) : baseClocks.white_ms;
      const bMs = baseClocks.active_color === 'black' ? Math.max(0, baseClocks.black_ms - elapsed) : baseClocks.black_ms;
      setDisplayClocks({ white: wMs, black: bMs });
    }, 100);

    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [gameStore.clocks, gameStore.clockSyncedAt, gameStore.status]);

  // Save game + update rating on game end
  useEffect(() => {
    if (gameStore.status !== 'ended' || !gameStore.gameEndData || !user || !gameStore.gameId) return;
    const { result, white, black } = gameStore.gameEndData;
    const isWhite   = gameStore.myColor === 'white';
    const myRating  = isWhite ? white : black;
    const state     = gameStore.gameState as import('@gameexplorer/shared').ChessGameState | null;
    if (!state) return;

    const gameOutcome: GameOutcome = result === 'white_wins' ? (isWhite ? 'win' : 'loss') : result === 'black_wins' ? (isWhite ? 'loss' : 'win') : 'draw';
    const dbResult: 'white' | 'black' | 'draw' = gameOutcome === 'win' ? (isWhite ? 'white' : 'black') : gameOutcome === 'loss' ? (isWhite ? 'black' : 'white') : 'draw';
    upsertUserRating(user.id, myRating.ratingAfter, gameOutcome, 'chess').catch(console.error);

    saveGame(state, isWhite ? 'white' : 'black', dbResult, undefined, user.id, {
      mode:          'rated',
      rating_before: myRating.ratingBefore,
      rating_after:  myRating.ratingAfter,
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStore.status]);

  const handleJoinQueue = useCallback(() => {
    if (!user || !connected) return;
    gameStore.setQueued('chess');
    emit('join_queue', {
      gameType:    'chess',
      timeControl,
      rated,
      username:    user.email?.split('@')[0] ?? 'Player',
      rating:      1200,
    });
  }, [user, connected, timeControl, rated, emit, gameStore]);

  const handleCancelQueue = useCallback(() => {
    emit('leave_queue', { gameType: 'chess', timeControl, rated });
    gameStore.reset();
  }, [emit, timeControl, rated, gameStore]);

  const handleMove = useCallback((from: Position, to: Position, promotion?: PieceType) => {
    if (!gameStore.gameId || gameStore.status !== 'active') return;
    if ((gameStore.gameState as import('@gameexplorer/shared').ChessGameState)?.currentTurn !== gameStore.myColor) return;
    emit('make_move', { gameId: gameStore.gameId, move: { type: 'chess', from, to, promotion } });
  }, [gameStore, emit]);

  const handleResign = useCallback(() => {
    if (gameStore.gameId) emit('resign', { gameId: gameStore.gameId });
  }, [gameStore.gameId, emit]);

  const handleOfferDraw = useCallback(() => {
    if (gameStore.gameId) emit('offer_draw', { gameId: gameStore.gameId });
  }, [gameStore.gameId, emit]);

  const handleAcceptDraw = useCallback(() => {
    if (gameStore.gameId) emit('accept_draw', { gameId: gameStore.gameId });
    gameStore.setDrawOffered(false);
  }, [gameStore, emit]);

  const handleDeclineDraw = useCallback(() => {
    if (gameStore.gameId) emit('decline_draw', { gameId: gameStore.gameId });
    gameStore.setDrawOffered(false);
  }, [gameStore, emit]);

  const handleSendChat = useCallback(() => {
    if (!chatText.trim() || !gameStore.gameId) return;
    emit('send_chat', { gameId: gameStore.gameId, text: chatText.trim() });
    setChatText('');
  }, [chatText, gameStore.gameId, emit]);

  const handlePlayAgain = useCallback(() => {
    gameStore.reset();
  }, [gameStore]);

  if (loading || !user) return null;

  const chessState  = gameStore.gameState as import('@gameexplorer/shared').ChessGameState | null;
  const isMyTurn    = chessState?.currentTurn === gameStore.myColor;
  const oppName     = gameStore.opponent?.username ?? '…';
  const isWhite     = gameStore.myColor === 'white';
  const oppClockMs  = isWhite ? displayClocks.black : displayClocks.white;
  const myClockMs   = isWhite ? displayClocks.white : displayClocks.black;
  const activeColor = gameStore.clocks?.active_color;
  const endData     = gameStore.gameEndData;
  const myResult    = endData ? (endData.result === 'draw' ? 'draw' : endData.result === (isWhite ? 'white_wins' : 'black_wins') ? 'win' : 'loss') : null;

  return (
    <div className="min-h-screen bg-slate-900 text-white pt-16 flex flex-col items-center justify-center px-4 py-6">

      {/* ── Matchmaking panel ─────────────────────────────────────────────── */}
      {(gameStore.status === 'idle' || gameStore.status === 'queued') && (
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Online Chess</h1>
            <Link href="/chess" className="text-slate-400 hover:text-white text-sm">← Back</Link>
          </div>

          {gameStore.status === 'idle' ? (
            <>
              <div className="mb-6">
                <p className="text-sm text-slate-400 mb-3">Time Control</p>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_CONTROLS.map(tc => (
                    <button key={tc.id} onClick={() => setTimeControl(tc.id)}
                      className={`p-3 rounded-lg text-left transition-colors ${timeControl === tc.id ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                      <div className="font-semibold">{tc.label}</div>
                      <div className="text-xs text-slate-300">{tc.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setRated(!rated)}
                  className={`w-10 h-6 rounded-full transition-colors ${rated ? 'bg-blue-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${rated ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm">{rated ? 'Rated' : 'Casual'}</span>
              </div>
              <button onClick={handleJoinQueue} disabled={!connected}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-semibold transition-colors">
                {connected ? 'Find Game' : 'Connecting…'}
              </button>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg font-semibold mb-1">Finding opponent…</p>
              <p className="text-sm text-slate-400 mb-6">ELO window expands every 15s</p>
              <button onClick={handleCancelQueue} className="text-sm text-slate-400 hover:text-white underline">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* ── Game view ─────────────────────────────────────────────────────── */}
      {(gameStore.status === 'active' || gameStore.status === 'ended') && chessState && (
        <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-4 items-start">

          {/* Board column */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Opponent info */}
            <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
              <span className="font-semibold">{oppName} ({gameStore.opponent?.rating})</span>
              <Clock ms={oppClockMs} active={activeColor !== gameStore.myColor} danger={oppClockMs < 30_000} />
            </div>

            {/* Board */}
            <div className="relative">
              <ChessBoard
                gameState={chessState}
                onMove={handleMove}
                playerColor={gameStore.myColor ?? 'white'}
              />
              {/* Opponent gone banner */}
              {gameStore.opponentGone && (
                <div className="absolute top-2 left-2 right-2 bg-amber-600 text-white text-sm rounded px-3 py-2 text-center">
                  Opponent disconnected — waiting {Math.ceil(gameStore.opponentGraceMs / 1000)}s
                </div>
              )}
              {/* Draw offer banner */}
              {gameStore.drawOffered && (
                <div className="absolute bottom-2 left-2 right-2 bg-slate-700 border border-slate-500 rounded-lg px-4 py-3 flex items-center justify-between gap-2">
                  <span className="text-sm">Opponent offers a draw</span>
                  <div className="flex gap-2">
                    <button onClick={handleAcceptDraw} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm">Accept</button>
                    <button onClick={handleDeclineDraw} className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm">Decline</button>
                  </div>
                </div>
              )}
            </div>

            {/* My info */}
            <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
              <span className="font-semibold">You ({user.email?.split('@')[0]})</span>
              <Clock ms={myClockMs} active={activeColor === gameStore.myColor} danger={myClockMs < 30_000} />
            </div>

            {/* Action buttons */}
            {gameStore.status === 'active' && (
              <div className="flex gap-2 justify-end">
                <button onClick={handleOfferDraw} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">½ Draw</button>
                <button onClick={handleResign}    className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm">Resign</button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-72 flex flex-col gap-4">
            {/* Move list */}
            <div className="bg-slate-800 rounded-xl p-4 flex-1 overflow-hidden">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Moves</h3>
              <div className="overflow-y-auto max-h-64 space-y-0.5 font-mono text-sm">
                {chessState.moveHistory.map((m, i) => (
                  <span key={i} className={`inline-block px-1 rounded ${i % 2 === 0 ? 'text-white' : 'text-slate-300'}`}>
                    {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{m.to}
                  </span>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2 h-48">
              <h3 className="text-sm font-semibold text-slate-400">Chat</h3>
              <div className="flex-1 overflow-y-auto text-sm space-y-1">
                {chatLog.map((m, i) => (
                  <p key={i} className="text-slate-300"><span className="font-medium text-white">{m.username}:</span> {m.text}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={chatText} onChange={e => setChatText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  placeholder="Message…" maxLength={200}
                  className="flex-1 bg-slate-700 rounded px-2 py-1 text-sm outline-none" />
                <button onClick={handleSendChat} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Game over overlay ─────────────────────────────────────────────── */}
      {gameStore.status === 'ended' && endData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-5xl mb-4">{myResult === 'win' ? '🏆' : myResult === 'loss' ? '😞' : '🤝'}</div>
            <h2 className="text-3xl font-bold mb-1">
              {myResult === 'win' ? 'You Won!' : myResult === 'loss' ? 'You Lost' : 'Draw'}
            </h2>
            <p className="text-slate-400 mb-4 capitalize">{endData.reason.replace(/_/g, ' ')}</p>
            <div className="mb-6 bg-slate-700 rounded-xl p-4">
              <p className="text-sm text-slate-400 mb-1">Rating change</p>
              <p className="text-2xl font-bold">
                {isWhite ? endData.white.ratingAfter : endData.black.ratingAfter}
                <span className={`ml-2 text-lg ${(isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? '+' : ''}
                  {isWhite ? endData.white.ratingDelta : endData.black.ratingDelta}
                </span>
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={handlePlayAgain} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold">Play Again</button>
              <Link href="/chess" className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-center">Exit</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
