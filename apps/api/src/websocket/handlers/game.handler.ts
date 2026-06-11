import type { Server as SocketIOServer, Socket } from 'socket.io';
import { gameSessionService } from '../../services/gameSession.service';
import { clockService }       from '../../services/clock.service';
import { redis, RedisService } from '../../config/redis';
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
    const { TIME_CONTROL_CONFIGS } = await import('../../services/gameSession.service');
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

    // Clear disconnect grace and notify opponent
    await redis.del(`disconnect_grace:${gameId}:${userId}`);
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
      io.to(`game:${gameId}`).emit('game_ended', { gameId, result: finalResult, reason: finalReason, ...ratings });
    }
  });

  // ── Resign ────────────────────────────────────────────────────────────────
  socket.on('resign', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session || (session.whiteId !== userId && session.blackId !== userId)) return;

    const result: import('@gameexplorer/shared').GameResult = session.whiteId === userId ? 'black_wins' : 'white_wins';
    const ratings = await gameSessionService.endGame(gameId, result, 'resign');
    io.to(`game:${gameId}`).emit('game_ended', { gameId, result, reason: 'resign', ...ratings });
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

  socket.on('accept_draw', async ({ gameId }: { gameId: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session || !session.drawOfferedBy || session.drawOfferedBy === userId) return;

    await gameSessionService.clearDrawOffer(gameId);
    const ratings = await gameSessionService.endGame(gameId, 'draw', 'draw_agreement');
    io.to(`game:${gameId}`).emit('game_ended', { gameId, result: 'draw', reason: 'draw_agreement', ...ratings });
  });

  socket.on('decline_draw', async ({ gameId }: { gameId: string }) => {
    await gameSessionService.clearDrawOffer(gameId);
    socket.to(`game:${gameId}`).emit('draw_declined', { gameId });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('send_chat', async ({ gameId, text }: { gameId: string; text: string }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session) return;

    const username = session.whiteId === userId ? session.whiteUsername : session.blackUsername;
    const safeText = String(text).slice(0, 200).replace(/[<>]/g, '');
    const msg = { gameId, userId, username, text: safeText, createdAt: new Date().toISOString() };
    io.to(`game:${gameId}`).emit('chat_message', msg);
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
      timeControlConfig: (await import('../../services/gameSession.service')).TIME_CONTROL_CONFIGS[session.timeControl],
    });
  });

  socket.on('leave_spectate', ({ gameId }: { gameId: string }) => {
    socket.leave(`game:${gameId}`);
    socket.leave(`spectate:${gameId}`);
  });

  // ── Invites ───────────────────────────────────────────────────────────────
  socket.on('create_invite_link', async ({ gameType, timeControl, username }: { gameType: import('@gameexplorer/shared').GameType; timeControl: import('@gameexplorer/shared').TimeControl; username: string; rating?: number }) => {
    // Rating is server-authoritative — fetched from Supabase, not the client.
    const { persistenceService } = await import('../../services/persistence.service');
    const rating = await persistenceService.getRating(userId, gameType);
    // Persist identity on the socket so a later same-socket flow can reuse it.
    socket.data.username = username;
    socket.data.rating   = rating;
    const { inviteService } = await import('../../services/invite.service');
    const inviteId = await inviteService.createInvite(userId, username ?? 'Anonymous', rating, gameType, timeControl);
    const baseUrl  = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
    socket.emit('invite_link_created', { inviteId, url: `${baseUrl}/${gameType}/play?invite=${inviteId}` });
  });

  socket.on('accept_invite', async ({ inviteId, username }: { inviteId: string; username: string; rating?: number }) => {
    const { inviteService } = await import('../../services/invite.service');
    const res = await inviteService.acceptInvite(inviteId, userId);
    if ('error' in res) { socket.emit('error', { code: 'INVITE_EXPIRED', message: res.error }); return; }

    const invite  = res.invite;
    // Rating is server-authoritative — fetched from Supabase, not the client.
    const { persistenceService } = await import('../../services/persistence.service');
    const rating = await persistenceService.getRating(userId, invite.gameType);

    socket.data.username = username;
    socket.data.rating   = rating;

    // Invite-by-link games are casual: there is no rated toggle in this flow,
    // so they never move ratings.
    const gameId  = await gameSessionService.createGame(
      invite.fromId, userId,
      invite.fromUsername, username ?? 'Anonymous',
      Number(invite.fromRating), rating,
      invite.gameType, invite.timeControl,
      false,
    );

    const { TIME_CONTROL_CONFIGS } = await import('../../services/gameSession.service');
    const tcConfig     = TIME_CONTROL_CONFIGS[invite.timeControl];
    const clocks       = await clockService.getSnapshot(gameId);
    // Both players start from the same authoritative initial state. (Previously
    // the inviter was sent `initialState: null`, leaving their board empty.)
    const initialState = ChessEngine_newGame_for_type(invite.gameType);

    socket.join(`game:${gameId}`);
    socket.emit('game_started', { gameId, gameType: invite.gameType, initialState, myColor: 'black', opponent: { userId: invite.fromId, username: invite.fromUsername, rating: Number(invite.fromRating) }, clocks, timeControlConfig: tcConfig });

    io.to(`user:${invite.fromId}`).emit('game_started', { gameId, gameType: invite.gameType, initialState, myColor: 'white', opponent: { userId, username: username ?? 'Anonymous', rating: rating ?? 1200 }, clocks, timeControlConfig: tcConfig });
    io.to(`user:${invite.fromId}`).socketsJoin(`game:${gameId}`);

    await clockService.startClock(gameId);
  });
}

// Helper to avoid re-importing engines just for initial state
function ChessEngine_newGame_for_type(gameType: import('@gameexplorer/shared').GameType) {
  if (gameType === 'chess')    { const { ChessEngine }    = require('@gameexplorer/shared'); return ChessEngine.newGame(); }
  if (gameType === 'checkers') { const { CheckersEngine } = require('@gameexplorer/shared'); return CheckersEngine.newGame(); }
  const { ReversiEngine } = require('@gameexplorer/shared'); return ReversiEngine.newGame();
}
