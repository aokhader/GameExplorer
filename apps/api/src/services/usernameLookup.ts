// Which profiles hold a username, case-insensitively — at most two, because two
// is already "ambiguous" to username sign-in, which refuses rather than picks.
//
// Asks public.profile_ids_for_username
// (project-docs/sql-queries/supabase-username-lookup-rpc.sql), which compares
// lower(username) and so uses profiles_username_lower_key. Until that function
// exists this falls back to the old `ilike` query, which scans the table:
// correct, only slower. A missing function is remembered for RPC_RETRY_MS
// rather than asked about on every call, then tried again, so applying the SQL
// takes effect without a restart.
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLike } from '../utils/escapeLike';
import { logger } from '../utils/logger';

export const RPC_RETRY_MS = 10 * 60_000;

/** PostgREST: no such function in its schema cache. */
const FUNCTION_NOT_FOUND = 'PGRST202';

export interface LookupResult {
  data: { id: string }[] | null;
  error: { code?: string; message: string } | null;
}

let rpcMissingUntil = 0;

export async function profileIdsForUsername(
  admin: SupabaseClient,
  name: string,
): Promise<LookupResult> {
  if (Date.now() >= rpcMissingUntil) {
    const { data, error } = await admin.rpc('profile_ids_for_username', { p_name: name });
    if (!error) return { data: (data as { id: string }[] | null) ?? [], error: null };
    if (error.code !== FUNCTION_NOT_FOUND) return { data: null, error };
    rpcMissingUntil = Date.now() + RPC_RETRY_MS;
    logger.warn(
      'profile_ids_for_username is missing; username lookups scan the table until ' +
        'project-docs/sql-queries/supabase-username-lookup-rpc.sql is applied',
    );
  }

  // `ilike` with every metacharacter escaped is a case-insensitive equality.
  // escapeLike is load-bearing: `_` is legal in a username, and unescaped,
  // `b_b` would match `bob`.
  return admin.from('profiles').select('id').ilike('username', escapeLike(name)).limit(2);
}

/** Tests only: forget that the function was missing. */
export function resetUsernameLookup(): void {
  rpcMissingUntil = 0;
}
