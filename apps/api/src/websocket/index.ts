import { Server as HTTPServer }     from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger }                   from '../utils/logger';
import { verifySocketToken }        from './middleware/auth.middleware';
import { registerGameHandlers }     from './handlers/game.handler';
import { registerMatchmakingHandlers } from './handlers/matchmaking.handler';
import { gameSessionService, TIME_CONTROL_CONFIGS } from '../services/gameSession.service';
import { clockService }             from '../services/clock.service';
import { matchmakingService }       from '../services/matchmaking.service';
import { scanKeys }                 from '../config/redis';
import { corsOrigin }               from '../config/cors';
import type { ClientToServerEvents, ServerToClientEvents, GameResult } from '@finesse/shared';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
let matchmakingTimer: NodeJS.Timeout | undefined;
let clockTimer: NodeJS.Timeout | undefined;

const DISCONNECT_GRACE_TTL = 60;

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
  });

  io.use(verifySocketToken);

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
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
        const activeGameId = await gameSessionService.getActiveGameId(userId);
        if (!activeGameId) return;
        // If the user still has another live socket (they already reconnected, or
        // have the game open in another tab), this disconnect is a no-op — don't
        // pause/forfeit. Excludes the socket that is currently disconnecting.
        const remaining = (await io.in(`user:${userId}`).fetchSockets()).filter(s => s.id !== socket.id);
        if (remaining.length > 0) return;
        const session = await gameSessionService.getGameSession(activeGameId);
        if (session && session.status === 'active') {
          await clockService.pauseClock(activeGameId);
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
      for (const { a, b } of pairs) {
        const gameId = await gameSessionService.createGame(
          a.userId, b.userId,
          a.username, b.username,
          a.rating, b.rating,
          a.gameType, a.timeControl,
          a.rated,
        );
        const tcConfig = TIME_CONTROL_CONFIGS[a.timeControl];
        const clocks   = await clockService.getSnapshot(gameId);
        const { ChessEngine, CheckersEngine, ReversiEngine } = await import('@finesse/shared');
        const initial =
          a.gameType === 'chess'    ? ChessEngine.newGame()    :
          a.gameType === 'checkers' ? CheckersEngine.newGame() :
          ReversiEngine.newGame();

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
    } catch (err) {
      logger.error('Matchmaking loop error:', err);
    }
  }, 500);
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

          const result: import('@finesse/shared').GameResult =
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
