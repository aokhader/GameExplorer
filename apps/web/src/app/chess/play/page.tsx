'use client';

import { useEffect } from 'react';
import { redirect }  from 'next/navigation';
import Link          from 'next/link';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { useGameSession } from '@gameexplorer/client';
import { SpectateLinkButton } from '@/components/multiplayer/SpectateLinkButton';
import { EmoteBar } from '@/components/multiplayer/EmoteBar';
import { OpponentMenu } from '@/components/multiplayer/OpponentMenu';
import { ABORT_MOVE_LIMIT, formatClockLong } from '@gameexplorer/shared';
import type { ChessGameState, TimeControl } from '@gameexplorer/shared';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'bullet',    label: 'Bullet',    desc: '1 min'      },
  { id: 'blitz',     label: 'Blitz',     desc: '3 min +2s'  },
  { id: 'rapid',     label: 'Rapid',     desc: '10 min'     },
  { id: 'classical', label: 'Classical', desc: '30 min'     },
];

function Clock({ ms, active, danger }: { ms: number; active: boolean; danger: boolean }) {
  return (
    <div className={`px-4 py-2 rounded-lg font-mono text-2xl font-bold transition-colors ${
      active  ? 'bg-white text-slate-900 shadow-md' :
      danger  ? 'bg-red-600 text-white' :
      'bg-slate-700 text-slate-300'
    }`}>
      {formatClockLong(ms)}
    </div>
  );
}

