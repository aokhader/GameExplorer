// Accounts whose tokens must stop working before those tokens expire.
//
// Access tokens are verified locally against Supabase's published keys, so
// nothing asks Supabase whether the account behind one still exists: a token
// issued before an account was deleted kept working for the rest of its hour,
// on REST and on any socket it had opened (security audit v2, GX-16). A deleted
// account is recorded here, and every token for it is refused. No new token can
// be issued for a deleted account, so refusing the id outright is exact.
//
// In memory, like the socket limits. The API runs as one instance, and its
// Redis sits in the same container with persistence off, so Redis would not
// survive a restart either. After a restart, a token issued before a deletion
// works until it expires, at most an hour (spec-v7 13-operations.md).

/** Far past the longest a Supabase access token can live. */
const REMEMBER_MS = 24 * 60 * 60 * 1000;

const revokedAt = new Map<string, number>();

function forgetOld(now: number): void {
  for (const [userId, at] of revokedAt) {
    if (now - at > REMEMBER_MS) revokedAt.delete(userId);
  }
}

export const revocationService = {
  /** From now on, every token for `userId` is refused. */
  revoke(userId: string, now = Date.now()): void {
    forgetOld(now);
    revokedAt.set(userId, now);
  },

  /** Undo `revoke`, for an account deletion that failed and can be retried. */
  lift(userId: string): void {
    revokedAt.delete(userId);
  },

  isRevoked(userId: string, now = Date.now()): boolean {
    const at = revokedAt.get(userId);
    if (at === undefined) return false;
    if (now - at > REMEMBER_MS) {
      revokedAt.delete(userId);
      return false;
    }
    return true;
  },
};

/** Tests only. */
export function resetRevocations(): void {
  revokedAt.clear();
}
