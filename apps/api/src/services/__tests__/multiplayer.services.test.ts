import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── In-memory Redis fake ──────────────────────────────────────────────────────
// Implements the subset of ioredis commands the multiplayer services use, so the
// services can be exercised without a live Redis. Mocked at the same module
// specifier the services import (`../config/redis`), so they share this instance.
vi.mock('../../config/redis', () => {
  const strings = new Map<string, string>();
  const hashes  = new Map<string, Map<string, string>>();
  const zsets   = new Map<string, Map<string, number>>();

  const globToRe = (pat: string) =>
    new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

  const redis = {
    async hset(key: string, ...args: any[]) {
      let h = hashes.get(key);
      if (!h) { h = new Map(); hashes.set(key, h); }
      if (args.length === 1 && typeof args[0] === 'object') {
        for (const [k, v] of Object.entries(args[0])) h.set(k, String(v));
      } else {
        for (let i = 0; i < args.length; i += 2) h.set(String(args[i]), String(args[i + 1]));
      }
      return 1;
    },
    async hget(key: string, field: string) { return hashes.get(key)?.get(field) ?? null; },
    async hgetall(key: string) {
      const h = hashes.get(key);
      return h ? Object.fromEntries(h.entries()) : {};
    },
    async set(key: string, val: string) { strings.set(key, String(val)); return 'OK'; },
    async get(key: string) { return strings.get(key) ?? null; },
    async del(...keys: string[]) {
      let n = 0;
      for (const key of keys) {
        if (strings.delete(key)) n++;
        if (hashes.delete(key)) n++;
        if (zsets.delete(key)) n++;
      }
      return n;
    },
    async exists(key: string) {
      return (strings.has(key) || hashes.has(key) || zsets.has(key)) ? 1 : 0;
    },
    async expire() { return 1; },
    async pexpire() { return 1; },
    async incr(key: string) {
      const n = Number(strings.get(key) ?? '0') + 1;
      strings.set(key, String(n));
      return n;
    },
    async zadd(key: string, score: number, member: string) {
      let z = zsets.get(key);
      if (!z) { z = new Map(); zsets.set(key, z); }
      const isNew = !z.has(member);
      z.set(member, Number(score));
      return isNew ? 1 : 0;
    },
    async zrem(key: string, member: string) { return zsets.get(key)?.delete(member) ? 1 : 0; },
    async zrangebyscore(key: string, min: number, max: number) {
      const z = zsets.get(key);
      if (!z) return [];
      return [...z.entries()]
        .filter(([, s]) => s >= min && s <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([m]) => m);
    },
    async zrange(key: string, start: number, stop: number, withScores?: string) {
      const z = zsets.get(key);
      if (!z) return [];
      const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
      const end = stop === -1 ? sorted.length : stop + 1;
      const slice = sorted.slice(start, end);
      if (withScores && withScores.toUpperCase() === 'WITHSCORES') {
        return slice.flatMap(([m, s]) => [m, String(s)]);
      }
      return slice.map(([m]) => m);
    },
    async keys(pattern: string) {
      const re = globToRe(pattern);
      const all = new Set<string>([...strings.keys(), ...hashes.keys(), ...zsets.keys()]);
      return [...all].filter(k => re.test(k));
    },
    async flushall() { strings.clear(); hashes.clear(); zsets.clear(); return 'OK'; },
  };

  return {
    redis,
    RedisService: {},
    // Real impl iterates with SCAN; the mock just filters the in-memory keys.
    scanKeys: async (pattern: string) => redis.keys(pattern),
    checkRedisConnection: async () => true,
    disconnectRedis: async () => {},
  };
});

import { redis } from '../../config/redis';
import { matchmakingService, type QueueEntry } from '../matchmaking.service';
import { clockService } from '../clock.service';
import { inviteService } from '../invite.service';
import type { TimeControlConfig } from '@gameexplorer/shared';

beforeEach(async () => { await (redis as any).flushall(); });

function entry(over: Partial<QueueEntry>): QueueEntry {
  return {
    userId:      'u',
    username:    'u',
    rating:      1200,
    gameType:    'chess',
    timeControl: 'blitz',
    rated:       true,
    joinedAt:    Date.now(),
    ...over,
  };
}

