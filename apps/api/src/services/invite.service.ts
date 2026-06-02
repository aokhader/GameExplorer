import { redis } from '../config/redis';
import type { GameType, TimeControl } from '@gameexplorer/shared';

const INVITE_TTL = 600; // 10 minutes

function inviteKey(inviteId: string) { return `invite:${inviteId}`; }

export interface InviteData {
  fromId:      string;
  fromUsername: string;
  fromRating:  string;
  toId:        string; // '' for open links
  gameType:    GameType;
  timeControl: TimeControl;
  createdAt:   string;
}

export const inviteService = {
  async createInvite(
    fromId: string,
    fromUsername: string,
    fromRating: number,
    gameType: GameType,
    timeControl: TimeControl,
    toId = '',
  ): Promise<string> {
    const inviteId = crypto.randomUUID().slice(0, 8);
    await redis.hset(inviteKey(inviteId), {
      fromId,
      fromUsername,
      fromRating: String(fromRating),
      toId,
      gameType,
      timeControl,
      createdAt: new Date().toISOString(),
    });
    await redis.expire(inviteKey(inviteId), INVITE_TTL);
    return inviteId;
  },

  async getInvite(inviteId: string): Promise<InviteData | null> {
    const data = await redis.hgetall(inviteKey(inviteId));
    return Object.keys(data).length > 0 ? data as unknown as InviteData : null;
  },

  async deleteInvite(inviteId: string): Promise<void> {
    await redis.del(inviteKey(inviteId));
  },

  async acceptInvite(inviteId: string, acceptingUserId: string): Promise<{ invite: InviteData } | { error: string }> {
    const invite = await this.getInvite(inviteId);
    if (!invite) return { error: 'Invite not found or expired' };
    if (invite.fromId === acceptingUserId) return { error: 'Cannot accept your own invite' };
    if (invite.toId && invite.toId !== acceptingUserId) return { error: 'Invite is not for you' };
    await this.deleteInvite(inviteId);
    return { invite };
  },
};
