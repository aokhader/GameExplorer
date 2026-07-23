import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

// Admin client — bypasses RLS. Server-side persistence of multiplayer results
// (ratings + game records) must NOT depend on the players' browsers, otherwise
// a rage-quit (tab closed before game_ended) never records the loss.
//
// Use a Supabase SECRET API key (sb_secret_..., Dashboard → Settings → API
// Keys). The legacy service_role JWT also works (same RLS-bypass semantics)
// but secret keys are revocable and are Supabase's recommended replacement.
// NEVER expose either key to the web app.
const url      = process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin: SupabaseClient | null =
  url && adminKey
    ? createClient(url, adminKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

if (!supabaseAdmin) {
  logger.warn(
    'SUPABASE_SECRET_KEY not set — multiplayer results will NOT be persisted server-side',
  );
}

// Anon client — the SAME public key the browser and app use, and deliberately
// so. Username sign-in resolves the account with `supabaseAdmin` but must run
// the actual password grant through a normal, unprivileged client: the admin
// key bypasses RLS and would turn a login endpoint into a privilege boundary we
// do not want. This client never persists a session (it is shared across every
// request); the tokens it returns are handed straight back to the caller.
const anonKey = process.env.SUPABASE_ANON_KEY;

export const supabaseAnon: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

if (!supabaseAnon) {
  logger.warn('SUPABASE_ANON_KEY not set — username sign-in will be unavailable');
}
