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
