import { Response } from 'express';
import { prisma }         from '../config/database';
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

    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ userId, friendId: targetUserId }, { userId: targetUserId, friendId: userId }] },
    });
    if (existing) { res.status(409).json({ error: 'Request already exists' }); return; }

    const friendship = await prisma.friendship.create({
      data: { userId, friendId: targetUserId, status: 'pending' },
    });

    // Emit socket notification to target user
    try {
      const { getIO } = await import('../websocket');
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
};
