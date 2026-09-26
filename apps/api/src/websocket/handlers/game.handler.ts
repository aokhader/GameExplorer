import type { Server as SocketIOServer, Socket } from 'socket.io';
import { gameSessionService, newGameState, TIME_CONTROL_CONFIGS } from '../../services/gameSession.service';
import { clockService }       from '../../services/clock.service';
import { persistenceService, FALLBACK_USERNAME } from '../../services/persistence.service';
import { inviteService, inviteUrl } from '../../services/invite.service';
import { blockService }        from '../../services/block.service';
import { matchmakingService }  from '../../services/matchmaking.service';
import { onEvent, type SocketFailure } from '../../middleware/validation';

// Every listener below is registered through onEvent, so each one only ever
// sees a payload that matched its schema in schemas.ts: a game id is a UUID, a
// time control is one of five names, a move is on the board. onEvent also
// spends the sender's rate budget (websocket/limits.ts), which is why no
// handler here throttles itself. The checks inside the handlers are about
// *who* may do something, not about the payload's shape or rate.

// The invite hook in packages/client only reacts to INVITE_EXPIRED, so both
// invite events answer every failure with it — any other code would leave the
// player's "Creating link…" or "Joining…" state spinning forever.
const INVITE_UNAVAILABLE: SocketFailure = { code: 'INVITE_EXPIRED', message: 'This invite is no longer available' };
const INVITE_NOT_CREATED: SocketFailure = { code: 'INVITE_EXPIRED', message: 'Could not create an invite link. Try again.' };
const INVITE_LIMITED: SocketFailure     = { code: 'INVITE_EXPIRED', message: 'Too many invite attempts. Wait a minute and try again.' };

