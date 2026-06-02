// Phase 4 scaffold: multiplayer game-state types are not defined yet.
// The `any` casts here will be replaced with typed events when the
// WebSocket event protocol is implemented in Phase 4.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useCallback } from 'react';
import { supabase } from '@gameexplorer/db';
import { useAuthStore }   from '@/stores/authStore';
import { useSocketStore } from '@/stores/socketStore';
import { useGameStore }   from '@/stores/gameStore';

export function useSocket() {
  const user       = useAuthStore(s => s.user);
  const { connect, disconnect, socket } = useSocketStore();
  const gameStore  = useGameStore();

  // Connect / disconnect based on auth state
  useEffect(() => {
    if (!user) { disconnect(); return; }

    supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
      if (data.session) connect(data.session.access_token);
    });

    return () => { disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Register server→client event handlers
  useEffect(() => {
    if (!socket) return;

    socket.on('game_started', (data) => {
      gameStore.setGame(
        data.gameId,
        gameStore.gameType ?? (data.gameId as any),
        data.myColor,
        data.initialState as any,
        data.opponent,
        data.clocks,
        data.timeControlConfig,
      );
    });

    socket.on('move_made', (data) => {
      gameStore.applyMove(data.newState as any, data.clocks);
    });

    socket.on('clock_sync', (data) => {
      gameStore.syncClocks(data.clocks);
    });

    socket.on('game_ended', (data) => {
      gameStore.endGame({ result: data.result, reason: data.reason, white: data.white, black: data.black });
    });

    socket.on('draw_offered', () => {
      gameStore.setDrawOffered(true);
    });

    socket.on('draw_declined', () => {
      gameStore.setDrawOffered(false);
    });

    socket.on('opponent_disconnected', (data) => {
      gameStore.setOpponentGone(true, data.graceMs);
    });

    socket.on('opponent_reconnected', () => {
      gameStore.setOpponentGone(false);
    });

    return () => { socket.removeAllListeners(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const emit = useCallback(
    (event: string, data?: unknown) => socket?.emit(event as any, data as any),
    [socket],
  );

  const connected = useSocketStore(s => s.connected);
  return { socket, connected, emit };
}
