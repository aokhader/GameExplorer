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
    if (existing?.connected) return;
    existing?.disconnect();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket = io(apiUrl, {
      auth:         { token: supabaseJwt },
      transports:   ['websocket'],
      reconnection: true,
      reconnectionDelay:    1000,
      reconnectionAttempts: 10,
    }) as GameSocket;

    socket.on('connect',    () => set({ connected: true, connectionError: null }));
    socket.on('disconnect', () => set({ connected: false }));
    // Surface handshake/auth failures (e.g. missing SUPABASE_JWT_SECRET on the
    // server, invalid token, server down) instead of silently staying on "Connecting…".
    socket.on('connect_error', (err) => {
      console.error('WebSocket connect_error:', err.message);
      set({ connected: false, connectionError: err.message });
    });

    set({ socket, connectionError: null });
  },

  disconnect() {
    get().socket?.disconnect();
    set({ socket: null, connected: false, connectionError: null });
  },
}));
