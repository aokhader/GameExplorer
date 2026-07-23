/**
 * Sign in with either a username or an email in a single field — shared by web
 * and mobile.
 *
 * Emails take the direct path to Supabase, exactly as before. Usernames go
 * through the Express API, because resolving a username to its account email
 * requires the secret key: doing that lookup client-side would expose every
 * user's email to anyone holding the (public) anon key. The API returns only
 * the resulting session, which we install locally so the rest of the app —
 * `onAuthStateChange`, the socket, `apiFetch` — behaves identically to a
 * password sign-in.
 */
import { apiFetch } from './apiFetch';

export interface SignInResult {
  error: string | null;
}

/** Anything containing an @ is treated as an email. Mirrors the API's check. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}

export async function signInWithIdentifier(
  identifier: string,
  password: string
): Promise<SignInResult> {
  const { supabase } = await import('@gameexplorer/db');
  const trimmed = identifier.trim();

  if (looksLikeEmail(trimmed)) {
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    return { error: error?.message ?? null };
  }

  try {
    const { session } = await apiFetch<{
      session: { access_token: string; refresh_token: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: trimmed, password }),
    });

    // Install the session the API minted for us. Without this the tokens exist
    // but no client knows about them, so the user would still appear signed out.
    const { error } = await supabase.auth.setSession(session);
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sign in failed' };
  }
}
