import { Response } from 'express';
import { LIMITS }          from '@finesse/shared';
import { prisma }         from '../config/database';
import { getIO }          from '../websocket';
import { blockService }   from '../services/block.service';
import { accountService } from '../services/account.service';
import type { AuthRequest } from '../middleware/auth';

/** Accepted friendships a user is part of (either direction). */
function countFriends(userId: string): Promise<number> {
  return prisma.friendship.count({
    where: { OR: [{ userId }, { friendId: userId }], status: 'accepted' },
  });
}

export const userController = {
  async getFriends(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
        status: 'accepted',
      },
    });
    res.json({ friends: friendships });
  },

  async sendFriendRequest(req: AuthRequest, res: Response) {
    const userId   = req.userId!;
    const { targetUserId } = req.body as { targetUserId: string };
    if (userId === targetUserId) { res.status(400).json({ error: 'Cannot friend yourself' }); return; }

    if (await blockService.isBlockedBetween(userId, targetUserId)) {
      res.status(403).json({ error: 'Cannot send a friend request to this user' });
      return;
    }

    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ userId, friendId: targetUserId }, { userId: targetUserId, friendId: userId }] },
    });
    if (existing) { res.status(409).json({ error: 'Request already exists' }); return; }

    // Free-tier caps: bound friends-list size and pending-request spam
    const [senderFriends, targetFriends, pendingOutgoing] = await Promise.all([
      countFriends(userId),
      countFriends(targetUserId),
      prisma.friendship.count({ where: { userId, status: 'pending' } }),
    ]);
    if (senderFriends >= LIMITS.MAX_FRIENDS) {
      res.status(409).json({ error: `Your friends list is full (max ${LIMITS.MAX_FRIENDS})` });
      return;
    }
    if (targetFriends >= LIMITS.MAX_FRIENDS) {
      res.status(409).json({ error: "That user's friends list is full" });
      return;
    }
    if (pendingOutgoing >= LIMITS.MAX_PENDING_REQUESTS) {
      res.status(409).json({ error: `Too many pending requests (max ${LIMITS.MAX_PENDING_REQUESTS})` });
      return;
    }

    const friendship = await prisma.friendship.create({
      data: { userId, friendId: targetUserId, status: 'pending' },
    });

    // Emit socket notification to target user
    try {
      getIO().to(`user:${targetUserId}`).emit('game_invite' as any, {
        type: 'friend_request', from: { userId },
      });
    } catch { /* socket not initialised in test env */ }

    res.json({ friendship });
  },

  async respondToFriendRequest(req: AuthRequest, res: Response) {
    const userId         = req.userId!;
    const { id }         = req.params as { id: string };
    const { action }     = req.body as { action: 'accept' | 'reject' };

    const friendship = await prisma.friendship.findFirst({
      where: { id: Number(id), friendId: userId },
    });
    if (!friendship) { res.status(404).json({ error: 'Request not found' }); return; }

    // Re-check both parties' caps — requests may predate either list filling up
    if (action === 'accept') {
      const [accepterFriends, senderFriends] = await Promise.all([
        countFriends(userId),
        countFriends(friendship.userId),
      ]);
      if (accepterFriends >= LIMITS.MAX_FRIENDS) {
        res.status(409).json({ error: `Your friends list is full (max ${LIMITS.MAX_FRIENDS})` });
        return;
      }
      if (senderFriends >= LIMITS.MAX_FRIENDS) {
        res.status(409).json({ error: "That user's friends list is full" });
        return;
      }
    }

    const updated = await prisma.friendship.update({
      where: { id: Number(id) },
      data:  { status: action === 'accept' ? 'accepted' : 'rejected' },
    });
    res.json({ friendship: updated });
  },

  async removeFriend(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const { id } = req.params as { id: string };

    await prisma.friendship.deleteMany({
      where: {
        id: Number(id),
        OR: [{ userId }, { friendId: userId }],
      },
    });
    res.json({ ok: true });
  },

  // ── Blocking ────────────────────────────────────────────────────────────
  async getBlocked(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const blocked = await blockService.listBlocked(userId);
    res.json({ blocked });
  },

  async blockUser(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const { targetUserId, targetUsername } = req.body as { targetUserId?: string; targetUsername?: string };
    if (!targetUserId)             { res.status(400).json({ error: 'targetUserId is required' }); return; }
    if (userId === targetUserId)   { res.status(400).json({ error: 'Cannot block yourself' }); return; }

    if (await blockService.countBlocked(userId) >= LIMITS.MAX_BLOCKS) {
      res.status(400).json({ error: 'Block list is full — unblock someone first' });
      return;
    }

    await blockService.block(userId, targetUserId, targetUsername);
    res.json({ ok: true });
  },

  async unblockUser(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const { targetUserId } = req.params as { targetUserId: string };
    await blockService.unblock(userId, targetUserId);
    res.json({ ok: true });
  },

  // ── Reporting ───────────────────────────────────────────────────────────
  async reportUser(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const { targetUserId, reason, context, gameId } =
      req.body as { targetUserId?: string; reason?: string; context?: string; gameId?: string };

    if (!targetUserId)               { res.status(400).json({ error: 'targetUserId is required' }); return; }
    if (userId === targetUserId)     { res.status(400).json({ error: 'Cannot report yourself' }); return; }
    if (!reason || !blockService.isValidReason(reason)) {
      res.status(400).json({ error: 'A valid reason is required' });
      return;
    }

    await blockService.report({
      reporterId: userId,
      reportedId: targetUserId,
      reason,
      context: context ? String(context).slice(0, 1000) : undefined,
      gameId,
    });
    res.json({ ok: true });
  },

  // ── Account deletion ──────────────────────────────────────────────────────
  async deleteAccount(req: AuthRequest, res: Response) {
    const userId = req.userId!;
    const result = await accountService.deleteAccount(userId);
    if (result.ok) { res.json({ ok: true }); return; }
    if (result.reason === 'unavailable') {
      res.status(503).json({ error: 'Account deletion is temporarily unavailable' });
      return;
    }
    res.status(500).json({ error: 'Account deletion failed — please try again' });
  },
};
