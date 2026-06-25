// Multiplayer socket bootstrap: connects on auth, registers server→client
// event handlers, and exposes a typed-ish emit. Platform-agnostic (no DOM /
// no next/*) so web and React Native share it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useCallback } from 'react';
import { supabase } from '@gameexplorer/db';
import { useAuthStore }   from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { useGameStore }   from '../stores/gameStore';

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
        data.gameType,
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

    socket.on('game_aborted', () => {
      gameStore.markAborted();
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

    // Remove ONLY the game-event listeners registered above. Calling
    // socket.removeAllListeners() here would also strip the connect/disconnect/
    // connect_error listeners that socketStore.connect registered on this same
    // socket, breaking connection-state tracking.
    return () => {
      socket.off('game_started');
      socket.off('move_made');
      socket.off('clock_sync');
      socket.off('game_ended');
      socket.off('game_aborted');
      socket.off('draw_offered');
      socket.off('draw_declined');
      socket.off('opponent_disconnected');
      socket.off('opponent_reconnected');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const emit = useCallback(
    (event: string, data?: unknown) => socket?.emit(event as any, data as any),
    [socket],
  );

  const connected       = useSocketStore(s => s.connected);
  const connectionError = useSocketStore(s => s.connectionError);
  return { socket, connected, connectionError, emit };
}