// ── Matchmaking ───────────────────────────────────────────────────────────────
describe('matchmakingService.scanForPairs', () => {
  it('pairs two similarly-rated players in the same queue', async () => {
    await matchmakingService.addToQueue(entry({ userId: 'a', username: 'a', rating: 1200 }));
    await matchmakingService.addToQueue(entry({ userId: 'b', username: 'b', rating: 1230 }));

    const pairs = await matchmakingService.scanForPairs();
    expect(pairs).toHaveLength(1);
    const ids = [pairs[0].a.userId, pairs[0].b.userId].sort();
    expect(ids).toEqual(['a', 'b']);

    // Both removed from the queue, so a second scan finds nothing.
    expect(await matchmakingService.scanForPairs()).toHaveLength(0);
  });

  it('does not pair players outside the initial ELO window', async () => {
    await matchmakingService.addToQueue(entry({ userId: 'a', rating: 1200 }));
    await matchmakingService.addToQueue(entry({ userId: 'b', rating: 1600 }));
    expect(await matchmakingService.scanForPairs()).toHaveLength(0);
  });

  it('expands the ELO window the longer a player waits', async () => {
    const old = Date.now() - 60_000; // 4 expansions → window ±300
    await matchmakingService.addToQueue(entry({ userId: 'a', rating: 1200, joinedAt: old }));
    await matchmakingService.addToQueue(entry({ userId: 'b', rating: 1500, joinedAt: old }));
    expect(await matchmakingService.scanForPairs()).toHaveLength(1);
  });

  it('keeps different time controls in separate queues', async () => {
    await matchmakingService.addToQueue(entry({ userId: 'a', rating: 1200, timeControl: 'blitz' }));
    await matchmakingService.addToQueue(entry({ userId: 'b', rating: 1200, timeControl: 'rapid' }));
    expect(await matchmakingService.scanForPairs()).toHaveLength(0);
  });

  it('removes a player from the queue on leave', async () => {
    await matchmakingService.addToQueue(entry({ userId: 'a' }));
    await matchmakingService.removeFromQueue('a', 'chess', 'blitz', true);
    expect(await matchmakingService.getQueueMeta('a', 'chess')).toBeNull();
  });
});

// ── Clock ─────────────────────────────────────────────────────────────────────
const blitz: TimeControlConfig = { id: 'blitz', label: 'Blitz', description: '', initialMs: 180_000, incrementMs: 2000, isMoveTimer: false };
const moveTimer: TimeControlConfig = { id: 'movetime', label: 'Normal', description: '', initialMs: 30_000, incrementMs: 0, isMoveTimer: true, moveTimerMs: 30_000 };

describe('clockService', () => {
  it('initializes both clocks with white to move and not running', async () => {
    await clockService.initClock('g1', blitz);
    const snap = await clockService.getSnapshot('g1');
    expect(snap.white_ms).toBe(180_000);
    expect(snap.black_ms).toBe(180_000);
    expect(snap.active_color).toBe('white');
    expect(await clockService.isRunning('g1')).toBe(false);
  });

  it('switches the active side and applies increment on a move', async () => {
    await clockService.initClock('g2', blitz);
    await clockService.startClock('g2');
    const { clocks, flagged } = await clockService.deductAndSwitch('g2');
    expect(flagged).toBe(false);
    expect(clocks.active_color).toBe('black');
    // White got the +2s increment minus the tiny elapsed time since startClock.
    expect(clocks.white_ms).toBeGreaterThan(180_000);
    expect(clocks.white_ms).toBeLessThanOrEqual(182_000);
  });

  it('resets the mover’s clock to the per-move budget in move-timer mode', async () => {
    await clockService.initClock('g3', moveTimer);
    await clockService.startClock('g3');
    const { clocks } = await clockService.deductAndSwitch('g3');
    expect(clocks.white_ms).toBe(30_000);
    expect(clocks.active_color).toBe('black');
  });

  it('flags the active player when their time is exhausted', async () => {
    await clockService.initClock('g4', { ...blitz, initialMs: 0 });
    const { flagged, clocks } = await clockService.deductAndSwitch('g4');
    expect(flagged).toBe(true);
    expect(clocks.active_color).toBe('white'); // side stays on the flagged player
  });
});

// ── Invites ───────────────────────────────────────────────────────────────────
describe('inviteService', () => {
  it('creates and reads back an invite', async () => {
    const id = await inviteService.createInvite('host', 'Host', 1300, 'chess', 'blitz');
    expect(id).toHaveLength(8);
    const data = await inviteService.getInvite(id);
    expect(data).toMatchObject({ fromId: 'host', fromUsername: 'Host', fromRating: '1300', gameType: 'chess' });
  });

  it('lets a different user accept once, then expires the invite', async () => {
    const id = await inviteService.createInvite('host', 'Host', 1300, 'reversi', 'rapid');
    const res = await inviteService.acceptInvite(id, 'guest');
    expect('invite' in res && res.invite.fromId).toBe('host');
    // Single-use: a second accept fails.
    const again = await inviteService.acceptInvite(id, 'guest2');
    expect('error' in again).toBe(true);
  });

  it('rejects accepting your own invite', async () => {
    const id = await inviteService.createInvite('host', 'Host', 1300, 'checkers', 'blitz');
    const res = await inviteService.acceptInvite(id, 'host');
    expect('error' in res).toBe(true);
  });

  it('rejects a targeted invite accepted by the wrong user', async () => {
    const id = await inviteService.createInvite('host', 'Host', 1300, 'chess', 'blitz', 'friend');
    const res = await inviteService.acceptInvite(id, 'stranger');
    expect('error' in res).toBe(true);
  });
});