export function registerGameHandlers(io: SocketIOServer, socket: Socket) {
  const userId = socket.data.userId as string;

  // ── Rejoin active game (reconnect or page refresh) ────────────────────────
  onEvent(socket, 'join_game', async ({ gameId }) => {
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
  // A move that fails the schema gets the same answer applyMove gives a
  // malformed one. `move` is the parsed copy, so the `move_made` broadcast
  // below never relays extra keys a client tacked on.
  onEvent(socket, 'make_move', async ({ gameId, move }) => {
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
  }, { rejected: { code: 'ILLEGAL_MOVE', message: 'Malformed move' } });

  // ── Resign ────────────────────────────────────────────────────────────────
  onEvent(socket, 'resign', async ({ gameId }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session || session.status !== 'active') return;
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const result: import('@gameexplorer/shared').GameResult = session.whiteId === userId ? 'black_wins' : 'white_wins';
    const ratings = await gameSessionService.endGame(gameId, result, 'resign');
    if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result, reason: 'resign', ...ratings });
  });

  // ── Abort (early, no rating change) ───────────────────────────────────────
  onEvent(socket, 'abort_game', async ({ gameId }) => {
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
  onEvent(socket, 'offer_draw', async ({ gameId }) => {
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

  onEvent(socket, 'accept_draw', async ({ gameId }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!canAnswerDrawOffer(session)) return;

    await gameSessionService.clearDrawOffer(gameId);
    const ratings = await gameSessionService.endGame(gameId, 'draw', 'draw_agreement');
    if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result: 'draw', reason: 'draw_agreement', ...ratings });
  });

  onEvent(socket, 'decline_draw', async ({ gameId }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!canAnswerDrawOffer(session)) return;

    await gameSessionService.clearDrawOffer(gameId);
    socket.to(`game:${gameId}`).emit('draw_declined', { gameId });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  onEvent(socket, 'send_chat', async ({ gameId, text }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session) return;
    // Only participants may post chat (spectators receive, never send) — otherwise
    // a spectator's message is attributed to whichever player they aren't.
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const username = session.whiteId === userId ? session.whiteUsername : session.blackUsername;
    const safeText = text.slice(0, 200).replace(/[<>]/g, '');
    const msg = { gameId, userId, username, text: safeText, createdAt: new Date().toISOString() };
    io.to(`game:${gameId}`).emit('chat_message', msg);
  });

  // ── Emotes / reactions ─────────────────────────────────────────────────────
  // The schema only admits the shared EMOTES set, so no free text travels here.
  onEvent(socket, 'send_emote', async ({ gameId, emote }) => {
    const session = await gameSessionService.getGameSession(gameId);
    if (!session) return;
    // Only participants may broadcast emotes (spectators receive, never send).
    if (session.whiteId !== userId && session.blackId !== userId) return;

    const username = session.whiteId === userId ? session.whiteUsername : session.blackUsername;
    io.to(`game:${gameId}`).emit('emote_received', { gameId, userId, username, emote });
  });

  // ── Spectate ──────────────────────────────────────────────────────────────
  onEvent(socket, 'spectate', async ({ gameId }) => {
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

  // This was the listener one payload-less frame used to crash the process with
  // (GX-03). onEvent now rejects that frame before any handler code runs.
  onEvent(socket, 'leave_spectate', async ({ gameId }) => {
    socket.leave(`game:${gameId}`);
    socket.leave(`spectate:${gameId}`);
  });

  // ── Invites ───────────────────────────────────────────────────────────────
  // gameType and timeControl are checked here, at creation, so a bad value can
  // never be stored and later handed to createGame by whoever accepts (GX-06).
  onEvent(socket, 'create_invite_link', async ({ gameType, timeControl }) => {
    // Rating AND username are server-authoritative — fetched from Supabase, not
    // trusted from the client.
    const rating       = await persistenceService.getRating(userId, gameType);
    const safeUsername = (await persistenceService.getUsername(userId)) ?? FALLBACK_USERNAME;
    // Persist identity on the socket so a later same-socket flow can reuse it.
    socket.data.username = safeUsername;
    socket.data.rating   = rating;
    const inviteId = await inviteService.createInvite(userId, safeUsername, rating, gameType, timeControl);
    socket.emit('invite_link_created', { inviteId, url: inviteUrl(gameType, inviteId) });
  }, { limited: INVITE_LIMITED, rejected: INVITE_NOT_CREATED, failed: INVITE_NOT_CREATED });

  onEvent(socket, 'accept_invite', async ({ inviteId }) => {
    const res = await inviteService.checkInvite(inviteId, userId);
    if ('error' in res) { socket.emit('error', { code: 'INVITE_EXPIRED', message: res.error }); return; }

    const invite  = res.invite;

    // Don't start a game between users who have blocked each other.
    if (await blockService.isBlockedBetween(userId, invite.fromId)) {
      socket.emit('error', INVITE_UNAVAILABLE);
      return;
    }

    // One game at a time, for both players. Accepting mid-game used to
    // overwrite the player's active_game pointer and orphan the game they were
    // in. The invite is left in place, so it still works once they're free.
    // (createGame enforces the same rule atomically; these checks are here to
    // say which player is busy.)
    if (await gameSessionService.getLiveGameId(userId)) {
      socket.emit('error', { code: 'INVITE_EXPIRED', message: 'Finish your current game before accepting an invite.' });
      return;
    }
    if (await gameSessionService.getLiveGameId(invite.fromId)) {
      socket.emit('error', { code: 'INVITE_EXPIRED', message: 'Your friend is in another game right now. Try the link again later.' });
      return;
    }

    // Only now is the invite used up, and only by one acceptor.
    if (!(await inviteService.claimInvite(inviteId))) {
      socket.emit('error', { code: 'INVITE_EXPIRED', message: 'Invite not found or expired' });
      return;
    }

    // Rating AND username are server-authoritative — from Supabase, not the client.
    const rating       = await persistenceService.getRating(userId, invite.gameType);
    const safeUsername = (await persistenceService.getUsername(userId)) ?? FALLBACK_USERNAME;

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
    // Neither player can be matched into a second game while this one runs.
    await Promise.all([
      matchmakingService.removeFromAllQueues(userId),
      matchmakingService.removeFromAllQueues(invite.fromId),
    ]);

    const tcConfig     = TIME_CONTROL_CONFIGS[invite.timeControl];
    const clocks       = await clockService.getSnapshot(gameId);
    // Both players start from the same authoritative initial state. (Previously
    // the inviter was sent `initialState: null`, leaving their board empty.)
    const initialState = newGameState(invite.gameType);

    socket.join(`game:${gameId}`);
    socket.emit('game_started', { gameId, gameType: invite.gameType, initialState, myColor: 'black', opponent: { userId: invite.fromId, username: invite.fromUsername, rating: Number(invite.fromRating) }, clocks, timeControlConfig: tcConfig });

    io.to(`user:${invite.fromId}`).emit('game_started', { gameId, gameType: invite.gameType, initialState, myColor: 'white', opponent: { userId, username: safeUsername, rating: rating ?? 1200 }, clocks, timeControlConfig: tcConfig });
    io.to(`user:${invite.fromId}`).socketsJoin(`game:${gameId}`);

    await clockService.startClock(gameId);
  }, { limited: INVITE_LIMITED, rejected: INVITE_UNAVAILABLE, failed: INVITE_UNAVAILABLE });
}
