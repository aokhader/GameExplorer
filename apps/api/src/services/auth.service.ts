// Username sign-in.
//
// Supabase Auth only authenticates by email — `signInWithPassword` has no
// username option — so logging in with a username means resolving it to an
// email first. That resolution CANNOT happen in the browser or the app: the
// anon key ships inside both bundles, so a client-callable username → email
// lookup would let anyone enumerate usernames and harvest every user's email
// address. It runs here instead, behind the secret key, and the email is never
// returned to the caller — only the session that the password grant produced.
import { supabaseAdmin, supabaseAnon } from '../config/supabase';
import { logger } from '../utils/logger';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
}

export type LoginResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'unavailable' | 'invalid' };

/** Anything containing an @ is treated as an email and skips the lookup. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}

/**
 * Escape the LIKE metacharacters so a username of `%` can't match every row.
 * (A wildcard that matched exactly one user would still need that user's
 * password, but there is no reason to hand out the pattern match at all.)
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Resolve a username to its account email, or null if that can't be done
 * unambiguously. Returns null rather than throwing — the caller collapses every
 * failure into the same generic error so this can't be used as an oracle.
 */
async function emailForUsername(username: string): Promise<string | null> {
  const admin = supabaseAdmin;
  if (!admin) return null;

  // `limit(2)`: usernames should be unique case-insensitively, but until the
  // unique index in supabase-profile-trigger.sql is applied a "Bob"/"bob" pair
  // can exist. Two matches is ambiguous — refuse rather than pick one.
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', escapeLike(username))
    .limit(2);

  if (error) {
    logger.error(`Username lookup failed: ${error.message}`);
    return null;
  }
  if (!data || data.length !== 1) return null;

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(data[0].id);
  if (userError || !userData.user?.email) {
    // A profile with no matching auth user means the two tables have drifted.
    if (userError) logger.error(`getUserById failed during username login: ${userError.message}`);
    return null;
  }

  return userData.user.email;
}

export const authService = {
  /**
   * Sign in with either a username or an email in the same field. Callers get
   * one indistinguishable `invalid` for a bad username, a bad password, or an
   * ambiguous match, so this endpoint never confirms whether an account exists.
   */
  async loginWithIdentifier(identifier: string, password: string): Promise<LoginResult> {
    const anon = supabaseAnon;
    if (!anon) {
      logger.error('Username login attempted but SUPABASE_ANON_KEY is not configured');
      return { ok: false, reason: 'unavailable' };
    }

    const email = looksLikeEmail(identifier)
      ? identifier
      : await emailForUsername(identifier);

    if (!email) return { ok: false, reason: 'invalid' };

    const { data, error } = await anon.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      // Deliberately not logged with the identifier — failed logins are noisy
      // and the identifier may be an email address.
      return { ok: false, reason: 'invalid' };
    }

    return {
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    };
  },
};
