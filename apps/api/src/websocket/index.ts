// Websocket setup
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { verifySocketToken } from './middleware/auth.middleware';
import { registerGameHandlers } from './handlers/game.handler';
import { registerMatchmakingHandlers } from './handlers/matchmaking.handler';

let io: SocketIOServer;

export function initializeWebSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(verifySocketToken);

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // Register event handlers
    registerGameHandlers(io, socket);
    registerMatchmakingHandlers(io, socket);

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}