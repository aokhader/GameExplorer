// Full account deletion (Apple App Store guideline 5.1.1 / Google Play data
// deletion). Deletes every row the user owns across Supabase + Prisma, then the
// Supabase Auth user itself.
//
// We delete each table explicitly rather than relying on `auth.users` ON DELETE
// CASCADE: the cascade is confirmed only for friendships/user_blocks/user_reports
// and unconfirmed for games/user_ratings/profiles, so explicit deletes are
// deterministic under any FK config (including a missing FK). App-owned rows are
// removed BEFORE the auth user so a mid-way failure leaves a still-usable,
// retriable account — never orphaned PII with no way back in. Every step is
// idempotent, so the client (or the user) can safely retry.
import { supabaseAdmin } from '../config/supabase';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'failed' };

/** Supabase returns 404 / "User not found" when the auth user is already gone. */
function isUserNotFound(error: { status?: number; message?: string }): boolean {
  return error.status === 404 || /not\s*found/i.test(error.message ?? '');
}

export const accountService = {
  async deleteAccount(userId: string): Promise<DeleteAccountResult> {
    const admin = supabaseAdmin;
    if (!admin) {
      // Unlike block/report (which silently no-op without the admin key),
      // deletion is a compliance action and must fail loudly so the caller
      // can surface an error and the user can retry.
      logger.error(
        `Account deletion requested for ${userId} but SUPABASE_SECRET_KEY is not configured`,
      );
      return { ok: false, reason: 'unavailable' };
    }

    const del = async (table: string, col: string) => {
      const { error } = await admin.from(table).delete().eq(col, userId);
      if (error) throw new Error(`delete ${table}.${col}: ${error.message}`);
    };

    try {
      // 1. Friendships (Prisma-owned) — user may be on either side.
      await prisma.friendship.deleteMany({
        where: { OR: [{ userId }, { friendId: userId }] },
      });
      // 2–6. Supabase app tables (children → parents).
      await del('user_blocks', 'blocker_id');
      await del('user_blocks', 'blocked_id');
      await del('user_reports', 'reporter_id');
      await del('user_reports', 'reported_id');
      await del('games', 'user_id');
      await del('user_ratings', 'user_id');
      await del('profiles', 'id');
      // 7. The auth user itself — last, so PII never outlives a retry.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !isUserNotFound(error)) {
        throw new Error(`auth.admin.deleteUser: ${error.message}`);
      }
      return { ok: true };
    } catch (err) {
      logger.error(`Account deletion failed for ${userId}:`, err);
      return { ok: false, reason: 'failed' };
    }
  },
};
