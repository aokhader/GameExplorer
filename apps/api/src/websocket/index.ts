import { Server as HTTPServer }     from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger }                   from '../utils/logger';
import { verifySocketToken }        from './middleware/auth.middleware';
import { registerGameHandlers }     from './handlers/game.handler';
import { registerMatchmakingHandlers } from './handlers/matchmaking.handler';
import { gameSessionService, newGameState, AlreadyInGameError, TIME_CONTROL_CONFIGS } from '../services/gameSession.service';
import { clockService }             from '../services/clock.service';
import { matchmakingService, type QueueEntry } from '../services/matchmaking.service';
import { scanKeys }                 from '../config/redis';
import { corsOrigin }               from '../config/cors';
import { clientIp }                 from '../utils/clientIp';
import { SOCKET_LIMITS, take, socketCount, trackSocketOpen, trackSocketClose } from './limits';
import type { Request } from 'express';
import type { ClientToServerEvents, ServerToClientEvents, GameResult } from '@gameexplorer/shared';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
let matchmakingTimer: NodeJS.Timeout | undefined;
let clockTimer: NodeJS.Timeout | undefined;

const DISCONNECT_GRACE_TTL = 60;

// The largest real message is a chat line (200 characters, so under 1 KB even
// as emoji). engine.io's default is 1 MB, which let every payload in the audit's
// key-stuffing attacks arrive and be parsed at nearly a megabyte apiece (WS5-16).
// A frame over this closes that connection. It also bounds the handshake, which
// carries the access token: Supabase JWTs are 1–3 KB, so there is ample room.
export const MAX_SOCKET_MESSAGE_BYTES = 16 * 1024;

// Pending disconnect-forfeit timers, keyed by `${gameId}:${userId}`. When a
// player drops mid-game they have DISCONNECT_GRACE_TTL seconds to reconnect
// before the timer fires and forfeits the game; reconnecting cancels it.
// In-memory is correct here: this is a single-instance deployment and
// in-progress games live only in (ephemeral) Redis, so a restart wipes both.
const forfeitTimers = new Map<string, NodeJS.Timeout>();

function cancelForfeit(gameId: string, userId: string): void {
  const key = `${gameId}:${userId}`;
  const t = forfeitTimers.get(key);
  if (t) { clearTimeout(t); forfeitTimers.delete(key); }
}

function scheduleForfeit(gameId: string, userId: string): void {
  cancelForfeit(gameId, userId);
  forfeitTimers.set(`${gameId}:${userId}`, setTimeout(() => { void runForfeit(gameId, userId); }, DISCONNECT_GRACE_TTL * 1000));
}

async function runForfeit(gameId: string, userId: string): Promise<void> {
  forfeitTimers.delete(`${gameId}:${userId}`);
  // Did the player reconnect (any live socket in their personal room)? If so, no forfeit.
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  if (sockets.length > 0) return;
  const session = await gameSessionService.getGameSession(gameId);
  if (!session || session.status !== 'active') return;
  const result: GameResult = session.whiteId === userId ? 'black_wins' : 'white_wins';
  const ratings = await gameSessionService.endGame(gameId, result, 'disconnect');
  if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result, reason: 'disconnect', ...ratings });
}

