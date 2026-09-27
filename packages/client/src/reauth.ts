/**
 * Proving it is still you, before the account is deleted — shared by web and
 * mobile.
 *
 * The API deletes an account only for a session that signed in within the last
 * ten minutes (security audit v2, GX-19), and answers anything older with
 * `REAUTH_REQUIRED`. How to sign in again depends on the account: one with a
 * password types it again; one that signs in through Google, Facebook or Apple
 * goes through that provider again.
 */
import { REAUTH_REQUIRED } from '@gameexplorer/shared';
import { ApiError } from './apiFetch';

export type SocialProvider = 'google' | 'facebook' | 'apple';

export type ReauthMethod =
  | { kind: 'password'; email: string }
  | { kind: 'provider'; provider: SocialProvider }
  /** Nothing to offer in place; sign out and back in. */
  | { kind: 'sign-out' };

/** The part of a Supabase user this reads. */
export interface ReauthUser {
  email?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
}

const SOCIAL: readonly string[] = ['google', 'facebook', 'apple'];

/** True when the API refused an action for want of a recent sign-in. */
export function needsReauth(err: unknown): boolean {
  return err instanceof ApiError && err.code === REAUTH_REQUIRED;
}

export function reauthMethodFor(user: ReauthUser | null | undefined): ReauthMethod {
  const meta = user?.app_metadata;
  const providers = meta?.providers ?? (meta?.provider ? [meta.provider] : []);
  // Supabase calls a password identity "email". A password is the quickest
  // proof, so it wins when the account has one alongside a provider.
  if (providers.includes('email') && user?.email) return { kind: 'password', email: user.email };
  const social = providers.find((p) => SOCIAL.includes(p));
  if (social) return { kind: 'provider', provider: social as SocialProvider };
  return { kind: 'sign-out' };
}

/** The method for whoever is signed in now, read from the session. */
export async function currentReauthMethod(): Promise<ReauthMethod> {
  const { supabase } = await import('@gameexplorer/db');
  const { data } = await supabase.auth.getSession();
  return reauthMethodFor(data.session?.user as ReauthUser | undefined);
}

/** The signed-in user's id, or null. Checked after a provider sign-in, which can land on another account. */
export async function currentUserId(): Promise<string | null> {
  const { supabase } = await import('@gameexplorer/db');
  const { data } = await supabase.auth.getSession();
  return (data.session?.user as { id?: string } | undefined)?.id ?? null;
}

/** Signs in again with the account's password, which starts a fresh session. */
export async function confirmPassword(email: string, password: string): Promise<{ error: string | null }> {
  const { supabase } = await import('@gameexplorer/db');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { error: null };
  return { error: /invalid login credentials/i.test(error.message) ? 'That password is not right.' : error.message };
}
