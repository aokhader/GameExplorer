import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory Redis fake (see helpers/redis-fake.ts), mocked at the same module
// specifier the services import (`../config/redis`), so they share this instance.
vi.mock('../../config/redis', async () => {
  const { createRedisFakeModule } = await import('../../__tests__/helpers/redis-fake');
  return createRedisFakeModule();
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