export function initializeWebSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin:      corsOrigin,
      credentials: true,
    },
    maxHttpBufferSize: MAX_SOCKET_MESSAGE_BYTES,
  });

  // Counted per address before the token is checked, so a connection storm
  // costs a map lookup rather than a signature verification each (WS5-10).
  // The express limiters never saw this path: they are mounted on /api only.
  io.use((socket, next) => {
    const ip = clientIp(socket.request as unknown as Request);
    if (take(`handshake:${ip}`, SOCKET_LIMITS.handshakesPerIp)) return next();
    next(new Error('Too many connection attempts. Wait a minute and try again.'));
  });

  io.use(verifySocketToken);

  // Every event budget is per user, but each socket also costs memory and a
  // share of every broadcast, so the number of them is capped too (WS5-10).
  // A middleware error reaches the client as a final connect_error, which the
  // socket store shows as-is.
  io.use((socket, next) => {
    if (socketCount(socket.data.userId as string) < SOCKET_LIMITS.socketsPerUser) return next();
    next(new Error('Too many open connections. Close another tab and try again.'));
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;

    // The middleware above can be outrun by handshakes that finish together,
    // so the count is checked again here, synchronously, before it changes.
    if (socketCount(userId) >= SOCKET_LIMITS.socketsPerUser) {
      socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many open connections. Close another tab and try again.' });
      socket.disconnect(true);
      return;
    }
    trackSocketOpen(userId);
    // Registered before the first await: a socket that closes during the
    // auto-reconnect below must still be counted out.
    socket.once('disconnect', () => trackSocketClose(userId));

    logger.info(`Client connected: ${socket.id} (user ${userId})`);

    // Join personal room for direct messages
    socket.join(`user:${userId}`);

    // Auto-reconnect to active game if any
    try {
      const activeGameId = await gameSessionService.getActiveGameId(userId);
      if (activeGameId) {
        const session = await gameSessionService.getGameSession(activeGameId);
        if (session && session.status === 'active') {
          socket.join(`game:${activeGameId}`);
          const myColor     = session.whiteId === userId ? 'white' : 'black';
          const oppId       = myColor === 'white' ? session.blackId       : session.whiteId;
          const oppUsername = myColor === 'white' ? session.blackUsername : session.whiteUsername;
          const oppRating   = myColor === 'white' ? Number(session.blackRating) : Number(session.whiteRating);
          const clocks      = await clockService.getSnapshot(activeGameId);

          socket.emit('game_started', {
            gameId:           activeGameId,
            gameType:         session.gameType,
            initialState:     JSON.parse(session.state),
            myColor,
            opponent:         { userId: oppId, username: oppUsername, rating: oppRating },
            clocks,
            timeControlConfig: TIME_CONTROL_CONFIGS[session.timeControl],
          });

          cancelForfeit(activeGameId, userId);
          socket.to(`game:${activeGameId}`).emit('opponent_reconnected', { gameId: activeGameId });

          // The clock no longer stops on a disconnect (GX-07), so this only
          // starts one that never started: a reconnect inside the brief gap
          // between a match and its first tick.
          if (!(await clockService.isRunning(activeGameId))) {
            await clockService.startClock(activeGameId);
          }
        }
      }
    } catch (err) {
      logger.error('Auto-reconnect error:', err);
    }

    registerGameHandlers(io, socket);
    registerMatchmakingHandlers(io, socket);

    socket.on('disconnect', async () => {
      logger.info(`Client disconnected: ${socket.id} (user ${userId})`);

      try {
        // If the user still has another live socket (they already reconnected, or
        // have the game open in another tab), this disconnect is a no-op — don't
        // forfeit or dequeue. Excludes the socket that is currently disconnecting.
        const remaining = (await io.in(`user:${userId}`).fetchSockets()).filter(s => s.id !== socket.id);
        if (remaining.length > 0) return;

        // Nobody is left to receive a match. The clients only send leave_queue
        // from the Cancel button, so before this a closed tab stayed queued with
        // no expiry, and the next player to queue could be paired with an
        // opponent who would never move — nothing ends that game but the absent
        // player's clock running out.
        await matchmakingService.removeFromAllQueues(userId);

        const activeGameId = await gameSessionService.getActiveGameId(userId);
        if (!activeGameId) return;
        const session = await gameSessionService.getGameSession(activeGameId);
        // The clock keeps running (GX-07). It used to pause here and restart on
        // reconnect, so dropping the connection on your own move stopped your
        // clock: up to a minute of free thinking time per disconnect, as often
        // as you liked, and a player who cycled 59 seconds off and one on could
        // hold an opponent in a game that never ended. Now being away costs
        // your own time, as on every chess server, and the grace timer only
        // decides when absence becomes a forfeit.
        if (session && session.status === 'active') {
          socket.to(`game:${activeGameId}`).emit('opponent_disconnected', { gameId: activeGameId, graceMs: DISCONNECT_GRACE_TTL * 1000 });
          scheduleForfeit(activeGameId, userId);
        }
      } catch (err) {
        logger.error('Disconnect handler error:', err);
      }
    });
  });

  startMatchmakingLoop();
  startClockLoop();

  return io;
}

export function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/** Stops the polling loops and closes the Socket.io server (graceful shutdown + tests). */
export async function shutdownWebSocket(): Promise<void> {
  if (matchmakingTimer) clearInterval(matchmakingTimer);
  if (clockTimer)       clearInterval(clockTimer);
  matchmakingTimer = clockTimer = undefined;
  for (const t of forfeitTimers.values()) clearTimeout(t);
  forfeitTimers.clear();
  if (io) await new Promise<void>(resolve => io.close(() => resolve()));
}

