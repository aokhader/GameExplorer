/**
 * Username availability and claiming — shared by web and mobile.
 *
 * Every decision lives in the two pure functions at the bottom
 * (`usernameFieldState`, `canSubmitUsername`) so it can be tested without a
 * renderer; the network calls and the hook only feed them.
 *
 * The rule everything here serves: the availability check is ADVISORY. The
 * database decides. So a check that could not be answered — API down, cold
 * start, rate limited, offline — is `unknown`, and `unknown` never blocks
 * submit. The API and the web app deploy separately; if a failed check
 * disabled the button, an API outage would become a total sign-up outage.
 * Likewise a throw is never reported as `taken`.
 */
import {
  USERNAME_HINT,
  usernameReasonMessage,
  validateUsername,
  type UsernameReason,
} from '@gameexplorer/shared';
import { apiFetch } from './apiFetch';

/** A server answer, or `unknown` when there was no trustworthy answer. */
export type UsernameCheck = 'available' | 'taken' | 'reserved' | 'invalid-format' | 'unknown';

const REFUSALS = ['taken', 'reserved', 'invalid-format'] as const;
type Refusal = (typeof REFUSALS)[number];
const isRefusal = (value: unknown): value is Refusal => REFUSALS.includes(value as Refusal);

/**
 * Ask the API whether a name is free. Never throws. Anything but a well-formed
 * answer — a network error, a 429, a 503, an abort, an unexpected body — is
 * `unknown`.
 */
