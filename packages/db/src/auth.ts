// Auth wrappers around Supabase Auth.
// These are thin wrappers — Supabase handles all password hashing internally.
// Never pass raw passwords anywhere except directly into these functions.

import { supabase } from './client';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SignUpResult {
  user: AuthUser | null;
  error: string | null;
  /** True when the account exists but Supabase is waiting on email confirmation. */
  needsEmailConfirmation: boolean;
}

export interface SignInResult {
  user: AuthUser | null;
  error: string | null;
}

/**
 * Sign up with email and password.
 * Supabase handles password hashing — we never see or store the raw password.
 *
 * The profile row is created by the `on_auth_user_created` database trigger,
 * which reads the username out of user metadata (see
 * project-docs/sql-queries/supabase-profile-trigger.sql). Inserting it from
 * here does not work: when email confirmation is enabled `signUp` returns a
 * user but no session, so RLS sees an anonymous caller and rejects the row.
 *
 * `needsEmailConfirmation` is true when Supabase is waiting on the user to
 * click the link in their inbox — there is no session until they do.
 */
export async function signUp(
  email: string,
  password: string,
  username: string
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error || !data.user) {
    return { user: null, error: error?.message ?? 'Sign up failed', needsEmailConfirmation: false };
  }

  return {
    user: { id: data.user.id, email },
    error: null,
    needsEmailConfirmation: !data.session,
  };
}

/**
 * Sign in with email and password.
 */
export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { user: null, error: error?.message ?? 'Sign in failed' };
  }

  return {
    user: { id: data.user.id, email: data.user.email! },
    error: null,
  };
}

/**
 * Post-OAuth redirect target, injected per platform. Web sets its origin-based
 * callback; React Native sets a deep link (e.g. `finesse://auth/callback`).
 * Kept here (instead of reading `window`) so this module runs on any runtime.
 */
let _oauthRedirect: string | null = null;

/** Set the OAuth redirect URL once at app startup (mirrors config.setApiUrl). */
export function setOAuthRedirect(url: string): void {
  _oauthRedirect = url;
}

/**
 * Sign in with an OAuth provider (Google or Facebook).
 * On web this redirects the browser; on native the caller handles the returned
 * deep link. Pass `redirectTo` to override the app-wide default set via
 * `setOAuthRedirect()`; on web it falls back to the current origin.
 */
export async function signInWithOAuth(
  provider: 'google' | 'facebook',
  redirectTo?: string
): Promise<{ error: string | null }> {
  const target =
    redirectTo ??
    _oauthRedirect ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : undefined);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: target },
  });

  return { error: error?.message ?? null };
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Get the currently authenticated user from the active session.
 * Returns null if not signed in.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email! };
}