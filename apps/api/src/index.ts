// Entry point for the API server
import dotenv from 'dotenv';
import { createServer } from 'http';
import app from './app';
import { initializeWebSocket } from './websocket';
import { logger } from './utils/logger';

dotenv.config();

const PORT = process.env.PORT || 4000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket
initializeWebSocket(httpServer);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📡 WebSocket ready on ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});