'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { EMOTES, type Emote } from '@gameexplorer/shared';

interface FloatingReaction {
  id:       number;
  emote:    Emote;
  username: string;
  mine:     boolean;
}

interface EmoteBarProps {
  gameId:   string;
  myUserId: string;
  emit:     (event: string, data?: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket:   Socket<any, any> | null;
}

/**
 * In-game emote bar shared by all three multiplayer play pages. Sends emotes
 * via `send_emote` and renders incoming `emote_received` reactions as transient
 * floating bubbles. Server enforces participant-only sending + rate limiting.
 */
export function EmoteBar({ gameId, myUserId, emit, socket }: EmoteBarProps) {
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [cooldown, setCooldown]   = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onEmote = (d: { gameId: string; userId: string; username: string; emote: Emote }) => {
      if (d.gameId !== gameId) return;
      const id = Date.now() + Math.random();
      setReactions(prev => [...prev, { id, emote: d.emote, username: d.username, mine: d.userId === myUserId }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    };
    socket.on('emote_received', onEmote);
    return () => { socket.off('emote_received', onEmote); };
  }, [socket, gameId, myUserId]);

  const send = (emote: Emote) => {
    if (cooldown) return;
    emit('send_emote', { gameId, emote });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1000); // matches the server-side throttle
  };

  return (
    <>
      <div className="flex flex-wrap gap-1 justify-center bg-slate-800 rounded-lg px-2 py-1.5">
        {EMOTES.map(e => (
          <button key={e} onClick={() => send(e)} disabled={cooldown}
            className="text-xl px-1.5 rounded hover:bg-slate-700 disabled:opacity-40 transition-colors"
            aria-label={`Send ${e}`}>
            {e}
          </button>
        ))}
      </div>

      {/* Transient floating reactions (bottom-right stack) */}
      <div className="fixed bottom-6 right-6 flex flex-col-reverse gap-2 pointer-events-none z-40">
        {reactions.map(r => (
          <div key={r.id}
            className={`flex items-center gap-2 ${r.mine ? 'self-end' : ''}`}
            style={{ animation: 'emoteFloat 3s ease-out forwards' }}>
            <span className="text-4xl drop-shadow-lg">{r.emote}</span>
            <span className="text-xs bg-slate-900/80 rounded px-1.5 py-0.5">{r.username}</span>
          </div>
        ))}
      </div>
    </>
  );
}
