import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

// Service-role client — bypasses RLS. Server-side persistence of multiplayer
// results (ratings + game records) must NOT depend on the players' browsers,
// otherwise a rage-quit (tab closed before game_ended) never records the loss.
// NEVER expose this key to the web app.
const url        = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin: SupabaseClient | null =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

if (!supabaseAdmin) {
  logger.warn(
    'SUPABASE_SERVICE_ROLE_KEY not set — multiplayer results will NOT be persisted server-side',
  );
}
