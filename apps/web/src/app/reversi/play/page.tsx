'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { redirect }          from 'next/navigation';
import Link                  from 'next/link';
import { ReversiBoard }      from '@/components/reversi/ReversiBoard';
import { useSocket }         from '@/hooks/useSocket';
import { useAuth }           from '@/hooks/useAuth';
import { useGameStore }      from '@/stores/gameStore';
import { useSocketStore }    from '@/stores/socketStore';
import type { ReversiGameState, ReversiColor, TimeControl, GameOutcome } from '@gameexplorer/shared';
import { upsertUserRating, saveReversiGame } from '@gameexplorer/db';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'movetime', label: 'Normal', desc: '30s per move' },
  { id: 'blitz',    label: 'Fast',   desc: '15s per move' },
];

function formatMs(ms: number) { return `${Math.max(0, Math.ceil(ms / 1000))}s`; }

function Clock({ ms, active }: { ms: number; active: boolean }) {
  return (
    <div className={`px-4 py-2 rounded-lg font-mono text-xl font-bold transition-colors ${
      active ? 'bg-white text-slate-900 shadow-md' : 'bg-slate-700 text-slate-300'
    } ${ms < 10_000 && active ? '!bg-red-600 !text-white' : ''}`}>
      {formatMs(ms)}
    </div>
  );
}

