// One hook that owns everything the three multiplayer play screens share:
// matchmaking, invite acceptance, the server-authoritative clock countdown,
// chat, and the game actions (move/resign/abort/draw). The web and React Native
// play screens are thin views over this — they supply only markup, the
// per-game move payload, and platform glue (routing, clipboard, the URL the
// invite id is read from).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { interpolateClocks, resultForColor } from '@gameexplorer/shared';
import type { GameType, TimeControl, MovePayload, PlayerColor } from '@gameexplorer/shared';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';
import { useInvite } from './useInvite';
import { useGameStore } from '../stores/gameStore';
import { useSocketStore } from '../stores/socketStore';

interface ChatMsg { userId: string; username: string; text: string }

// Placeholder rating sent with queue/invite requests; the server resolves the
// player's real rating from persistence and ignores this value.
const CLIENT_RATING_PLACEHOLDER = 1200;

export function useGameSession(gameType: GameType, defaultTimeControl: TimeControl) {
  const { user, loading } = useAuth();
  const { emit, connected, connectionError } = useSocket();
  const socket    = useSocketStore(s => s.socket);
  const gameStore = useGameStore();

  const [timeControl, setTimeControl] = useState<TimeControl>(defaultTimeControl);
  const [rated, setRated]             = useState(true);
  const [chatText, setChatText]       = useState('');
  const [chatLog, setChatLog]         = useState<ChatMsg[]>([]);
  const [displayClocks, setDisplayClocks] = useState({ white: 0, black: 0 });
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    inviteUrl, inviteError, creating,
    createInvite: createInviteRaw, acceptInvite: acceptInviteRaw, reset: resetInvite,
  } = useInvite();
  const [accepting, setAccepting] = useState(false);
  const acceptedRef = useRef(false);
  const username = user?.email?.split('@')[0] ?? 'Player';

  // Redeem an invite id. The view supplies it (web from the URL, mobile from a
  // deep link); the guard against double-accept lives here.
  const acceptInvite = useCallback((inviteId: string) => {
    if (acceptedRef.current) return;
    acceptedRef.current = true;
    setAccepting(true);
    acceptInviteRaw(inviteId, username, CLIENT_RATING_PLACEHOLDER);
  }, [acceptInviteRaw, username]);

  const createInvite = useCallback(() => {
    createInviteRaw(gameType, timeControl, username, CLIENT_RATING_PLACEHOLDER);
  }, [createInviteRaw, gameType, timeControl, username]);

  // Clear the "joining…" state once the game starts (or an invite error shows).
  useEffect(() => {
    if (gameStore.status === 'active' || inviteError) setAccepting(false);
  }, [gameStore.status, inviteError]);

  // In-game chat
  useEffect(() => {
    if (!socket) return;
    socket.on('chat_message', (d: ChatMsg & { gameId: string }) => {
      if (d.gameId === gameStore.gameId) setChatLog(prev => [...prev, d]);
    });
    return () => { socket.off('chat_message'); };
  }, [socket, gameStore.gameId]);

  // Real-time clock countdown off the latest server snapshot
  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    if (!gameStore.clocks || gameStore.status !== 'active') {
      setDisplayClocks({
        white: gameStore.clocks?.white_ms ?? 0,
        black: gameStore.clocks?.black_ms ?? 0,
      });
      return;
    }
    const syncedAt = gameStore.clockSyncedAt;
    const base     = gameStore.clocks;
    clockRef.current = setInterval(() => {
      setDisplayClocks(interpolateClocks(base, syncedAt, Date.now()));
    }, 100);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [gameStore.clocks, gameStore.clockSyncedAt, gameStore.status]);

  // ── Actions ────────────────────────────────────────────────────────────
  const joinQueue = useCallback(() => {
    if (!user || !connected) return;
    gameStore.setQueued(gameType);
    emit('join_queue', { gameType, timeControl, rated, username, rating: CLIENT_RATING_PLACEHOLDER });
  }, [user, connected, gameType, timeControl, rated, emit, gameStore, username]);

  const cancelQueue = useCallback(() => {
    emit('leave_queue', { gameType, timeControl, rated });
    gameStore.reset();
  }, [emit, gameType, timeControl, rated, gameStore]);

  // Per-game move payload is built by the view (chess from/to/promotion,
  // checkers from/to, reversi position); the gameId/turn guard is shared.
  const sendMove = useCallback((move: MovePayload) => {
    if (!gameStore.gameId || gameStore.status !== 'active') return;
    if ((gameStore.gameState as any)?.currentTurn !== gameStore.myColor) return;
    emit('make_move', { gameId: gameStore.gameId, move });
  }, [gameStore, emit]);

  const resign      = useCallback(() => { if (gameStore.gameId) emit('resign', { gameId: gameStore.gameId }); }, [gameStore.gameId, emit]);
  const abort       = useCallback(() => { if (gameStore.gameId) emit('abort_game', { gameId: gameStore.gameId }); }, [gameStore.gameId, emit]);
  const offerDraw   = useCallback(() => { if (gameStore.gameId) emit('offer_draw', { gameId: gameStore.gameId }); }, [gameStore.gameId, emit]);
  const acceptDraw  = useCallback(() => { if (gameStore.gameId) emit('accept_draw',  { gameId: gameStore.gameId }); gameStore.setDrawOffered(false); }, [gameStore, emit]);
  const declineDraw = useCallback(() => { if (gameStore.gameId) emit('decline_draw', { gameId: gameStore.gameId }); gameStore.setDrawOffered(false); }, [gameStore, emit]);

  const sendChat = useCallback(() => {
    if (!chatText.trim() || !gameStore.gameId) return;
    emit('send_chat', { gameId: gameStore.gameId, text: chatText.trim() });
    setChatText('');
  }, [chatText, gameStore.gameId, emit]);

  const playAgain = useCallback(() => {
    gameStore.reset();
    resetInvite();
    acceptedRef.current = false;
  }, [gameStore, resetInvite]);

  // ── Derived view-model ─────────────────────────────────────────────────
  const isWhite     = gameStore.myColor === 'white';
  const myClockMs   = isWhite ? displayClocks.white : displayClocks.black;
  const oppClockMs  = isWhite ? displayClocks.black : displayClocks.white;
  const activeColor = gameStore.clocks?.active_color;
  const endData     = gameStore.gameEndData;
  const myResult    = endData ? resultForColor(endData.result, (gameStore.myColor ?? 'white') as PlayerColor) : null;

  return {
    // identity / connection
    user, loading, connected, connectionError, emit, socket, username,
    // store state (read-only passthrough)
    status: gameStore.status,
    gameId: gameStore.gameId,
    myColor: gameStore.myColor,
    gameState: gameStore.gameState,
    opponent: gameStore.opponent,
    drawOffered: gameStore.drawOffered,
    aborted: gameStore.aborted,
    opponentGone: gameStore.opponentGone,
    opponentGraceMs: gameStore.opponentGraceMs,
    // matchmaking form
    timeControl, setTimeControl, rated, setRated,
    // invite flow
    inviteUrl, inviteError, creating, createInvite, acceptInvite, accepting,
    // actions
    joinQueue, cancelQueue, sendMove, resign, abort, offerDraw, acceptDraw, declineDraw, playAgain,
    // chat
    chatLog, chatText, setChatText, sendChat,
    // derived
    isWhite, myClockMs, oppClockMs, activeColor, endData, myResult,
  };
}
