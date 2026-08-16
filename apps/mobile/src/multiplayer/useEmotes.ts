import { useCallback, useEffect, useRef, useState } from 'react';
import type { Emote } from '@gameexplorer/shared';
import type { GameSession } from './session';

export interface FloatingReaction {
  id: number;
  emote: Emote;
  username: string;
  /** The local player sent it — their own bubbles align to the other edge. */
  mine: boolean;
}

/** How long a reaction stays on screen. Matches web's `EmoteBar`. */
const VISIBLE_MS = 3000;
/** Client-side throttle, matching the server's per-user emote rate limit. */
const COOLDOWN_MS = 1000;

/**
 * Incoming/outgoing reactions for the current game.
 *
 * The logic is web's `EmoteBar` minus its markup, so the two platforms throttle
 * and expire identically. One deliberate difference: every expiry timer is
 * tracked and cleared on unmount. Web leaves them dangling, which is harmless in
 * a tab that is about to be torn down but not on a phone, where leaving a game
 * and starting another keeps the same JS context alive.
 */
export function useEmotes(session: GameSession) {
  const { socket, emit, gameId, user } = session;
  const myUserId = user?.id ?? null;

  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [cooling, setCooling] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!socket || !gameId) return;
    const onEmote = (d: { gameId: string; userId: string; username: string; emote: Emote }) => {
      if (d.gameId !== gameId) return;
      const id = Date.now() + Math.random();
      setReactions((prev) => [
        ...prev,
        { id, emote: d.emote, username: d.username, mine: d.userId === myUserId },
      ]);
      timersRef.current.push(
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), VISIBLE_MS),
      );
    };
    socket.on('emote_received', onEmote);
    return () => {
      socket.off('emote_received', onEmote);
    };
  }, [socket, gameId, myUserId]);

  const send = useCallback(
    (emote: Emote) => {
      if (cooling || !gameId) return;
      emit('send_emote', { gameId, emote });
      setCooling(true);
      timersRef.current.push(setTimeout(() => setCooling(false), COOLDOWN_MS));
    },
    [cooling, emit, gameId],
  );

  return { reactions, send, cooling };
}