export default function ChessPlayPage() {
  const s = useGameSession('chess', 'blitz');

  // Auth guard (web routing).
  useEffect(() => {
    if (!s.loading && !s.user) redirect('/auth/signin?next=/chess/play');
  }, [s.user, s.loading]);

  // Accept an invite link (?invite=<id>) once connected — web reads it off the URL.
  useEffect(() => {
    if (!s.connected) return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (inviteId) s.acceptInvite(inviteId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.connected]);

  if (s.loading || !s.user) return null;

  const chessState = s.gameState as ChessGameState | null;
  const oppName    = s.opponent?.username ?? '…';
  const endData    = s.endData;
  // Center the short matchmaking panel; anchor in-game content to the top so the
  // taller stacked mobile layout scrolls from the top instead of being clipped.
  const inGame     = s.status === 'active' || s.status === 'ended';

  return (
    <div className={`min-h-screen bg-slate-900 text-white pt-16 flex flex-col items-center px-4 py-6 ${inGame ? 'justify-start' : 'justify-center'}`}>

      {/* ── Joining via invite link ───────────────────────────────────────── */}
      {s.accepting && s.status !== 'active' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-semibold">Joining game…</p>
          </div>
        </div>
      )}

      {/* ── Matchmaking panel ─────────────────────────────────────────────── */}
      {(s.status === 'idle' || s.status === 'queued') && (
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Online Chess</h1>
            <Link href="/chess" className="text-slate-400 hover:text-white text-sm">← Back</Link>
          </div>

          {s.status === 'idle' ? (
            <>
              <div className="mb-6">
                <p className="text-sm text-slate-400 mb-3">Time Control</p>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_CONTROLS.map(tc => (
                    <button key={tc.id} onClick={() => s.setTimeControl(tc.id)}
                      className={`p-3 rounded-lg text-left transition-colors ${s.timeControl === tc.id ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                      <div className="font-semibold">{tc.label}</div>
                      <div className="text-xs text-slate-300">{tc.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => s.setRated(!s.rated)}
                  className={`w-10 h-6 rounded-full transition-colors ${s.rated ? 'bg-blue-500' : 'bg-slate-600'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${s.rated ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm">{s.rated ? 'Rated' : 'Casual'}</span>
              </div>
              <button onClick={s.joinQueue} disabled={!s.connected}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-semibold transition-colors">
                {s.connected ? 'Find Game' : s.connectionError ? 'Connection failed' : 'Connecting…'}
              </button>
              {s.connectionError && !s.connected && (
                <p className="mt-3 text-sm text-red-400 text-center">{s.connectionError}</p>
              )}

              {/* Challenge a friend */}
              <div className="mt-6 pt-6 border-t border-slate-700">
                {!s.inviteUrl ? (
                  <button onClick={s.createInvite} disabled={!s.connected || s.creating}
                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl font-semibold transition-colors">
                    {s.creating ? 'Creating link…' : 'Play a Friend'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-400">Share this link with a friend:</p>
                    <div className="flex gap-2">
                      <input readOnly value={s.inviteUrl} onFocus={e => e.currentTarget.select()}
                        className="flex-1 bg-slate-700 rounded px-2 py-2 text-xs outline-none" />
                      <button onClick={() => navigator.clipboard?.writeText(s.inviteUrl!)}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">Copy</button>
                    </div>
                    <p className="text-xs text-slate-500">Waiting for your friend to join… (link expires in 10 min)</p>
                  </div>
                )}
                {s.inviteError && <p className="mt-3 text-sm text-red-400 text-center">{s.inviteError}</p>}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-lg font-semibold mb-1">Finding opponent…</p>
              <p className="text-sm text-slate-400 mb-6">ELO window expands every 15s</p>
              <button onClick={s.cancelQueue} className="text-sm text-slate-400 hover:text-white underline">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* ── Game view ─────────────────────────────────────────────────────── */}
      {(s.status === 'active' || s.status === 'ended') && chessState && (
        <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-4 items-start">

          {/* Board column */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Opponent info */}
            <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
              <span className="font-semibold">{oppName} ({s.opponent?.rating})</span>
              <Clock ms={s.oppClockMs} active={s.activeColor !== s.myColor} danger={s.oppClockMs < 30_000} />
            </div>

            {/* Opponent gone banner */}
            {s.opponentGone && (
              <div className="bg-amber-600 text-white text-sm rounded px-3 py-2 text-center">
                Opponent disconnected — waiting {Math.ceil(s.opponentGraceMs / 1000)}s
              </div>
            )}

            {/* Board */}
            <div className="relative">
              <ChessBoard
                gameState={chessState}
                onMove={(from, to, promotion) => s.sendMove({ type: 'chess', from, to, promotion })}
                playerColor={s.myColor ?? 'white'}
              />
            </div>

            {/* Draw offer banner */}
            {s.drawOffered && (
              <div className="bg-slate-700 border border-slate-500 rounded-lg px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-sm">Opponent offers a draw</span>
                <div className="flex gap-2">
                  <button onClick={s.acceptDraw} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm">Accept</button>
                  <button onClick={s.declineDraw} className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm">Decline</button>
                </div>
              </div>
            )}

            {/* My info */}
            <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
              <span className="font-semibold">You ({s.username})</span>
              <Clock ms={s.myClockMs} active={s.activeColor === s.myColor} danger={s.myClockMs < 30_000} />
            </div>

            {/* Action buttons */}
            {s.status === 'active' && (
              <div className="flex gap-2 justify-end">
                <SpectateLinkButton gameId={s.gameId!} />
                <button onClick={s.offerDraw} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">½ Draw</button>
                {chessState.moveHistory.length < ABORT_MOVE_LIMIT ? (
                  <button onClick={s.abort} className="px-4 py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-sm">Abort</button>
                ) : (
                  <button onClick={s.resign} className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg text-sm">Resign</button>
                )}
                {s.opponent?.userId && (
                  <OpponentMenu opponentId={s.opponent.userId} opponentName={oppName} gameId={s.gameId!} />
                )}
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

            {/* Emotes */}
            {s.status === 'active' && (
              <EmoteBar gameId={s.gameId!} myUserId={s.user.id} emit={s.emit} socket={s.socket} />
            )}

            {/* Chat */}
            <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-2 h-48">
              <h3 className="text-sm font-semibold text-slate-400">Chat</h3>
              <div className="flex-1 overflow-y-auto text-sm space-y-1">
                {s.chatLog.map((m, i) => (
                  <p key={i} className="text-slate-300"><span className="font-medium text-white">{m.username}:</span> {m.text}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={s.chatText} onChange={e => s.setChatText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && s.sendChat()}
                  placeholder="Message…" maxLength={200}
                  className="flex-1 bg-slate-700 rounded px-2 py-1 text-sm outline-none" />
                <button onClick={s.sendChat} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Game over overlay ─────────────────────────────────────────────── */}
      {s.status === 'ended' && endData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-5xl mb-4">{s.myResult === 'win' ? '🏆' : s.myResult === 'loss' ? '😞' : '🤝'}</div>
            <h2 className="text-3xl font-bold mb-1">
              {s.myResult === 'win' ? 'You Won!' : s.myResult === 'loss' ? 'You Lost' : 'Draw'}
            </h2>
            <p className="text-slate-400 mb-4 capitalize">{endData.reason.replace(/_/g, ' ')}</p>
            <div className="mb-6 bg-slate-700 rounded-xl p-4">
              <p className="text-sm text-slate-400 mb-1">Rating change</p>
              <p className="text-2xl font-bold">
                {s.isWhite ? endData.white.ratingAfter : endData.black.ratingAfter}
                <span className={`ml-2 text-lg ${(s.isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(s.isWhite ? endData.white.ratingDelta : endData.black.ratingDelta) >= 0 ? '+' : ''}
                  {s.isWhite ? endData.white.ratingDelta : endData.black.ratingDelta}
                </span>
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={s.playAgain} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold">Play Again</button>
              <Link href="/chess" className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-center">Exit</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Game aborted overlay ──────────────────────────────────────────── */}
      {s.status === 'ended' && s.aborted && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-5xl mb-4">🛑</div>
            <h2 className="text-3xl font-bold mb-1">Game Aborted</h2>
            <p className="text-slate-400 mb-6">No rating change.</p>
            <div className="flex gap-3">
              <button onClick={s.playAgain} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold">Play Again</button>
              <Link href="/chess" className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-center">Exit</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