export async function checkUsernameAvailability(
  username: string,
  signal?: AbortSignal,
): Promise<UsernameCheck> {
  try {
    const body = await apiFetch<{ available?: unknown; reason?: unknown }>(
      `/auth/username-available?username=${encodeURIComponent(username)}`,
      { signal },
    );
    if (body.available === true && body.reason === 'ok') return 'available';
    if (body.available === false && isRefusal(body.reason)) return body.reason;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export type ClaimUsernameResult =
  | { ok: true }
  | { ok: false; reason: Refusal }
  | { ok: false; reason: 'error'; error: string };

/**
 * Claim a username for the signed-in user. Returns `{ error }`-style results
 * rather than throwing, like `signInWithIdentifier`.
 *
 * `already-chosen` comes back as success: it means this account already has a
 * chosen name (a second tab, a double tap), and the caller should simply move on.
 */
export async function claimUsername(username: string): Promise<ClaimUsernameResult> {
  try {
    const body = await apiFetch<{ claimed?: unknown; reason?: unknown }>('/auth/username', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    if (body.claimed === true || body.reason === 'already-chosen') return { ok: true };
    if (isRefusal(body.reason)) return { ok: false, reason: body.reason };
    return { ok: false, reason: 'error', error: 'Could not save your username. Try again.' };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      error: err instanceof Error ? err.message : 'Could not save your username. Try again.',
    };
  }
}

export type ProfileState =
  /** The user chose their username; nothing to ask. */
  | { status: 'ok' }
  /**
   * The username was built for them (from an OAuth profile or email, or
   * suffixed to avoid a clash), or they have no profile row at all.
   * `username` is what to pre-fill — null when there is no row.
   */
  | { status: 'needs-username'; username: string | null }
  /** Could not tell. Callers carry on as if `ok`: the prompt is a courtesy. */
  | { status: 'unknown' };

/**
 * Does the signed-in user still need to choose a username? Reads only.
 *
 * The `on_auth_user_created` database trigger is the single writer of new
 * profiles. (Mobile used to insert one after OAuth, duplicating the trigger —
 * and once the profiles_username_format CHECK went live that insert failed
 * silently for any name with a dot or an accent.) A user with no row at all is
 * recovered by the choose-username screen, whose claim creates it.
 *
 * Every failure is `unknown`, never `needs-username`: a network blip must not
 * push someone who already chose a name back through the chooser.
 */
export async function getProfileState(): Promise<ProfileState> {
  try {
    const { supabase } = await import('@gameexplorer/db');
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { status: 'unknown' };

    const { data, error } = await supabase
      .from('profiles')
      .select('username, username_status')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (error) return { status: 'unknown' };
    if (!data) return { status: 'needs-username', username: null };

    const row = data as { username: string | null; username_status?: string | null };
    // Before supabase-username-claim-part1.sql the column does not exist and the
    // select above errors (→ unknown). A row without a status is treated the
    // same way rather than guessed at.
    if (!row.username_status) return { status: 'unknown' };
    if (row.username_status === 'chosen') return { status: 'ok' };
    return { status: 'needs-username', username: row.username };
  } catch {
    return { status: 'unknown' };
  }
}

// ── The decisions ───────────────────────────────────────────────────────────

/** A server answer and the exact (trimmed) name it answered for. */
export interface UsernameCheckSnapshot {
  username: string;
  result: UsernameCheck;
}

export type UsernameFieldStatus =
  /** Nothing typed yet. */
  | 'empty'
  /** Fails the local rules; `reason` says which. No request is made. */
  | 'invalid'
  /** Locally fine, and no answer for exactly this name yet. */
  | 'checking'
  | 'available'
  /** The server refused it; `reason` says why. */
  | 'unavailable'
  /** The server could not be asked. Says nothing, blocks nothing. */
  | 'unknown';

export interface UsernameFieldState {
  status: UsernameFieldStatus;
  reason: UsernameReason | null;
  /** Shown as the field's error. Absent when nothing is wrong. */
  error?: string;
  /** Shown under the field when there is no error. */
  hint: string;
}

export interface UsernameFieldOptions {
  /**
   * The name the user already holds (the choose-username screen pre-fills it).
   * It is always "available" to its owner — the server would otherwise answer
   * `taken`, because it is.
   */
  currentUsername?: string | null;
}

const AVAILABLE_HINT = 'Available';

/**
 * Everything the username field shows, from what is typed and the latest
 * server answer. Pure.
 *
 * The stale-response guard lives here: an answer counts only if it is for
 * exactly the name now in the field. A slow reply for "bob" can never mark
 * "bobby" as taken, however the requests interleave.
 */
export function usernameFieldState(
  raw: string,
  check: UsernameCheckSnapshot | null,
  options: UsernameFieldOptions = {},
): UsernameFieldState {
  const value = raw.trim();
  if (value === '') return { status: 'empty', reason: null, hint: USERNAME_HINT };

  const local = validateUsername(value);
  if (local !== 'ok') {
    // Too short is where every name starts, so it stays a hint while typing
    // rather than an error on the first keystroke. It still blocks submit.
    return local === 'too-short'
      ? { status: 'invalid', reason: local, hint: USERNAME_HINT }
      : { status: 'invalid', reason: local, error: usernameReasonMessage(local), hint: USERNAME_HINT };
  }

  const own = options.currentUsername?.trim();
  if (own && own.toLowerCase() === value.toLowerCase()) {
    return { status: 'available', reason: 'ok', hint: AVAILABLE_HINT };
  }

  if (!check || check.username !== value) {
    return { status: 'checking', reason: null, hint: USERNAME_HINT };
  }

  switch (check.result) {
    case 'available':
      return { status: 'available', reason: 'ok', hint: AVAILABLE_HINT };
    case 'unknown':
      return { status: 'unknown', reason: null, hint: USERNAME_HINT };
    default:
      return {
        status: 'unavailable',
        reason: check.result,
        error: usernameReasonMessage(check.result),
        hint: USERNAME_HINT,
      };
  }
}

/**
 * May the form be submitted with this username?
 *
 * True for `available` AND for `unknown`. That second case is the whole "an API
 * outage must not block sign-up" invariant in one line; the database's unique
 * index is what actually protects the name.
 *
 * `checking` blocks, but only briefly: the hook gives up on a slow answer and
 * turns it into `unknown` (see USERNAME_CHECK_TIMEOUT_MS).
 */
export function canSubmitUsername(state: UsernameFieldState): boolean {
  return state.status === 'available' || state.status === 'unknown';
}
