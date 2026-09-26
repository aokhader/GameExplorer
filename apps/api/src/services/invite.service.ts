import { redis } from '../config/redis';
import { publicWebUrl } from '../config/cors';
import type { GameType, TimeControl } from '@gameexplorer/shared';

const INVITE_TTL = 600; // 10 minutes

function inviteKey(inviteId: string) { return `invite:${inviteId}`; }

/**
 * The shareable link for an invite, handed out by the `create_invite_link`
 * socket event. `gameType` goes into the path unencoded, which is safe only
 * because the event's schema limits it to the three online game names.
 */
export function inviteUrl(gameType: string, inviteId: string): string {
  return `${publicWebUrl()}/${gameType}/play?invite=${inviteId}`;
}

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

  /**
   * Whether `acceptingUserId` may accept this invite. Reads only: the caller
   * still has checks to run (blocks, games in progress), and an invite refused
   * for one of those should still be there to accept later.
   */
  async checkInvite(inviteId: string, acceptingUserId: string): Promise<{ invite: InviteData } | { error: string }> {
    const invite = await this.getInvite(inviteId);
    if (!invite) return { error: 'Invite not found or expired' };
    if (invite.fromId === acceptingUserId) return { error: 'Cannot accept your own invite' };
    if (invite.toId && invite.toId !== acceptingUserId) return { error: 'Invite is not for you' };
    return { invite };
  },

  /**
   * Takes the invite so nobody else can. DEL reports how many keys it removed,
   * so exactly one of two simultaneous acceptors gets true. Before, both could
   * read the invite before either deleted it, and each started a game.
   */
  async claimInvite(inviteId: string): Promise<boolean> {
    return (await redis.del(inviteKey(inviteId))) === 1;
  },
};
