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
  const socket = useSocketStore(s => s.socket);

  // Field-level selectors instead of a whole-store subscription. This matters
  // for two reasons: the hook's consumers skip re-renders for fields they
  // never read, and (more importantly) the action callbacks below can read
  // fresh state via useGameStore.getState() and keep a *stable identity*
  // across clock ticks — which is what lets the play screens' memoized
  // boards actually skip re-rendering.
  const status          = useGameStore(s => s.status);
  const gameId          = useGameStore(s => s.gameId);
  const myColor         = useGameStore(s => s.myColor);
  const gameState       = useGameStore(s => s.gameState);
  const opponent        = useGameStore(s => s.opponent);
  const drawOffered     = useGameStore(s => s.drawOffered);
  const aborted         = useGameStore(s => s.aborted);
  const opponentGone    = useGameStore(s => s.opponentGone);
  const opponentGraceMs = useGameStore(s => s.opponentGraceMs);
  const clocks          = useGameStore(s => s.clocks);
  const clockSyncedAt   = useGameStore(s => s.clockSyncedAt);
  const gameEndData     = useGameStore(s => s.gameEndData);

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
    if (status === 'active' || inviteError) setAccepting(false);
  }, [status, inviteError]);

  // In-game chat
  useEffect(() => {
    if (!socket) return;
    socket.on('chat_message', (d: ChatMsg & { gameId: string }) => {
      if (d.gameId === useGameStore.getState().gameId) setChatLog(prev => [...prev, d]);
    });
    return () => { socket.off('chat_message'); };
  }, [socket]);

  // Real-time clock countdown off the latest server snapshot
  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    if (!clocks || status !== 'active') {
      setDisplayClocks({
        white: clocks?.white_ms ?? 0,
        black: clocks?.black_ms ?? 0,
      });
      return;
    }
    const syncedAt = clockSyncedAt;
    const base     = clocks;
    clockRef.current = setInterval(() => {
      setDisplayClocks(interpolateClocks(base, syncedAt, Date.now()));
    }, 100);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [clocks, clockSyncedAt, status]);

  // ── Actions ────────────────────────────────────────────────────────────
  // These read fresh state with useGameStore.getState() instead of closing
  // over subscribed values, so their identity survives store updates and the
  // views can safely feed them to memoized children (boards, chat, buttons).
  const joinQueue = useCallback(() => {
    if (!user || !connected) return;
    useGameStore.getState().setQueued(gameType);
    emit('join_queue', { gameType, timeControl, rated, username, rating: CLIENT_RATING_PLACEHOLDER });
  }, [user, connected, gameType, timeControl, rated, emit, username]);

  const cancelQueue = useCallback(() => {
    emit('leave_queue', { gameType, timeControl, rated });
    useGameStore.getState().reset();
  }, [emit, gameType, timeControl, rated]);

  // Per-game move payload is built by the view (chess from/to/promotion,
  // checkers from/to, reversi position); the gameId/turn guard is shared.
  const sendMove = useCallback((move: MovePayload) => {
    const s = useGameStore.getState();
    if (!s.gameId || s.status !== 'active') return;
    if ((s.gameState as any)?.currentTurn !== s.myColor) return;
    emit('make_move', { gameId: s.gameId, move });
  }, [emit]);

  const resign      = useCallback(() => { const id = useGameStore.getState().gameId; if (id) emit('resign', { gameId: id }); }, [emit]);
  const abort       = useCallback(() => { const id = useGameStore.getState().gameId; if (id) emit('abort_game', { gameId: id }); }, [emit]);
  const offerDraw   = useCallback(() => { const id = useGameStore.getState().gameId; if (id) emit('offer_draw', { gameId: id }); }, [emit]);
  const acceptDraw  = useCallback(() => { const s = useGameStore.getState(); if (s.gameId) emit('accept_draw',  { gameId: s.gameId }); s.setDrawOffered(false); }, [emit]);
  const declineDraw = useCallback(() => { const s = useGameStore.getState(); if (s.gameId) emit('decline_draw', { gameId: s.gameId }); s.setDrawOffered(false); }, [emit]);

  const sendChat = useCallback(() => {
    const id = useGameStore.getState().gameId;
    if (!chatText.trim() || !id) return;
    emit('send_chat', { gameId: id, text: chatText.trim() });
    setChatText('');
  }, [chatText, emit]);

  const playAgain = useCallback(() => {
    useGameStore.getState().reset();
    resetInvite();
    acceptedRef.current = false;
  }, [resetInvite]);

  // ── Derived view-model ─────────────────────────────────────────────────
  const isWhite     = myColor === 'white';
  const myClockMs   = isWhite ? displayClocks.white : displayClocks.black;
  const oppClockMs  = isWhite ? displayClocks.black : displayClocks.white;
  const activeColor = clocks?.active_color;
  const endData     = gameEndData;
  const myResult    = endData ? resultForColor(endData.result, (myColor ?? 'white') as PlayerColor) : null;

  return {
    // identity / connection
    user, loading, connected, connectionError, emit, socket, username,
    // store state (read-only passthrough)
    status,
    gameId,
    myColor,
    gameState,
    opponent,
    drawOffered,
    aborted,
    opponentGone,
    opponentGraceMs,
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
