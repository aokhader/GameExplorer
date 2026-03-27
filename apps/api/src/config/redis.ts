import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client with production-ready configuration
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect when Redis is in READONLY mode
      return true;
    }
    return false;
  },
  // Connection pool settings
  lazyConnect: false,
  keepAlive: 30000,
  enableReadyCheck: true,
});

// Event handlers
redis.on('connect', () => {
  logger.info('✅ Redis connecting');
});

redis.on('ready', () => {
  logger.info('✅ Redis ready');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

// Health check
export async function checkRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function disconnectRedis() {
  await redis.quit();
  logger.info('Redis disconnected');
}

// Utility functions for common operations
export const RedisService = {
  // Session management
  async setSession(userId: string, sessionData: any, ttl: number = 604800) {
    const key = `session:${userId}`;
    await redis.setex(key, ttl, JSON.stringify(sessionData));
  },

  async getSession(userId: string) {
    const key = `session:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  async deleteSession(userId: string) {
    const key = `session:${userId}`;
    await redis.del(key);
  },

  // Game state caching
  async setGameState(gameId: string, state: any, ttl: number = 3600) {
    const key = `game:${gameId}`;
    await redis.setex(key, ttl, JSON.stringify(state));
  },

  async getGameState(gameId: string) {
    const key = `game:${gameId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  // Matchmaking queue (sorted set by rating)
  async addToMatchmaking(gameType: string, userId: string, rating: number) {
    const key = `matchmaking:${gameType}`;
    await redis.zadd(key, rating, userId);
  },

  async removeFromMatchmaking(gameType: string, userId: string) {
    const key = `matchmaking:${gameType}`;
    await redis.zrem(key, userId);
  },

  async getMatchmakingQueue(gameType: string, ratingMin: number, ratingMax: number) {
    const key = `matchmaking:${gameType}`;
    return await redis.zrangebyscore(key, ratingMin, ratingMax);
  },

  // Leaderboard (sorted set by rating)
  async updateLeaderboard(gameType: string, userId: string, rating: number) {
    const key = `leaderboard:${gameType}`;
    await redis.zadd(key, rating, userId);
  },

  async getLeaderboard(gameType: string, limit: number = 100) {
    const key = `leaderboard:${gameType}`;
    return await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
  },

  async getUserRank(gameType: string, userId: string) {
    const key = `leaderboard:${gameType}`;
    const rank = await redis.zrevrank(key, userId);
    return rank !== null ? rank + 1 : null; // Convert to 1-based ranking
  },

  // Rate limiting
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `ratelimit:${identifier}`;
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.pexpire(key, windowMs);
    }
    
    const remaining = Math.max(0, limit - current);
    return {
      allowed: current <= limit,
      remaining,
    };
  },
};