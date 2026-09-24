// packages/db/src/profiles.ts

import { supabase } from './client';
import { decryptEmail } from './crypto';

// Raw row shape from Supabase (encrypted)
export interface ProfileRow {
  id: string;
  username: string;
  email_encrypted: string;
  email_hash: string;
  created_at: string;
}

// Decrypted shape for use in the app
export interface Profile {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

/**
 * Fetch a profile by user ID and decrypt the email.
 * Only works server-side where PROFILES_ENCRYPTION_KEY is available.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch profile:', error);
    return null;
  }

  const row = data as ProfileRow;

  return {
    id: row.id,
    username: row.username,
    email: await decryptEmail(row.email_encrypted),
    created_at: row.created_at,
  };
}

/**
 * Fetch just the public-safe fields of a profile (no email).
 * Safe to call from client-side.
 */
export async function getPublicProfile(
  userId: string
): Promise<Pick<Profile, 'id' | 'username' | 'created_at'> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, created_at')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch public profile:', error);
    return null;
  }

  return data as Pick<Profile, 'id' | 'username' | 'created_at'>;
}

// There is deliberately no client-side username update. A username is claimed
// once, through POST /api/auth/username (apps/api username.service.ts): the API
// can enforce claim-once and the profanity filter, and `games.opponent` stores
// usernames as text, so a rename would detach a player from their own history.