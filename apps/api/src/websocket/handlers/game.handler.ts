import type { Server as SocketIOServer, Socket } from 'socket.io';
import { ChessEngine, CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import { gameSessionService, TIME_CONTROL_CONFIGS } from '../../services/gameSession.service';
import { clockService }       from '../../services/clock.service';
import { persistenceService } from '../../services/persistence.service';
import { inviteService, inviteUrl } from '../../services/invite.service';
import { blockService }        from '../../services/block.service';
import { RedisService } from '../../config/redis';
import { logger }             from '../../utils/logger';

const DISCONNECT_GRACE_TTL = 60; // seconds

export function registerGameHandlers(io: SocketIOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  // ── Rejoin active game (reconnect or page refresh) ────────────────────────
  socket.on('join_game', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session) {
      socket.emit('error', { code: 'GAME_NOT_FOUND', message: 'Game not found' });
      return;
    }
    if (session.whiteId !== userId && session.blackId !== userId) {
      socket.emit('error', { code: 'GAME_NOT_FOUND', message: 'Not a participant' });
      return;
    }

    socket.join(`game:${gameId}`);
    const myColor      = session.whiteId === userId ? 'white' : 'black';
    const oppId        = myColor === 'white' ? session.blackId : session.whiteId;
    const oppUsername  = myColor === 'white' ? session.blackUsername : session.whiteUsername;
    const oppRating    = myColor === 'white' ? Number(session.blackRating) : Number(session.whiteRating);
    const clocks       = await clockService.getSnapshot(gameId);
    const tcConfig     = TIME_CONTROL_CONFIGS[session.timeControl];

    socket.emit('game_started', {
      gameId,
      gameType:         session.gameType,
      initialState:     JSON.parse(session.state),
      myColor,
      opponent:         { userId: oppId, username: oppUsername, rating: oppRating },
      clocks,
      timeControlConfig: tcConfig,
    });

    // Notify opponent of the reconnect. (The disconnect-forfeit timer is
    // cancelled in the connection handler, which always runs before join_game.)
    socket.to(`game:${gameId}`).emit('opponent_reconnected', { gameId });

    // Resume clock if it was paused due to disconnect
    const running = await clockService.isRunning(gameId);
    if (!running && session.status === 'active') {
      await clockService.startClock(gameId);
    }
  });

  // ── Move ──────────────────────────────────────────────────────────────────
  socket.on('make_move', async ({ gameId, move }: { gameId: string; move: import('@gameexplorer/shared').MovePayload }) => {
    // Rate limiting: 1 move per 200ms per socket
    try {
      const rl = await RedisService.checkRateLimit(`move:${socket.id}`, 1, 200);
      if (!rl.allowed) { socket.emit('error', { code: 'RATE_LIMITED', message: 'Sending moves too fast' }); return; }
    } catch { /* non-fatal */ }

    const result = await gameSessionService.applyMove(gameId, userId, move);
    if (!result.valid) {
      socket.emit('error', { code: 'ILLEGAL_MOVE', message: result.reason ?? 'Illegal move' });
      return;
    }

    const { clocks, flagged } = await clockService.deductAndSwitch(gameId);

    io.to(`game:${gameId}`).emit('move_made', { gameId, move, newState: result.newState, clocks });

    if (flagged || result.gameOver) {
      const session = await gameSessionService.getGameSession(gameId);
      if (!session) return;

      const finalResult = flagged
        ? (clocks.active_color === 'white' ? 'black_wins' : 'white_wins') as import('@gameexplorer/shared').GameResult
        : result.result!;
      const finalReason = flagged ? 'flag' : result.endReason!;

      const ratings = await gameSessionService.endGame(gameId, finalResult, finalReason as import('@gameexplorer/shared').EndReason);
      if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result: finalResult, reason: finalReason, ...ratings });
    }
  });

  // ── Resign ────────────────────────────────────────────────────────────────
  socket.on('resign', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session || session.status !== 'active') return;
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const result: import('@gameexplorer/shared').GameResult = session.whiteId === userId ? 'black_wins' : 'white_wins';
    const ratings = await gameSessionService.endGame(gameId, result, 'resign');
    if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result, reason: 'resign', ...ratings });
  });

  // ── Abort (early, no rating change) ───────────────────────────────────────
  socket.on('abort_game', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session || session.status !== 'active') return;
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const { ABORT_MOVE_LIMIT } = await import('@gameexplorer/shared');
    if (gameSessionService.getMoveCount(session) >= ABORT_MOVE_LIMIT) {
      socket.emit('error', { code: 'ABORT_NOT_ALLOWED', message: `Cannot abort after ${ABORT_MOVE_LIMIT} moves` });
      return;
    }

    await gameSessionService.abortGame(gameId);
    io.to(`game:${gameId}`).emit('game_aborted', { gameId });
  });

  // ── Draw offers ───────────────────────────────────────────────────────────
  socket.on('offer_draw', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session || session.status !== 'active') return;
    if (session.whiteId !== userId && session.blackId !== userId) return;

    await gameSessionService.setDrawOffered(gameId, userId);
    socket.to(`game:${gameId}`).emit('draw_offered', { gameId });
  });

  // Both answers to an offer carry the same three guards as `offer_draw` itself.
  // `drawOfferedBy !== userId` alone is NOT authorization: it is satisfied by any
  // signed-in stranger, and game ids are public via GET /api/games/live. Without
  // the participant check an outsider could end someone else's *rated* game as a
  // draw; without the session lookup, `clearDrawOffer` (a bare HSET) created a
  // Redis key for any id it was handed.
  function canAnswerDrawOffer(session: Awaited<ReturnType<typeof gameSessionService.getGameSession>>): boolean {
    if (!session || session.status !== 'active') return false;
    if (session.whiteId !== userId && session.blackId !== userId) return false;
    // An offer must be pending, and it must be the *opponent's* — you cannot
    // answer your own.
    return Boolean(session.drawOfferedBy) && session.drawOfferedBy !== userId;
  }

  socket.on('accept_draw', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!canAnswerDrawOffer(session)) return;

    await gameSessionService.clearDrawOffer(gameId);
    const ratings = await gameSessionService.endGame(gameId, 'draw', 'draw_agreement');
    if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result: 'draw', reason: 'draw_agreement', ...ratings });
  });

  socket.on('decline_draw', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!canAnswerDrawOffer(session)) return;

    await gameSessionService.clearDrawOffer(gameId);
    socket.to(`game:${gameId}`).emit('draw_declined', { gameId });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('send_chat', async ({ gameId, text }: { gameId: string; text: string }) => {
    // Throttle: 2 messages/sec per socket (spam guard).
    try {
      const rl = await RedisService.checkRateLimit(`chat:${socket.id}`, 2, 1000);
      if (!rl.allowed) return;
    } catch { /* non-fatal */ }

    const session = await gameSessionService.getGameSession(gameId);
    if (!session) return;
    // Only participants may post chat (spectators receive, never send) — otherwise
    // a spectator's message is attributed to whichever player they aren't.
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const username = session.whiteId === userId ? session.whiteUsername : session.blackUsername;
    const safeText = String(text).slice(0, 200).replace(/[<>]/g, '');
    const msg = { gameId, userId, username, text: safeText, createdAt: new Date().toISOString() };
    io.to(`game:${gameId}`).emit('chat_message', msg);
  });

  // ── Emotes / reactions ─────────────────────────────────────────────────────
  socket.on('send_emote', async ({ gameId, emote }: { gameId: string; emote: import('@gameexplorer/shared').Emote }) => {
    // Throttle: 1 emote per second per socket (spam guard).
    try {
      const rl = await RedisService.checkRateLimit(`emote:${socket.id}`, 1, 1000);
      if (!rl.allowed) return;
    } catch { /* non-fatal */ }

    const { EMOTES } = await import('@gameexplorer/shared');
    if (!EMOTES.includes(emote)) return; // reject anything outside the allowed set

    const session = await gameSessionService.getGameSession(gameId);
    if (!session) return;
    // Only participants may broadcast emotes (spectators receive, never send).
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const username = session.whiteId === userId ? session.whiteUsername : session.blackUsername;
    io.to(`game:${gameId}`).emit('emote_received', { gameId, userId, username, emote });
  });

  // ── Spectate ──────────────────────────────────────────────────────────────
  socket.on('spectate', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session) { socket.emit('error', { code: 'GAME_NOT_FOUND', message: 'Game not found' }); return; }

    socket.join(`game:${gameId}`);
    socket.join(`spectate:${gameId}`);
    const clocks = await clockService.getSnapshot(gameId);
    socket.emit('game_started', {
      gameId,
      gameType:         session.gameType,
      initialState:     JSON.parse(session.state),
      myColor:          'white', // spectators get white perspective
      opponent:         { userId: session.blackId, username: session.blackUsername, rating: Number(session.blackRating) },
      clocks,
      timeControlConfig: TIME_CONTROL_CONFIGS[session.timeControl],
    });
  });

  // Takes the payload whole rather than destructuring it in the parameter list:
  // socket.io does not validate payloads, so `emit('leave_spectate')` with no
  // argument would otherwise throw while binding parameters. `async` makes even
  // that a rejected promise (which index.ts survives) instead of a synchronous
  // throw out of the listener; the guard means neither happens.
  socket.on('leave_spectate', async (payload: { gameId?: string } | undefined) => {
    const gameId = payload?.gameId;
    if (typeof gameId !== 'string' || !gameId) return;
    socket.leave(`game:${gameId}`);
    socket.leave(`spectate:${gameId}`);
  });

  // ── Invites ───────────────────────────────────────────────────────────────
  socket.on('create_invite_link', async ({ gameType, timeControl, username }: { gameType: import('@gameexplorer/shared').GameType; timeControl: import('@gameexplorer/shared').TimeControl; username: string; rating?: number }) => {
    // Rating AND username are server-authoritative — fetched from Supabase, not
    // trusted from the client.
    const rating       = await persistenceService.getRating(userId, gameType);
    const safeUsername = (await persistenceService.getUsername(userId)) ?? username ?? 'Anonymous';
    // Persist identity on the socket so a later same-socket flow can reuse it.
    socket.data.username = safeUsername;
    socket.data.rating   = rating;
    const inviteId = await inviteService.createInvite(userId, safeUsername, rating, gameType, timeControl);
    socket.emit('invite_link_created', { inviteId, url: inviteUrl(gameType, inviteId) });
  });

  socket.on('accept_invite', async ({ inviteId, username }: { inviteId: string; username: string; rating?: number }) => {
    const res = await inviteService.acceptInvite(inviteId, userId);
    if ('error' in res) { socket.emit('error', { code: 'INVITE_EXPIRED', message: res.error }); return; }

    const invite  = res.invite;

    // Don't start a game between users who have blocked each other.
    if (await blockService.isBlockedBetween(userId, invite.fromId)) {
      socket.emit('error', { code: 'INVITE_EXPIRED', message: 'This invite is no longer available' });
      return;
    }

    // Rating AND username are server-authoritative — from Supabase, not the client.
    const rating       = await persistenceService.getRating(userId, invite.gameType);
    const safeUsername = (await persistenceService.getUsername(userId)) ?? username ?? 'Anonymous';

    socket.data.username = safeUsername;
    socket.data.rating   = rating;

    // Invite-by-link games are casual: there is no rated toggle in this flow,
    // so they never move ratings.
    const gameId  = await gameSessionService.createGame(
      invite.fromId, userId,
      invite.fromUsername, safeUsername,
      Number(invite.fromRating), rating,
      invite.gameType, invite.timeControl,
      false,
    );

    const tcConfig     = TIME_CONTROL_CONFIGS[invite.timeControl];
    const clocks       = await clockService.getSnapshot(gameId);
    // Both players start from the same authoritative initial state. (Previously
    // the inviter was sent `initialState: null`, leaving their board empty.)
    const initialState = newGameStateFor(invite.gameType);

    socket.join(`game:${gameId}`);
    socket.emit('game_started', { gameId, gameType: invite.gameType, initialState, myColor: 'black', opponent: { userId: invite.fromId, username: invite.fromUsername, rating: Number(invite.fromRating) }, clocks, timeControlConfig: tcConfig });

    io.to(`user:${invite.fromId}`).emit('game_started', { gameId, gameType: invite.gameType, initialState, myColor: 'white', opponent: { userId, username: safeUsername, rating: rating ?? 1200 }, clocks, timeControlConfig: tcConfig });
    io.to(`user:${invite.fromId}`).socketsJoin(`game:${gameId}`);

    await clockService.startClock(gameId);
  });
}

function newGameStateFor(gameType: import('@gameexplorer/shared').GameType) {
  return gameType === 'chess'    ? ChessEngine.newGame()
       : gameType === 'checkers' ? CheckersEngine.newGame()
       :                           ReversiEngine.newGame();
}
