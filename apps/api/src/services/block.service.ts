// User blocking + reporting (Phase 4 social safety).
//
// Blocks/reports live in Supabase (user_blocks / user_reports — see
// project-docs/supabase-blocks-reports.sql), accessed via the service-role
// admin client like ratings/games persistence.
//
// Matchmaking must not pay a Supabase round-trip per pairing attempt, so each
// queued user's block set is cached in Redis (`blockset:{userId}`) — populated
// when they join the queue and kept in sync on block/unblock. The set holds
// every userId in a block relationship in EITHER direction, so a single
// membership check excludes both "I blocked them" and "they blocked me".
import { LIMITS } from '@finesse/shared';
import { redis } from '../config/redis';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';

const BLOCKSET_TTL = 3600; // seconds — refreshed on every queue join

const REPORT_REASONS = ['harassment', 'cheating', 'spam', 'offensive_language', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

function blocksetKey(userId: string) { return `blockset:${userId}`; }

export const blockService = {
  isValidReason(reason: string): reason is ReportReason {
    return (REPORT_REASONS as readonly string[]).includes(reason);
  },

  /** Every userId in a block relationship with `userId`, either direction. */
  async getBlockedUserIds(userId: string): Promise<string[]> {
    if (!supabaseAdmin) return [];
    try {
      const [outgoing, incoming] = await Promise.all([
        supabaseAdmin.from('user_blocks').select('blocked_id').eq('blocker_id', userId),
        supabaseAdmin.from('user_blocks').select('blocker_id').eq('blocked_id', userId),
      ]);
      const ids = new Set<string>();
      for (const r of (outgoing.data ?? []) as Array<{ blocked_id: string }>) ids.add(r.blocked_id);
      for (const r of (incoming.data ?? []) as Array<{ blocker_id: string }>) ids.add(r.blocker_id);
      return [...ids];
    } catch (err) {
      logger.error(`getBlockedUserIds failed for ${userId}:`, err);
      return [];
    }
  },

  /** True if a block exists between the two users in either direction. */
  async isBlockedBetween(a: string, b: string): Promise<boolean> {
    const ids = await this.getBlockedUserIds(a);
    return ids.includes(b);
  },

  /** Rebuilds the Redis block-set cache for a user (called on queue join). */
  async cacheBlockSet(userId: string): Promise<void> {
    try {
      const ids = await this.getBlockedUserIds(userId);
      const key = blocksetKey(userId);
      await redis.del(key);
      if (ids.length > 0) {
        await redis.sadd(key, ...ids);
        await redis.expire(key, BLOCKSET_TTL);
      }
    } catch (err) {
      logger.error(`cacheBlockSet failed for ${userId}:`, err);
    }
  },

  /** Keeps any already-cached block sets in sync after a block/unblock. */
  async syncCaches(a: string, b: string, add: boolean): Promise<void> {
    try {
      for (const [self, other] of [[a, b], [b, a]] as const) {
        const key = blocksetKey(self);
        if (!(await redis.exists(key))) continue; // only touch live (queued) caches
        if (add) await redis.sadd(key, other);
        else     await redis.srem(key, other);
      }
    } catch { /* cache sync is best-effort */ }
  },

  async block(blockerId: string, blockedId: string, blockedUsername?: string): Promise<void> {
    if (!supabaseAdmin || blockerId === blockedId) return;
    const { error } = await supabaseAdmin
      .from('user_blocks')
      .upsert(
        { blocker_id: blockerId, blocked_id: blockedId, blocked_username: blockedUsername ?? null },
        { onConflict: 'blocker_id,blocked_id' },
      );
    if (error) { logger.error('block insert failed:', error); return; }
    await this.syncCaches(blockerId, blockedId, true);
  },

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    if (!supabaseAdmin) return;
    const { error } = await supabaseAdmin
      .from('user_blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
    if (error) { logger.error('unblock failed:', error); return; }
    await this.syncCaches(blockerId, blockedId, false);
  },

  /** How many users `blockerId` has blocked — drives the MAX_BLOCKS cap. */
  async countBlocked(blockerId: string): Promise<number> {
    if (!supabaseAdmin) return 0;
    const { count, error } = await supabaseAdmin
      .from('user_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('blocker_id', blockerId);
    if (error) { logger.error('countBlocked failed:', error); return 0; }
    return count ?? 0;
  },

  /** Users that `blockerId` has blocked (for the management UI). */
  async listBlocked(blockerId: string): Promise<Array<{ blockedId: string; username: string | null; createdAt: string }>> {
    if (!supabaseAdmin) return [];
    const { data, error } = await supabaseAdmin
      .from('user_blocks')
      .select('blocked_id, blocked_username, created_at')
      .eq('blocker_id', blockerId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as Array<{ blocked_id: string; blocked_username: string | null; created_at: string }>)
      .map(r => ({ blockedId: r.blocked_id, username: r.blocked_username, createdAt: r.created_at }));
  },

  async report(opts: {
    reporterId: string; reportedId: string; reason: ReportReason;
    context?: string; gameId?: string;
  }): Promise<void> {
    if (!supabaseAdmin) return;

    // Free-tier caps: one open report per pair, bounded open reports per
    // reporter. Skipping silently is fine — the reporter still sees "ok",
    // and moderation already has the earlier report.
    const { data: existing, error: capError } = await supabaseAdmin
      .from('user_reports')
      .select('reported_id')
      .eq('reporter_id', opts.reporterId)
      .eq('status', 'open')
      .limit(LIMITS.MAX_OPEN_REPORTS);
    if (capError) { logger.error('report cap check failed:', capError); return; }
    const open = (existing ?? []) as Array<{ reported_id: string }>;
    if (open.length >= LIMITS.MAX_OPEN_REPORTS) return;
    if (open.some(r => r.reported_id === opts.reportedId)) return;

    const { error } = await supabaseAdmin.from('user_reports').insert({
      reporter_id: opts.reporterId,
      reported_id: opts.reportedId,
      reason:      opts.reason,
      context:     opts.context ?? null,
      game_id:     opts.gameId ?? null,
      status:      'open',
    });
    if (error) logger.error('report insert failed:', error);
  },
};
