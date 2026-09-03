import { supabase } from '@finesse/db';

/**
 * Ensure the signed-in user has a profile row, creating a minimal one if not.
 *
 * OAuth users have no profile until first login (there's no sign-up form to fill
 * a username), so we derive a default from their display name / email — mirroring
 * the web `/auth/callback` route. Best-effort: the session is already valid, so a
 * failure here must never block sign-in (RLS still protects every later query).
 *
 * Like the web sign-up form, we insert only `id` + `username`; the encrypted-email
 * columns are populated server-side / on web sign-up and are not required here.
 */
export async function ensureProfile(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();
    if (existing) return;

    const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const rawName = meta.full_name ?? meta.name;
    const username =
      rawName?.replace(/\s+/g, '').toLowerCase() ||
      user.email?.split('@')[0] ||
      `player${user.id.slice(0, 6)}`;

    await supabase.from('profiles').insert({ id: user.id, username });
  } catch (err) {
    console.warn('ensureProfile failed (non-fatal):', err);
  }
}
