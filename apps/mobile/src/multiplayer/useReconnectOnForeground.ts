import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSocketStore } from '@gameexplorer/client';

/**
 * Bring the multiplayer socket back when the app returns to the foreground.
 *
 * This is the one genuinely new risk in porting multiplayer to a phone: a
 * browser tab keeps running, an app does not. While the app is backgrounded the
 * JS thread is suspended, so socket.io's own heartbeat cannot fire. Most of the
 * time that heals itself — the frozen `pingTimeout` fires immediately on
 * resume, the client notices the dead transport and reconnects, and the server
 * puts the player back in their game (`websocket/index.ts` rejoins the room and
 * re-emits `game_started` on the new socket).
 *
 * What does *not* heal itself is a long background: ten reconnection attempts
 * elapse against a network the device didn't have, the manager gives up, and
 * the socket stays closed with nothing left to retry it. Then the player
 * returns to a board that will not accept moves. Asking for one explicit
 * reconnect on foreground costs nothing when the socket is already up
 * (`connect()` on a live socket is a no-op) and is the whole fix when it isn't.
 *
 * The socket is *not* torn down on background: the server gives a 60s grace
 * period before forfeiting, so a quick glance at another app should leave the
 * game untouched.
 */
export function useReconnectOnForeground(): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const socket = useSocketStore.getState().socket;
      if (socket && !socket.connected) socket.connect();
    });
    return () => sub.remove();
  }, []);
}
