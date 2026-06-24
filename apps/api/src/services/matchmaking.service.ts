import { redis, scanKeys } from '../config/redis';
import type { GameType, TimeControl, UserSummary } from '@gameexplorer/shared';

const GRACE_EXPAND_EVERY_MS  = 15_000; // expand ELO window every 15s
const GRACE_EXPAND_STEP      = 50;     // expand by ±50 each step
const GRACE_MAX              = 400;    // cap at ±400

function queueKey(gameType: GameType, timeControl: TimeControl, rated: boolean) {
  return `matchmaking:${gameType}:${timeControl}:${rated ? '1' : '0'}`;
}

function metaKey(userId: string, gameType: GameType) {
  return `queue_meta:${userId}:${gameType}`;
}

export interface QueueEntry {
  userId:      string;
  username:    string;
  rating:      number;
  gameType:    GameType;
  timeControl: TimeControl;
  rated:       boolean;
  joinedAt:    number; // unix ms
}

export const matchmakingService = {
  async addToQueue(entry: QueueEntry): Promise<void> {
    const key = queueKey(entry.gameType, entry.timeControl, entry.rated);
    await redis.zadd(key, entry.rating, entry.userId);
    await redis.hset(metaKey(entry.userId, entry.gameType), {
      username:    entry.username,
      rating:      String(entry.rating),
      timeControl: entry.timeControl,
      rated:       entry.rated ? '1' : '0',
      joinedAt:    String(entry.joinedAt),
    });
  },

  async removeFromQueue(userId: string, gameType: GameType, timeControl: TimeControl, rated: boolean): Promise<void> {
    await redis.zrem(queueKey(gameType, timeControl, rated), userId);
    await redis.del(metaKey(userId, gameType));
  },

  async getQueueMeta(userId: string, gameType: GameType): Promise<Record<string, string> | null> {
    const data = await redis.hgetall(metaKey(userId, gameType));
    return Object.keys(data).length > 0 ? data : null;
  },

  /** Returns opponent's QueueEntry if a match was found, else null. */
  async findMatch(entry: QueueEntry): Promise<QueueEntry | null> {
    const key = queueKey(entry.gameType, entry.timeControl, entry.rated);
    const elapsedMs = Date.now() - entry.joinedAt;
    const expansions = Math.floor(elapsedMs / GRACE_EXPAND_EVERY_MS);
    const window     = Math.min(100 + expansions * GRACE_EXPAND_STEP, GRACE_MAX);

    const candidates = await redis.zrangebyscore(
      key,
      entry.rating - window,
      entry.rating + window,
    );

    // Exclude blocked users (either direction). The set is cached in Redis when
    // a user joins the queue (blockService.cacheBlockSet) and holds every user
    // in a block relationship with `entry.userId`.
    const blocked = new Set(await redis.smembers(`blockset:${entry.userId}`));

    for (const candidateId of candidates) {
      if (candidateId === entry.userId) continue;
      if (blocked.has(candidateId)) continue;

      const meta = await this.getQueueMeta(candidateId, entry.gameType);
      if (!meta) continue;

      return {
        userId:      candidateId,
        username:    meta.username,
        rating:      Number(meta.rating),
        gameType:    entry.gameType,
        timeControl: meta.timeControl as TimeControl,
        rated:       meta.rated === '1',
        joinedAt:    Number(meta.joinedAt),
      };
    }

    return null;
  },

  /** Scans all active queue keys and returns pairs ready to be matched. */
  async scanForPairs(): Promise<Array<{ a: QueueEntry; b: QueueEntry }>> {
    const keys = await scanKeys('matchmaking:*');
    const pairs: Array<{ a: QueueEntry; b: QueueEntry }> = [];
    const matched = new Set<string>();

    for (const key of keys) {
      const members = await redis.zrange(key, 0, -1, 'WITHSCORES');
      // members is [userId, score, userId, score, ...]
      for (let i = 0; i < members.length; i += 2) {
        const userId = members[i];
        if (matched.has(userId)) continue;

        const parts    = key.split(':');
        const gameType = parts[1] as GameType;
        const meta     = await this.getQueueMeta(userId, gameType);
        if (!meta) continue;

        const entry: QueueEntry = {
          userId,
          username:    meta.username,
          rating:      Number(meta.rating),
          gameType:    parts[1] as GameType,
          timeControl: parts[2] as TimeControl,
          rated:       parts[3] === '1',
          joinedAt:    Number(meta.joinedAt),
        };

        const opponent = await this.findMatch(entry);
        if (opponent && !matched.has(opponent.userId)) {
          matched.add(userId);
          matched.add(opponent.userId);

          // Remove both from queue
          await this.removeFromQueue(userId,           entry.gameType, entry.timeControl, entry.rated);
          await this.removeFromQueue(opponent.userId,  entry.gameType, entry.timeControl, entry.rated);

          pairs.push({ a: entry, b: opponent });
        }
      }
    }

    return pairs;
  },
};
