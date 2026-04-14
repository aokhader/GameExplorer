// Auth wrappers around Supabase Auth.
// These are thin wrappers — Supabase handles all password hashing internally.
// Never pass raw passwords anywhere except directly into these functions.

import { supabase } from './client';
import { encryptEmail, hashEmail } from './crypto';
import type { ProfileRow } from './profiles';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SignUpResult {
  user: AuthUser | null;
  error: string | null;
}

export interface SignInResult {
  user: AuthUser | null;
  error: string | null;
}

/**
 * Sign up with email and password.
 * Also creates a profile row with encrypted email.
 * Supabase handles password hashing — we never see or store the raw password.
 */
export async function signUp(
  email: string,
  password: string,
  username: string
): Promise<SignUpResult> {
  // 1. Create the auth user (Supabase hashes the password with bcrypt)
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    return { user: null, error: error?.message ?? 'Sign up failed' };
  }

  // 2. Create the profile with encrypted email
  const emailEncrypted = await encryptEmail(email);
  const emailHash = await hashEmail(email);

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: data.user.id,
      username,
      email_encrypted: emailEncrypted,
      email_hash: emailHash,
    } satisfies Omit<ProfileRow, 'created_at'>);

  if (profileError) {
    // Auth user was created but profile failed — log for investigation
    console.error('Profile creation failed after sign up:', profileError);
    return { user: null, error: 'Account created but profile setup failed. Please contact support.' };
  }

  return {
    user: { id: data.user.id, email },
    error: null,
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
 * Sign in with an OAuth provider (Google or Facebook).
 * Redirects the browser — call this client-side.
 */
export async function signInWithOAuth(
  provider: 'google' | 'facebook'
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
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