// Entry point for the API server
// NOTE: ./config/env must be imported FIRST so dotenv populates process.env
// before modules like ./config/database (which read env at import time) load.
import './config/env';
import { createServer } from 'http';
import app from './app';
import { initializeWebSocket, shutdownWebSocket } from './websocket';
import { checkDatabaseConnection, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 4000;

// Safety net: a rejected promise in an async socket.io listener (which the
// library does not await) would otherwise surface as an unhandled rejection and
// can tear down the single API instance. Log and keep serving instead.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

async function startServer() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('✅ Database connected');

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize WebSocket
    initializeWebSocket(httpServer);

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📡 WebSocket ready on ws://localhost:${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} signal received: closing HTTP server`);
      
      await shutdownWebSocket();

      httpServer.close(async () => {
        logger.info('HTTP server closed');

        // Disconnect from database
        await disconnectDatabase();
        logger.info('Database disconnected');
        
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();