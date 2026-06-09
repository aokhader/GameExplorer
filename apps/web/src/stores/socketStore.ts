import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@gameexplorer/shared';

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

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket = io(apiUrl, {
      auth:         { token: supabaseJwt },
      transports:   ['websocket'],
      reconnection: true,
      reconnectionDelay:    1000,
      reconnectionAttempts: 10,
    }) as GameSocket;

    // Only mutate the store for events from the socket that is still current,
    // so a stale socket's late events can't corrupt connection state.
    const isCurrent = () => get().socket === socket;
    socket.on('connect',    () => { if (isCurrent()) set({ connected: true, connectionError: null }); });
    socket.on('disconnect', () => { if (isCurrent()) set({ connected: false }); });
    // Surface handshake/auth failures (e.g. missing SUPABASE_URL on the
    // server, invalid token, server down) instead of silently staying on "Connecting…".
    socket.on('connect_error', (err) => {
      console.error('WebSocket connect_error:', err.message);
      if (isCurrent()) set({ connected: false, connectionError: err.message });
    });

    set({ socket, connected: socket.connected, connectionError: null });
  },

  disconnect() {
    get().socket?.disconnect();
    set({ socket: null, connected: false, connectionError: null });
  },
}));
