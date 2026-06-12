import { Server as HTTPServer }     from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger }                   from '../utils/logger';
import { verifySocketToken }        from './middleware/auth.middleware';
import { registerGameHandlers }     from './handlers/game.handler';
import { registerMatchmakingHandlers } from './handlers/matchmaking.handler';
import { gameSessionService, TIME_CONTROL_CONFIGS } from '../services/gameSession.service';
import { clockService }             from '../services/clock.service';
import { matchmakingService }       from '../services/matchmaking.service';
import { redis, scanKeys }          from '../config/redis';
import type { ClientToServerEvents, ServerToClientEvents } from '@gameexplorer/shared';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
let matchmakingTimer: NodeJS.Timeout | undefined;
let clockTimer: NodeJS.Timeout | undefined;

const DISCONNECT_GRACE_TTL = 60;

export function initializeWebSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin:      process.env.CORS_ORIGIN || 'http://localhost:3000',
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

          await redis.del(`disconnect_grace:${activeGameId}:${userId}`);
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
        if (activeGameId) {
          const session = await gameSessionService.getGameSession(activeGameId);
          if (session && session.status === 'active') {
            await clockService.pauseClock(activeGameId);
            await redis.set(`disconnect_grace:${activeGameId}:${userId}`, '', 'EX', DISCONNECT_GRACE_TTL);
            socket.to(`game:${activeGameId}`).emit('opponent_disconnected', { gameId: activeGameId, graceMs: DISCONNECT_GRACE_TTL * 1000 });
          }
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
        const { ChessEngine, CheckersEngine, ReversiEngine } = await import('@gameexplorer/shared');
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

          const result: import('@gameexplorer/shared').GameResult =
            clocks.active_color === 'white' ? 'black_wins' : 'white_wins';
          const ratings = await gameSessionService.endGame(gameId, result, 'flag');
          io.to(`game:${gameId}`).emit('game_ended', { gameId, result, reason: 'flag', ...ratings });
        }

        // Check disconnect expiry
        const sessions = await gameSessionService.getGameSession(gameId);
        if (!sessions) continue;
        for (const pid of [sessions.whiteId, sessions.blackId]) {
          const graceKey = `disconnect_grace:${gameId}:${pid}`;
          const exists   = await redis.exists(graceKey);
          if (!exists) {
            const graceSet = await redis.get(`disconnect_tracked:${gameId}:${pid}`);
            if (graceSet) {
              // Grace expired — forfeit
              await redis.del(`disconnect_tracked:${gameId}:${pid}`);
              const forfeitResult: import('@gameexplorer/shared').GameResult =
                sessions.whiteId === pid ? 'black_wins' : 'white_wins';
              const ratings = await gameSessionService.endGame(gameId, forfeitResult, 'disconnect');
              io.to(`game:${gameId}`).emit('game_ended', { gameId, result: forfeitResult, reason: 'disconnect', ...ratings });
            }
          } else {
            await redis.set(`disconnect_tracked:${gameId}:${pid}`, '1', 'EX', 120);
          }
        }
      }
    } catch (err) {
      logger.error('Clock loop error:', err);
    }
  }, 3000);
}
