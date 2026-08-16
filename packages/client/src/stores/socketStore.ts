import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@gameexplorer/shared';
import { getApiUrl } from '../config';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketStore {
  socket:    GameSocket | null;
  connected: boolean;
  connectionError: string | null;
  connect:   (supabaseJwt: string) => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket:    null,
  connected: false,
  connectionError: null,

  connect(supabaseJwt) {
    const existing = get().socket;
    // Idempotent: reuse a socket that is already connected OR still in the
    // middle of (re)connecting (`active`). Without this, React's double-invoke
    // of effects (StrictMode) tears down a mid-handshake socket and creates a
    // second one — the first socket's later 'connect' event then sets
    // connected:true while the store points at the second socket, so emits go
    // nowhere even though the UI thinks it's connected.
    if (existing && (existing.connected || existing.active)) return;
    existing?.removeAllListeners();
    existing?.disconnect();

    const apiUrl = getApiUrl();
    const socket = io(apiUrl, {
      auth:         { token: supabaseJwt },
      transports:   ['websocket'],
      reconnection: true,
      reconnectionDelay:    1000,
      reconnectionAttempts: 10,
      // The API runs on a free Render instance that sleeps after ~15 minutes
      // idle. A measured cold start takes ~21s, and Render HOLDS the upgrade
      // open while the instance boots rather than refusing it — so socket.io's
      // 20s default fired a beat before the server became ready, making the
      // first connection after every sleep fail with "timeout". 45s clears a
      // cold start with room to spare.
      timeout: 45000,
    }) as GameSocket;

    // Only mutate the store for events from the socket that is still current,
    // so a stale socket's late events can't corrupt connection state.
    const isCurrent = () => get().socket === socket;
    socket.on('connect',    () => { if (isCurrent()) set({ connected: true, connectionError: null }); });
    socket.on('disconnect', () => { if (isCurrent()) set({ connected: false }); });
    // Surface handshake/auth failures (e.g. missing SUPABASE_URL on the
    // server, invalid token) instead of silently staying on "Connecting…" —
    // but ONLY once they are final.
    //
    // `socket.active` is socket.io's own "will I try again?" flag. A server-side
    // middleware rejection (bad/expired token, misconfigured server) calls
    // destroy() before emitting connect_error, so `active` is false: retrying
    // with the same token cannot help, and the user should be told now. A
    // transport failure leaves `active` true with a retry already scheduled —
    // reporting "Connection failed" there told the user the game was broken
    // while it was, in fact, seconds from connecting. That is exactly what a
    // cold-starting server looks like.
    socket.on('connect_error', (err) => {
      if (!isCurrent()) return;
      // Always log: a dev pointing at a stopped local API wants the real reason.
      console.error('WebSocket connect_error:', err.message);
      if (socket.active) { set({ connected: false }); return; }
      set({ connected: false, connectionError: err.message });
    });

    // Every retry is spent, so the failure is now real.
    socket.io.on('reconnect_failed', () => {
      if (isCurrent()) set({ connected: false, connectionError: 'Could not reach the server' });
    });

    set({ socket, connected: socket.connected, connectionError: null });
  },

  disconnect() {
    get().socket?.disconnect();
    set({ socket: null, connected: false, connectionError: null });
  },
}));
