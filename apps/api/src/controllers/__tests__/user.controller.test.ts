import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LIMITS } from '@finesse/shared';
import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';

// The controller reads prisma/getIO/blockService as module-level bindings, so
// mock every collaborator at its import specifier before importing it.
const mocks = vi.hoisted(() => ({
  count:            vi.fn<(args: unknown) => Promise<number>>(),
  findFirst:        vi.fn(),
  create:           vi.fn(),
  update:           vi.fn(),
  isBlockedBetween: vi.fn(),
  countBlocked:     vi.fn(),
  block:            vi.fn(),
}));

vi.mock('../../config/database', () => ({
  prisma: {
    friendship: {
      count:      mocks.count,
      findFirst:  mocks.findFirst,
      create:     mocks.create,
      update:     mocks.update,
      findMany:   vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));
vi.mock('../../websocket', () => ({
  getIO: () => ({ to: () => ({ emit: () => {} }) }),
}));
vi.mock('../../services/block.service', () => ({
  blockService: {
    isBlockedBetween: mocks.isBlockedBetween,
    countBlocked:     mocks.countBlocked,
    block:            mocks.block,
    unblock:          vi.fn(),
    listBlocked:      vi.fn(async () => []),
    report:           vi.fn(),
    isValidReason:    () => true,
  },
}));
vi.mock('../../services/account.service', () => ({
  accountService: { deleteAccount: vi.fn() },
}));

import { userController } from '../user.controller';

function mockRes() {
  const res = { statusCode: 200, body: undefined as unknown };
  const typed = res as unknown as Response;
  (typed as unknown as Record<string, unknown>).status =
    vi.fn((c: number) => { res.statusCode = c; return typed; });
  (typed as unknown as Record<string, unknown>).json =
    vi.fn((b: unknown) => { res.body = b; return typed; });
  return { res: typed, out: res };
}

function req(userId: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}): AuthRequest {
  return { userId, body, params } as unknown as AuthRequest;
}

/** prisma.friendship.count fake: accepted counts per user + pending count. */
function setCounts(accepted: Record<string, number>, pending = 0) {
  mocks.count.mockImplementation(async (args) => {
    const where = (args as { where: { status: string; OR?: Array<{ userId?: string }> } }).where;
    if (where.status === 'pending') return pending;
    return accepted[where.OR?.[0]?.userId ?? ''] ?? 0;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isBlockedBetween.mockResolvedValue(false);
  mocks.findFirst.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: 1, status: 'pending' });
  mocks.update.mockResolvedValue({ id: 1, status: 'accepted' });
  mocks.countBlocked.mockResolvedValue(0);
  setCounts({});
});

// ── sendFriendRequest caps ────────────────────────────────────────────────────
describe('userController.sendFriendRequest caps', () => {
  it('rejects when the sender is at MAX_FRIENDS', async () => {
    setCounts({ sender: LIMITS.MAX_FRIENDS });
    const { res, out } = mockRes();
    await userController.sendFriendRequest(req('sender', { targetUserId: 'target' }), res);
    expect(out.statusCode).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects when the target is at MAX_FRIENDS', async () => {
    setCounts({ target: LIMITS.MAX_FRIENDS });
    const { res, out } = mockRes();
    await userController.sendFriendRequest(req('sender', { targetUserId: 'target' }), res);
    expect(out.statusCode).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects when the sender has MAX_PENDING_REQUESTS outgoing', async () => {
    setCounts({}, LIMITS.MAX_PENDING_REQUESTS);
    const { res, out } = mockRes();
    await userController.sendFriendRequest(req('sender', { targetUserId: 'target' }), res);
    expect(out.statusCode).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates the request when everyone is under the caps', async () => {
    setCounts({ sender: LIMITS.MAX_FRIENDS - 1 }, LIMITS.MAX_PENDING_REQUESTS - 1);
    const { res, out } = mockRes();
    await userController.sendFriendRequest(req('sender', { targetUserId: 'target' }), res);
    expect(out.statusCode).toBe(200);
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});

// ── respondToFriendRequest caps ───────────────────────────────────────────────
describe('userController.respondToFriendRequest caps', () => {
  const pendingRequest = { id: 1, userId: 'sender', friendId: 'me', status: 'pending' };

  it('rejects an accept when the accepter is now at MAX_FRIENDS', async () => {
    mocks.findFirst.mockResolvedValue(pendingRequest);
    setCounts({ me: LIMITS.MAX_FRIENDS });
    const { res, out } = mockRes();
    await userController.respondToFriendRequest(req('me', { action: 'accept' }, { id: '1' }), res);
    expect(out.statusCode).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an accept when the original sender is now at MAX_FRIENDS', async () => {
    mocks.findFirst.mockResolvedValue(pendingRequest);
    setCounts({ sender: LIMITS.MAX_FRIENDS });
    const { res, out } = mockRes();
    await userController.respondToFriendRequest(req('me', { action: 'accept' }, { id: '1' }), res);
    expect(out.statusCode).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('accepts when both parties are under the cap', async () => {
    mocks.findFirst.mockResolvedValue(pendingRequest);
    const { res, out } = mockRes();
    await userController.respondToFriendRequest(req('me', { action: 'accept' }, { id: '1' }), res);
    expect(out.statusCode).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it('never checks caps on reject', async () => {
    mocks.findFirst.mockResolvedValue(pendingRequest);
    const { res, out } = mockRes();
    await userController.respondToFriendRequest(req('me', { action: 'reject' }, { id: '1' }), res);
    expect(out.statusCode).toBe(200);
    expect(mocks.count).not.toHaveBeenCalled();
  });
});

// ── blockUser cap ─────────────────────────────────────────────────────────────
describe('userController.blockUser cap', () => {
  it('rejects when the block list is at MAX_BLOCKS', async () => {
    mocks.countBlocked.mockResolvedValue(LIMITS.MAX_BLOCKS);
    const { res, out } = mockRes();
    await userController.blockUser(req('me', { targetUserId: 'them' }), res);
    expect(out.statusCode).toBe(400);
    expect(mocks.block).not.toHaveBeenCalled();
  });

  it('blocks when under the cap', async () => {
    mocks.countBlocked.mockResolvedValue(LIMITS.MAX_BLOCKS - 1);
    const { res, out } = mockRes();
    await userController.blockUser(req('me', { targetUserId: 'them' }), res);
    expect(out.statusCode).toBe(200);
    expect(mocks.block).toHaveBeenCalledOnce();
  });
});