// ── Matchmaking loop ──────────────────────────────────────────────────────────

function startMatchmakingLoop() {
  matchmakingTimer = setInterval(async () => {
    try {
      const pairs = await matchmakingService.scanForPairs();
      // One pair failing must not abandon the rest of the batch, which is what
      // a throw out of this loop used to do to every pair after it.
      for (const { a, b } of pairs) {
        try {
          await startMatch(a, b);
        } catch (err) {
          if (!(err instanceof AlreadyInGameError)) { logger.error('Could not start a matched game:', err); continue; }
          // One of them started a game some other way (an invite) while still
          // queued. The other did nothing wrong: put them back, keeping their
          // place in the widening rating window.
          const other = err.userId === a.userId ? b : a;
          if (!(await gameSessionService.getLiveGameId(other.userId))) await matchmakingService.addToQueue(other);
        }
      }
    } catch (err) {
      logger.error('Matchmaking loop error:', err);
    }
  }, 500);
}

async function startMatch(a: QueueEntry, b: QueueEntry): Promise<void> {
  const gameId = await gameSessionService.createGame(
    a.userId, b.userId,
    a.username, b.username,
    a.rating, b.rating,
    a.gameType, a.timeControl,
    a.rated,
  );
  // Someone queued for two games at once is taken out of the other.
  await Promise.all([
    matchmakingService.removeFromAllQueues(a.userId),
    matchmakingService.removeFromAllQueues(b.userId),
  ]);
  const tcConfig = TIME_CONTROL_CONFIGS[a.timeControl];
  const clocks   = await clockService.getSnapshot(gameId);
  const initial  = newGameState(a.gameType);

  io.to(`user:${a.userId}`).emit('match_found', { gameId, opponent: { userId: b.userId, username: b.username, rating: b.rating }, color: 'white', timeControlConfig: tcConfig });
  io.to(`user:${b.userId}`).emit('match_found', { gameId, opponent: { userId: a.userId, username: a.username, rating: a.rating }, color: 'black', timeControlConfig: tcConfig });

  await new Promise(r => setTimeout(r, 500)); // brief pause before game_started

  io.to(`user:${a.userId}`).socketsJoin(`game:${gameId}`);
  io.to(`user:${b.userId}`).socketsJoin(`game:${gameId}`);
  await clockService.startClock(gameId);

  io.to(`user:${a.userId}`).emit('game_started', { gameId, gameType: a.gameType, initialState: initial, myColor: 'white', opponent: { userId: b.userId, username: b.username, rating: b.rating }, clocks, timeControlConfig: tcConfig });
  io.to(`user:${b.userId}`).emit('game_started', { gameId, gameType: a.gameType, initialState: initial, myColor: 'black', opponent: { userId: a.userId, username: a.username, rating: a.rating }, clocks, timeControlConfig: tcConfig });

  logger.info(`Match created: ${gameId} (${a.username} vs ${b.username})`);
}

// ── Clock sync loop ───────────────────────────────────────────────────────────

function startClockLoop() {
  clockTimer = setInterval(async () => {
    try {
      const keys = await scanKeys('clock:*');
      for (const key of keys) {
        const gameId  = key.slice(6);
        const running = await clockService.isRunning(gameId);
        if (!running) continue;

        const clocks = await clockService.getSnapshot(gameId);
        io.to(`game:${gameId}`).emit('clock_sync', { gameId, clocks });

        // Check for flag
        const hasFlagged = clocks.active_color === 'white' ? clocks.white_ms <= 0 : clocks.black_ms <= 0;
        if (hasFlagged) {
          const session = await gameSessionService.getGameSession(gameId);
          if (!session || session.status !== 'active') continue;

          const result: import('@gameexplorer/shared').GameResult =
            clocks.active_color === 'white' ? 'black_wins' : 'white_wins';
          const ratings = await gameSessionService.endGame(gameId, result, 'flag');
          if (ratings) io.to(`game:${gameId}`).emit('game_ended', { gameId, result, reason: 'flag', ...ratings });
        }
        // Disconnect grace/forfeit is handled by reconnect-aware timers
        // (scheduleForfeit / cancelForfeit), not this loop.
      }
    } catch (err) {
      logger.error('Clock loop error:', err);
    }
  }, 3000);
}