export default function ReversiPlayPage() {
  const { user, loading } = useAuth();
  const { emit, connected } = useSocket();
  const socket    = useSocketStore(s => s.socket);
  const gameStore = useGameStore();

  const [timeControl, setTimeControl] = useState<TimeControl>('movetime');
  const [rated,       setRated]       = useState(true);
  const [chatText,    setChatText]    = useState('');
  const [chatLog,     setChatLog]     = useState<{ userId: string; username: string; text: string }[]>([]);
  const [displayClocks, setDisplayClocks] = useState({ white: 30_000, black: 30_000 });
  const clockRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading && !user) redirect('/auth/signin?next=/reversi/play');
  }, [user, loading]);

  useEffect(() => {
    if (!socket) return;
    socket.on('chat_message', (d) => {
      if (d.gameId === gameStore.gameId) setChatLog(prev => [...prev, d]);
    });
    return () => { socket.off('chat_message'); };
  }, [socket, gameStore.gameId]);

  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    if (!gameStore.clocks || gameStore.status !== 'active') {
      setDisplayClocks({ white: gameStore.clocks?.white_ms ?? 30_000, black: gameStore.clocks?.black_ms ?? 30_000 });
      return;
    }
    const syncedAt   = gameStore.clockSyncedAt;
    const baseClocks = gameStore.clocks;
    clockRef.current = setInterval(() => {
      const elapsed = Date.now() - syncedAt;
      const wMs = baseClocks.active_color === 'white' ? Math.max(0, baseClocks.white_ms - elapsed) : baseClocks.white_ms;
      const bMs = baseClocks.active_color === 'black' ? Math.max(0, baseClocks.black_ms - elapsed) : baseClocks.black_ms;
      setDisplayClocks({ white: wMs, black: bMs });
    }, 100);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [gameStore.clocks, gameStore.clockSyncedAt, gameStore.status]);

  useEffect(() => {
    if (gameStore.status !== 'ended' || !gameStore.gameEndData || !user) return;
    const { result, white, black } = gameStore.gameEndData;
    const isWhite  = gameStore.myColor === 'white';
    const myRating = isWhite ? white : black;

    const gameOutcome: GameOutcome = result === 'white_wins' ? (isWhite ? 'win' : 'loss') : result === 'black_wins' ? (isWhite ? 'loss' : 'win') : 'draw';
    const dbResult: 'white' | 'black' | 'draw' = gameOutcome === 'win' ? (isWhite ? 'white' : 'black') : gameOutcome === 'loss' ? (isWhite ? 'black' : 'white') : 'draw';
    upsertUserRating(user.id, myRating.ratingAfter, gameOutcome, 'reversi').catch(console.error);

    const state = gameStore.gameState as ReversiGameState | null;
    if (state) {
      saveReversiGame(state, isWhite ? 'white' : 'black', dbResult, undefined, user.id, {
        mode:          'rated',
        rating_before: myRating.ratingBefore,
        rating_after:  myRating.ratingAfter,
      }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStore.status]);

  const handleJoinQueue = useCallback(() => {
    if (!user || !connected) return;
    gameStore.setQueued('reversi');
    emit('join_queue', {
      gameType:    'reversi',
      timeControl,
      rated,
      username:    user.email?.split('@')[0] ?? 'Player',
      rating:      1200,
    });
  }, [user, connected, timeControl, rated, emit, gameStore]);

  const handleCancelQueue = useCallback(() => {
    emit('leave_queue', { gameType: 'reversi', timeControl, rated });
    gameStore.reset();
  }, [emit, timeControl, rated, gameStore]);

  const handleMove = useCallback((position: string) => {
    if (!gameStore.gameId || gameStore.status !== 'active') return;
    const state = gameStore.gameState as ReversiGameState | null;
    if (state?.currentTurn !== (gameStore.myColor as ReversiColor)) return;
    emit('make_move', { gameId: gameStore.gameId, move: { type: 'reversi', position } });
  }, [gameStore, emit]);

  const handleResign = useCallback(() => {
    if (gameStore.gameId) emit('resign', { gameId: gameStore.gameId });
  }, [gameStore.gameId, emit]);

  const handleSendChat = useCallback(() => {
    if (!chatText.trim() || !gameStore.gameId) return;
    emit('send_chat', { gameId: gameStore.gameId, text: chatText.trim() });
    setChatText('');
  }, [chatText, gameStore.gameId, emit]);

  if (loading || !user) return null;

  const reversiState = gameStore.gameState as ReversiGameState | null;
  const isWhite      = gameStore.myColor === 'white';
  const oppClockMs   = isWhite ? displayClocks.black : displayClocks.white;
  const myClockMs    = isWhite ? displayClocks.white : displayClocks.black;
  const activeColor  = gameStore.clocks?.active_color;
  const endData      = gameStore.gameEndData;
  const myResult     = endData ? (endData.result === 'draw' ? 'draw' : endData.result === (isWhite ? 'white_wins' : 'black_wins') ? 'win' : 'loss') : null;
  const discCounts   = reversiState ? { black: reversiState.board.flat().filter(c => c?.color === 'black').length, white: reversiState.board.flat().filter(c => c?.color === 'white').length } : { black: 2, white: 2 };

  return (
    <div className="min-h-screen bg-slate-900 text-white pt-16 flex flex-col items-center justify-center px-4 py-6">

      {(gameStore.status === 'idle' || gameStore.status === 'queued') && (
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Online Reversi</h1>
            <Link href="/reversi" className="text-slate-400 hover:text-white text-sm">← Back</Link>
          </div>
          {gameStore.status === 'idle' ? (
            <>
              <div className="mb-6">
                <p className="text-sm text-slate-400 mb-3">Time Control</p>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_CONTROLS.map(tc => (
                    <button key={tc.id} onClick={() => setTimeControl(tc.id)}
                      className={`p-3 rounded-lg text-left transition-colors ${timeControl === tc.id ? 'bg-green-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                      <div className="font-semibold">{tc.label}</div>
                      <div className="text-xs text-slate-300">{tc.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setRated(!rated)}
                  className={`w-10 h-6 rounded-full transition-colors ${rated ? 'bg-green-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${rated ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm">{rated ? 'Rated' : 'Casual'}</span>
              </div>
              <button onClick={handleJoinQueue} disabled={!connected}
                className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl font-semibold transition-colors">
                {connected ? 'Find Game' : 'Connecting…'}
              </button>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg font-semibold mb-6">Finding opponent…</p>
              <button onClick={handleCancelQueue} className="text-sm text-slate-400 hover:text-white underline">Cancel</button>
            </div>
          )}
        </div>
      )}

      {(gameStore.status === 'active' || gameStore.status === 'ended') && reversiState && (
        <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Score bar */}
            <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-2">
              <span className="text-sm">⚫ {discCounts.black}</span>
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${(discCounts.white / (discCounts.white + discCounts.black)) * 100}%` }} />
              </div>
              <span className="text-sm">⚪ {discCounts.white}</span>
            </div>

            <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
              <span className="font-semibold">{gameStore.opponent?.username} ({gameStore.opponent?.rating})</span>
              <Clock ms={oppClockMs} active={activeColor !== gameStore.myColor} />
            </div>
            <div className="relative">
              <ReversiBoard
                gameState={reversiState}
                onMove={handleMove}
                playerColor={(gameStore.myColor ?? 'black') as ReversiColor}
                highlightPos={reversiState.moveHistory.length > 0 ? reversiState.moveHistory[reversiState.moveHistory.length - 1].position ?? undefined : undefined}
              />
              {gameStore.opponentGone && (
                <div className="absolute top-2 left-2 right-2 bg-amber-600 text-white text-sm rounded px-3 py-2 text-center">
                  Opponent disconnected — waiting {Math.ceil(gameStore.opponentGraceMs / 1000)}s
                </div>
              )}
            </div>
            <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
              <span className="font-semibold">You ({user.email?.split('@')[0]})</span>
              <Clock ms={myClockMs} active={activeColor === gameStore.myColor} />
            </div>
            {gameStore.status === 'active' && (
              <div className="flex gap-2 justify-end">
                <button onClick={handleResign} className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm">Resign</button>
              </div>
            )}
          </div>

          <div className="w-full lg:w-64 flex flex-col gap-4">
            <div className="bg-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Moves</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto text-sm font-mono">
                {reversiState.moveHistory.map((m, i) => (
                  <div key={i} className="text-slate-300">
                    {i + 1}. {m.color[0].toUpperCase()} {m.position ?? '(pass)'} {m.flipped.length > 0 ? `+${m.flipped.length}` : ''}
                  </div>
                ))}
              </div>
            </div>
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
                <button onClick={handleSendChat} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm">Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameStore.status === 'ended' && endData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-5xl mb-4">{myResult === 'win' ? '🏆' : myResult === 'loss' ? '😞' : '🤝'}</div>
            <h2 className="text-3xl font-bold mb-1">{myResult === 'win' ? 'You Won!' : myResult === 'loss' ? 'You Lost' : 'Draw'}</h2>
            <p className="text-slate-400 mb-4 capitalize">{endData.reason.replace(/_/g, ' ')}</p>
            <div className="mb-6 bg-slate-700 rounded-xl p-4">
              <p className="text-sm text-slate-400 mb-1">Rating change</p>
              <p className="text-2xl font-bold">
                {isWhite ? endData.white.ratingAfter : endData.black.ratingAfter}
                <span className={`ml-2 text-lg ${(isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? '+' : ''}{isWhite ? endData.white.ratingDelta : endData.black.ratingDelta}
                </span>
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => gameStore.reset()} className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-semibold">Play Again</button>
              <Link href="/reversi" className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-center">Exit</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
