import { Response } from 'express';
import { prisma }         from '../config/database';
import { getIO }          from '../websocket';
import { blockService }   from '../services/block.service';
import { accountService } from '../services/account.service';
import type { AuthRequest } from '../middleware/auth';

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
