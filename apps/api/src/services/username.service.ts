// Username availability and claiming.
//
// Why this lives on the server at all: `profiles` SELECT is owner-only, so a
// signed-out sign-up form cannot ask whether "Bob" exists. Only the secret key
// can read another user's name — the same reason `emailForUsername` lives here.
//
// Who owns what:
//   - packages/shared owns the grammar and the reserved list (validateUsername)
//   - the DATABASE owns the truth (format, reserved and case-insensitive
//     uniqueness are all constraints on profiles)
//   - this service adds the one rule the database cannot express — profanity —
//     and answers "is it free?" as a courtesy
//
// That courtesy is ADVISORY. Two people can both be told "available" for the
// same name; the unique index decides, and the sign-up forms handle losing.
//
// This endpoint is also the product's first bulk username-enumeration oracle:
// a stranger can test names at the rate usernameCheckLimiter allows. Usernames
// are already public in games and spectate lists, which is why that is an
// accepted trade — but the limiter's number is the budget, not an accident.
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { validateUsername, type UsernameReason } from '@gameexplorer/shared';
import { supabaseAdmin } from '../config/supabase';
import { escapeLike } from '../utils/escapeLike';
import { logger } from '../utils/logger';

/** What the API tells a client. Finer local reasons collapse to `invalid-format`. */
export type WireReason = 'ok' | 'taken' | 'reserved' | 'invalid-format';

export type AvailabilityResult =
  | { ok: true; available: true; reason: 'ok' }
  | { ok: true; available: false; reason: Exclude<WireReason, 'ok'> }
  | { ok: false; reason: 'unavailable' };

export type ClaimResult =
  | { ok: true; claimed: true }
  | { ok: true; claimed: false; reason: Exclude<WireReason, 'ok'> | 'already-chosen' }
  | { ok: false; reason: 'unavailable' };

// Built once: construction compiles the whole dataset.
//
// Known false positives, accepted: names containing a real word the dataset
// cannot tell apart from a slur — "DickSmith", "penistone", "wankel". They get
// the polite 'reserved' answer and choose again. Names like "Scunthorpe",
// "assassin", "cocktail" and "Cumberbatch" pass.
const profanity = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * True for a name the dataset flags, as written or with underscores removed
 * (`f_u_c_k` passes the matcher as written; the underscore is legal here).
 */
export function isProfaneUsername(name: string): boolean {
  return profanity.hasMatch(name) || profanity.hasMatch(name.replace(/_/g, ''));
}

/**
 * Grammar, reserved list, then profanity — every rule that needs no database.
 * Returns null when the name passes all three.
 */
function refuseWithoutLookup(name: string): Exclude<WireReason, 'ok' | 'taken'> | null {
  const local: UsernameReason = validateUsername(name);
  if (local === 'reserved') return 'reserved';
  if (local !== 'ok') return 'invalid-format';
  // Profanity answers as 'reserved' on purpose: the reply stays polite and does
  // not teach anyone which spellings the filter misses.
  if (isProfaneUsername(name)) return 'reserved';
  return null;
}

/** Postgres error → the reason a claim failed, when the database is the one refusing. */
function reasonForDbError(
  error: { code?: string; message?: string },
): Exclude<WireReason, 'ok'> | 'already-chosen' | null {
  if (error.code === '23505') {
    // On the primary key it means a concurrent recovery claim by the same user
    // created the row first; otherwise it is profiles_username_lower_key.
    return error.message?.includes('profiles_pkey') ? 'already-chosen' : 'taken';
  }
  if (error.code === '23514') {
    return error.message?.includes('profiles_username_reserved') ? 'reserved' : 'invalid-format';
  }
  return null;
}

export const usernameService = {
  /**
   * Is this name free? Order is deliberate and tested:
   *   grammar → reserved → profanity (none of these touch the database)
   *   → escapeLike → ilike → limit(2)
   * Grammar comes first so that `b*b` is refused as a name rather than sent as
   * a pattern; escaping comes before the ilike so that the LEGAL `_` in `b_b`
   * cannot match `bob`.
   */
  async checkAvailability(name: string): Promise<AvailabilityResult> {
    const admin = supabaseAdmin;
    if (!admin) return { ok: false, reason: 'unavailable' };

    const refused = refuseWithoutLookup(name);
    if (refused) return { ok: true, available: false, reason: refused };

    try {
      // `ilike` with every metacharacter escaped is a case-insensitive equality,
      // which is what profiles_username_lower_key enforces.
      const { data, error } = await admin
        .from('profiles')
        .select('id')
        .ilike('username', escapeLike(name))
        .limit(2);

      if (error) {
        logger.error(`Username availability lookup failed: ${error.message}`);
        return { ok: false, reason: 'unavailable' };
      }
      return data && data.length > 0
        ? { ok: true, available: false, reason: 'taken' }
        : { ok: true, available: true, reason: 'ok' };
    } catch (err) {
      logger.error(`Username availability lookup threw: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, reason: 'unavailable' };
    }
  },

  /**
   * Make `name` this user's chosen username — ONCE.
   *
   * Claim-once, not rename: games.opponent stores a username STRING, not a
   * foreign key, so renaming would silently detach a player from their own
   * game history. A user whose status is already 'chosen' is refused.
   *
   * Two write paths:
   *   - the usual one: the sign-up trigger made a 'derived' or 'deduped' row,
   *     and this replaces the name and marks it 'chosen'
   *   - recovery: the user has no profile at all (an auth user stranded by a
   *     trigger failure), and this creates it
   * Either way the database constraints are the final word; a violation maps
   * back to the same reasons the availability check uses.
   */
  async claim(userId: string, name: string): Promise<ClaimResult> {
    const admin = supabaseAdmin;
    if (!admin) return { ok: false, reason: 'unavailable' };

    const refused = refuseWithoutLookup(name);
    if (refused) return { ok: true, claimed: false, reason: refused };

    try {
      const { data: current, error: readError } = await admin
        .from('profiles')
        .select('username_status')
        .eq('id', userId)
        .maybeSingle();

      if (readError) {
        logger.error(`Username claim read failed: ${readError.message}`);
        return { ok: false, reason: 'unavailable' };
      }
      if (current?.username_status === 'chosen') {
        return { ok: true, claimed: false, reason: 'already-chosen' };
      }

      const write = current
        ? // The status filter makes claim-once atomic: two concurrent claims by
          // the same user cannot both update the row.
          admin
            .from('profiles')
            .update({ username: name, username_status: 'chosen' })
            .eq('id', userId)
            .neq('username_status', 'chosen')
            .select('id')
        : admin
            .from('profiles')
            .insert({ id: userId, username: name, username_status: 'chosen' })
            .select('id');

      const { data: written, error: writeError } = await write;

      if (writeError) {
        const reason = reasonForDbError(writeError);
        if (reason) return { ok: true, claimed: false, reason };
        logger.error(`Username claim write failed: ${writeError.message}`);
        return { ok: false, reason: 'unavailable' };
      }
      // Zero rows updated: the row turned 'chosen' between the read and the
      // write — a second tab or a double tap. The first claim stands.
      if (!written || written.length === 0) {
        return { ok: true, claimed: false, reason: 'already-chosen' };
      }
      return { ok: true, claimed: true };
    } catch (err) {
      logger.error(`Username claim threw: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, reason: 'unavailable' };
    }
  },
};
